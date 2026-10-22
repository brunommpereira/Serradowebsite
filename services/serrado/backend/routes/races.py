"""
Inscrições no Troféu de Almada (Xistarca): o atleta ou o encarregado pede na área do atleta, a secretaria
acompanha no backoffice e o envio à Xistarca é feito por serrado.xistarca (em segundo plano e pelo timer).
"""

import asyncio
import logging
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ... import xistarca
from ...config import config
from ...db.pool import Pool, fetch, fetch_one, tx
from ...trophy_import import ListRow, import_list
from ...validation import is_valid_id_number, is_valid_phone
from ..core import HttpError, actor, audit, camel, not_found, pool, require
from .athletes import DATE, AthleteId, _valid_date, require_access

log = logging.getLogger("serrado.races")
Id = Annotated[int, Path(ge=1)]
# Vazio enquanto a Xistarca não abre o evento (o site mostra as provas, mas ainda não aceita pedidos)
EVENT_URL = r"^(https://checkout\.xistarca\.pt/evento/[A-Za-z0-9._~%-]{3,200})?$"
STATES = ("pedido", "validado", "inscrito", "erro", "cancelado")


class Edition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    season: Annotated[str, StringConstraints(pattern=r"^\d{4}/\d{4}$")]
    name: Annotated[str, StringConstraints(min_length=3, max_length=120)]
    eventUrl: Annotated[str, StringConstraints(pattern=EVENT_URL)]
    modalityId: Annotated[str, StringConstraints(pattern=r"^\d{0,10}$")] = ""
    teamName: Annotated[str, StringConstraints(min_length=2, max_length=30)] = "Serrado FC"
    clubOption: Annotated[str, StringConstraints(min_length=2, max_length=120)] = "Serrado FC / Outdoor Training Camp"
    opensOn: Annotated[str, StringConstraints(pattern=DATE)] | None = None
    closesOn: Annotated[str, StringConstraints(pattern=DATE)] | None = None
    mode: Literal["test", "live"] = "test"
    active: bool = True

    _dates = field_validator("opensOn", "closesOn")(_valid_date)


class Race(BaseModel):
    model_config = ConfigDict(extra="forbid")
    round: Annotated[int, Field(ge=1, le=40)]
    name: Annotated[str, StringConstraints(min_length=3, max_length=160)]
    raceDate: Annotated[str, StringConstraints(pattern=DATE)] | None = None
    # Quando a data ainda não está definida: «janeiro de 2027», «a definir»
    dateLabel: Annotated[str, StringConstraints(max_length=40)] = ""
    location: Annotated[str, StringConstraints(max_length=120)] | None = None
    infoUrl: Annotated[str, StringConstraints(pattern=r"^https://[^\s]{3,300}$")] | None = None

    _date = field_validator("raceDate")(_valid_date)


class Calendar(BaseModel):
    races: list[Race] = Field(max_length=40)


class SignupRequest(BaseModel):
    """Pedido do atleta/encarregado. Só preenche dados que ainda estejam vazios na ficha."""

    model_config = ConfigDict(extra="forbid")
    consent: Literal[True]
    gender: Literal["Feminino", "Masculino"] | None = None
    idNumber: Annotated[str, StringConstraints(max_length=20)] | None = None
    city: Annotated[str, StringConstraints(max_length=100)] | None = None
    phone: Annotated[str, StringConstraints(max_length=20)] | None = None
    emergencyName: Annotated[str, StringConstraints(max_length=120)] | None = None
    emergencyPhone: Annotated[str, StringConstraints(max_length=20)] | None = None


class StaffSignup(BaseModel):
    athleteIds: list[Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F-]{36}$")]] = Field(min_length=1, max_length=200)


class ListImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rows: list[ListRow] = Field(min_length=1, max_length=2000)
    dryRun: bool = False


def configured() -> bool:
    return bool(config.xistarca.email and config.xistarca.password)


def missing_for_trophy(a: dict[str, Any]) -> list[str]:
    """O que a Xistarca exige e falta na ficha (nomes como no formulário do site)."""
    out = []
    if not a.get("birth_date"):
        out.append("birthDate")
    if a.get("gender") not in ("Feminino", "Masculino"):
        out.append("gender")
    if not a.get("id_number"):
        out.append("idNumber")
    if not (a.get("emergency_name") and a.get("emergency_phone")):
        out.append("emergency")
    return out


def is_open(e: dict[str, Any], today: date | None = None) -> bool:
    today = today or date.today()
    return (
        bool(e["active"])
        and bool(e["event_url"])
        and (not e["opens_on"] or e["opens_on"] <= today)
        and (not e["closes_on"] or today <= e["closes_on"])
    )


def kick(req: Request) -> bool:
    """Corre o envio à Xistarca em segundo plano (o timer do servidor apanha o que ficar por fazer)."""
    if not configured():
        return False
    tasks: set[asyncio.Task[Any]] = req.app.state.__dict__.setdefault("xistarca_tasks", set())
    if any(not t.done() for t in tasks):
        return True
    p: Pool = pool(req)

    async def go() -> None:
        try:
            s = await xistarca.run(p)
            log.info("xistarca: %s", s)
        except Exception:  # noqa: BLE001 — um erro aqui não pode derrubar o backend
            log.exception("xistarca: envio falhou")

    t = asyncio.create_task(go())
    tasks.add(t)
    t.add_done_callback(tasks.discard)
    return True


async def _edition(db: Any, edition_id: int) -> dict[str, Any]:
    row = await fetch_one(db, "select * from race_editions where id = %s", [edition_id])
    if not row:
        raise not_found()
    return row


def _edition_out(e: dict[str, Any]) -> dict[str, Any]:
    out = camel(e)
    out["open"] = is_open(e)
    return out


def register(r: APIRouter) -> None:
    tags: list[Any] = ["Troféu de Almada · inscrições"]

    # ------------------------------------------------------------- área do atleta
    @r.get("/athletes/{id}/trophy", tags=tags, summary="Edição ativa do Troféu, provas e estado da inscrição deste atleta")
    async def trophy(req: Request, id: AthleteId) -> dict[str, Any]:
        access = await require_access(req, id)
        e = await fetch_one(pool(req), "select * from race_editions where active order by season desc limit 1")
        if not e:
            return {"edition": None, "races": [], "signup": None, "missing": [], "canSignup": False}
        a = await fetch_one(
            pool(req), "select birth_date, gender, id_number, emergency_name, emergency_phone, sport_slug from athletes where id = %s", [id]
        )
        if not a:
            raise not_found()
        races = await fetch(
            pool(req),
            "select round, name, race_date, date_label, location, info_url from race_calendar where edition_id = %s order by round",
            [e["id"]],
        )
        s = await fetch_one(
            pool(req), "select id, status, message, requested_at, sent_at from race_signups where edition_id = %s and athlete_id = %s", [e["id"], id]
        )
        return {
            "edition": {k: v for k, v in _edition_out(e).items() if k in ("id", "season", "name", "opensOn", "closesOn", "open")},
            "races": [camel(x) for x in races],
            "signup": camel(s) if s else None,
            "missing": missing_for_trophy(a),
            "canSignup": access != "treinador" and is_open(e),
        }

    @r.post("/athletes/{id}/trophy/signup", tags=tags, summary="Pedir a inscrição no Troféu (com autorização para enviar os dados à Xistarca)")
    async def signup(req: Request, id: AthleteId, body: SignupRequest) -> dict[str, Any]:
        access = await require_access(req, id, write=True)
        who = actor(req)
        if body.idNumber and not is_valid_id_number(body.idNumber):
            raise HttpError(422, "invalid_id_number", "N.º do CC inválido")
        for ph in (body.phone, body.emergencyPhone):
            if ph and not is_valid_phone(ph):
                raise HttpError(422, "invalid_phone", "Telefone inválido")
        async with tx(pool(req)) as c:
            e = await fetch_one(c, "select * from race_editions where active order by season desc limit 1")
            if not e or not is_open(e):
                raise HttpError(409, "closed", "As inscrições no Troféu não estão abertas")
            # Só completa o que está vazio: alterar dados de identificação continua a ser por pedido à secretaria
            fills = {
                "gender": body.gender,
                "id_number": body.idNumber and body.idNumber.strip().upper(),
                "city": body.city and body.city.strip(),
                "phone": body.phone and body.phone.strip(),
                "emergency_name": body.emergencyName and body.emergencyName.strip(),
                "emergency_phone": body.emergencyPhone and body.emergencyPhone.strip(),
            }
            filled = [k for k, v in fills.items() if v]
            for k in filled:
                await c.execute(f"update athletes set {k} = %s, updated_at = now() where id = %s and coalesce({k}, '') = ''", [fills[k], id])  # noqa: S608 — k é da lista fixa
            a = await fetch_one(c, "select birth_date, gender, id_number, emergency_name, emergency_phone from athletes where id = %s", [id])
            if not a:
                raise not_found()
            miss = missing_for_trophy(a)
            if miss:
                labels = {"birthDate": "data de nascimento", "gender": "género", "idNumber": "n.º do CC", "emergency": "contacto de emergência"}
                raise HttpError(422, "missing_data", "Faltam dados obrigatórios para a Xistarca: " + ", ".join(labels[m] for m in miss))
            cur = await c.execute(
                """insert into race_signups (edition_id, athlete_id, requested_by, consent_at) values (%s, %s, %s, now())
                   on conflict (edition_id, athlete_id) do update
                      set status = 'pedido', attempts = 0, message = '', requested_by = excluded.requested_by,
                          requested_at = now(), consent_at = now()
                    where race_signups.status in ('erro', 'cancelado')
                   returning id, status""",
                [e["id"], id, who.id],
            )
            row = await cur.fetchone()
            if not row:
                raise HttpError(409, "already", "Este atleta já tem um pedido de inscrição")
            await audit(c, who, "races.signup", "athletes", id, {"edition": e["season"], "by": access, "filled": filled})
        queued = kick(req)
        return {"id": row["id"], "status": row["status"], "queued": queued}

    @r.delete("/athletes/{id}/trophy/signup", tags=tags, summary="Cancelar o pedido (antes de estar inscrito)")
    async def cancel_mine(req: Request, id: AthleteId) -> dict[str, bool]:
        await require_access(req, id, write=True)
        async with tx(pool(req)) as c:
            n = await c.execute(
                """update race_signups set status = 'cancelado' where athlete_id = %s and status in ('pedido', 'validado', 'erro')
                     and edition_id = (select id from race_editions where active order by season desc limit 1)""",
                [id],
            )
            if not n.rowcount:
                raise HttpError(409, "not_cancellable", "Não há pedido por cancelar (se já está inscrito, fala com a secretaria)")
            await audit(c, actor(req), "races.cancel", "athletes", id)
        return {"ok": True}

    # ------------------------------------------------------------- backoffice
    @r.get("/races/editions", tags=tags, summary="Edições do Troféu (com contagens por estado)")
    async def editions(req: Request) -> dict[str, Any]:
        require(req, "athletes.manage")
        rows = await fetch(
            pool(req),
            """select e.*, coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from race_signups s
                                       where s.edition_id = e.id group by status) x), '{}') as counts
                 from race_editions e order by season desc""",
        )
        cal = await fetch(
            pool(req), "select edition_id, round, name, race_date, date_label, location, info_url from race_calendar order by edition_id, round"
        )
        out = []
        for e in rows:
            item = _edition_out(e)
            item["races"] = [camel({k: v for k, v in x.items() if k != "edition_id"}) for x in cal if x["edition_id"] == e["id"]]
            out.append(item)
        return {"configured": configured(), "editions": out}

    @r.post("/races/editions", tags=tags, summary="Nova edição", status_code=201)
    async def create_edition(req: Request, body: Edition) -> dict[str, Any]:
        require(req, "athletes.manage")
        async with tx(pool(req)) as c:
            if body.active:
                await c.execute("update race_editions set active = false")
            try:
                cur = await c.execute(
                    """insert into race_editions (season, name, event_url, modality_id, team_name, club_option, opens_on, closes_on, mode, active)
                       values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning *""",
                    [
                        body.season,
                        body.name,
                        body.eventUrl,
                        body.modalityId,
                        body.teamName,
                        body.clubOption,
                        body.opensOn,
                        body.closesOn,
                        body.mode,
                        body.active,
                    ],
                )
            except Exception as ex:
                if "unique" in str(ex).lower():
                    raise HttpError(409, "duplicate", "Já existe uma edição para esta época") from None
                raise
            row = await cur.fetchone()
            assert row is not None
            await audit(c, actor(req), "races.edition_create", "race_editions", row["id"], {"season": body.season})
        return _edition_out(row)

    @r.put("/races/editions/{edition_id}", tags=tags, summary="Alterar edição (modo test/live, datas, endereço)")
    async def update_edition(req: Request, edition_id: Id, body: Edition) -> dict[str, Any]:
        require(req, "athletes.manage")
        async with tx(pool(req)) as c:
            await _edition(c, edition_id)
            if body.active:
                await c.execute("update race_editions set active = false where id <> %s", [edition_id])
            cur = await c.execute(
                """update race_editions set season = %s, name = %s, event_url = %s, modality_id = %s, team_name = %s, club_option = %s,
                          opens_on = %s, closes_on = %s, mode = %s, active = %s where id = %s returning *""",
                [
                    body.season,
                    body.name,
                    body.eventUrl,
                    body.modalityId,
                    body.teamName,
                    body.clubOption,
                    body.opensOn,
                    body.closesOn,
                    body.mode,
                    body.active,
                    edition_id,
                ],
            )
            row = await cur.fetchone()
            assert row is not None
            await audit(c, actor(req), "races.edition_update", "race_editions", edition_id, {"mode": body.mode, "active": body.active})
        return _edition_out(row)

    @r.put("/races/editions/{edition_id}/calendar", tags=tags, summary="Provas da edição (substitui a lista)")
    async def set_calendar(req: Request, edition_id: Id, body: Calendar) -> dict[str, int]:
        require(req, "athletes.manage")
        if len({x.round for x in body.races}) != len(body.races):
            raise HttpError(422, "duplicate_round", "Há duas provas com o mesmo número")
        async with tx(pool(req)) as c:
            await _edition(c, edition_id)
            await c.execute("delete from race_calendar where edition_id = %s", [edition_id])
            for x in body.races:
                await c.execute(
                    "insert into race_calendar (edition_id, round, name, race_date, date_label, location, info_url) values (%s, %s, %s, %s, %s, %s, %s)",
                    [edition_id, x.round, x.name, x.raceDate, "" if x.raceDate else (x.dateLabel.strip() or "a definir"), x.location, x.infoUrl],
                )
            await audit(c, actor(req), "races.calendar", "race_editions", edition_id, {"races": len(body.races)})
        return {"races": len(body.races)}

    @r.get("/races/editions/{edition_id}/signups", tags=tags, summary="Pedidos de inscrição (filtro: status)")
    async def signups(
        req: Request, edition_id: Id, status: Annotated[str | None, Query(pattern="^(" + "|".join(STATES) + ")$")] = None
    ) -> list[dict[str, Any]]:
        require(req, "athletes.manage")
        rows = await fetch(
            pool(req),
            f"""select s.id, s.status, s.message, s.attempts, s.requested_at, s.last_attempt_at, s.sent_at,
                       a.id as athlete_id, a.code, a.name, a.category, a.birth_date, a.gender, a.id_number, a.emergency_name, a.emergency_phone,
                       u.name as requested_by_name
                  from race_signups s join athletes a on a.id = s.athlete_id left join users u on u.id = s.requested_by
                 where s.edition_id = %s {"and s.status = %s" if status else ""}
                 order by s.requested_at desc""",  # noqa: S608 — filtro fixo
            [edition_id, *([status] if status else [])],
        )
        out = []
        for x in rows:
            item = camel({k: v for k, v in x.items() if k not in ("id_number", "emergency_name", "emergency_phone", "gender")})
            item["missing"] = missing_for_trophy(x)
            out.append(item)
        return out

    @r.post("/races/editions/{edition_id}/signups", tags=tags, summary="A secretaria inscreve atletas (pedido em nome do clube)")
    async def staff_signup(req: Request, edition_id: Id, body: StaffSignup) -> dict[str, Any]:
        require(req, "athletes.manage")
        who = actor(req)
        added = 0
        async with tx(pool(req)) as c:
            await _edition(c, edition_id)
            for aid in dict.fromkeys(body.athleteIds):
                cur = await c.execute(
                    """insert into race_signups (edition_id, athlete_id, requested_by, consent_at)
                       select %s, id, %s, now() from athletes where id = %s
                       on conflict (edition_id, athlete_id) do update set status = 'pedido', attempts = 0, message = '', requested_at = now()
                        where race_signups.status in ('erro', 'cancelado')""",
                    [edition_id, who.id, aid],
                )
                added += cur.rowcount
            await audit(c, who, "races.staff_signup", "race_editions", edition_id, {"athletes": added})
        return {"added": added, "queued": kick(req) if added else False}

    @r.post("/races/editions/{edition_id}/import", tags=tags, summary="Lista de inscritos da Xistarca: marca inscritos e cria quem falta")
    async def import_xistarca_list(req: Request, edition_id: Id, body: ListImport) -> dict[str, Any]:
        require(req, "athletes.manage")
        async with tx(pool(req)) as c:
            await _edition(c, edition_id)
            # Pré-visualização: faz tudo e desfaz no fim
            async with c.transaction(force_rollback=body.dryRun):
                res = await import_list(c, actor(req), edition_id, body.rows)
        return {
            "dryRun": body.dryRun,
            "rows": res.rows,
            "matched": res.matched,
            "created": res.created,
            "completed": res.completed,
            "marked": res.marked,
            "already": res.already,
            "createdNames": res.created_names,
            "skipped": res.skipped,
            "notes": res.notes,
            "notInList": res.not_in_list,
        }

    @r.post("/races/signups/{signup_id}/{action}", tags=tags, summary="retry · cancel · done (marcar inscrito à mão)")
    async def act(req: Request, signup_id: Id, action: Annotated[str, Path(pattern="^(retry|cancel|done)$")]) -> dict[str, Any]:
        require(req, "athletes.manage")
        sets = {
            "retry": ("status = 'pedido', attempts = 0, message = ''", ("erro", "cancelado", "validado", "pedido")),
            "cancel": ("status = 'cancelado'", ("pedido", "validado", "erro")),
            "done": ("status = 'inscrito', sent_at = coalesce(sent_at, now()), message = 'Marcado à mão pela secretaria'", STATES),
        }
        sql, allowed = sets[action]
        async with tx(pool(req)) as c:
            cur = await c.execute(
                f"update race_signups set {sql} where id = %s and status = any(%s) returning id, status", [signup_id, list(allowed)]
            )  # noqa: S608 — sql fixo
            row = await cur.fetchone()
            if not row:
                raise HttpError(409, "invalid_state", "Este pedido não está num estado que permita essa ação")
            await audit(c, actor(req), f"races.{action}", "race_signups", signup_id)
        return {"id": row["id"], "status": row["status"], "queued": kick(req) if action == "retry" else False}

    @r.post("/races/run", tags=tags, summary="Enviar já os pedidos em fila (em segundo plano)", status_code=202)
    async def run_now(req: Request) -> dict[str, bool]:
        require(req, "athletes.manage")
        if not configured():
            raise HttpError(409, "not_configured", "A conta Xistarca do clube ainda não está configurada no servidor (sudo serrado xistarca)")
        return {"queued": kick(req)}

    @r.post("/races/editions/{edition_id}/check", tags=tags, summary="Testar o login e ler o evento na Xistarca")
    async def check(req: Request, edition_id: Id) -> dict[str, Any]:
        require(req, "athletes.manage")
        if not configured():
            raise HttpError(409, "not_configured", "A conta Xistarca do clube ainda não está configurada no servidor (sudo serrado xistarca)")
        e = await _edition(pool(req), edition_id)
        if not e["event_url"]:
            return {"ok": False, "message": "Falta o endereço do evento na Xistarca (Alterar edição)."}
        try:
            msg = await asyncio.wait_for(xistarca.check(config.xistarca, e["event_url"]), timeout=8)
        except xistarca.XistarcaError as ex:
            return {"ok": False, "message": str(ex)}
        except TimeoutError:
            return {"ok": False, "message": "a Xistarca demorou demasiado a responder"}
        return {"ok": True, "message": msg}
