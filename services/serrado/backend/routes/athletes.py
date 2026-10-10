"""Atletas: fichas, documentos, pedidos de alteração de identificação e resultados."""

from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ...db.pool import Jsonb, fetch, fetch_one, tx
from ...registry import claim_athletes
from ...validation import current_season, is_valid_id_number, is_valid_nif, is_valid_phone
from ..core import HttpError, actor, audit, camel, can, forbidden, not_found, pool, require, require_user, snake

EMAIL = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
DATE = r"^\d{4}-\d{2}-\d{2}$"


def _valid_date(v: str | None) -> str | None:
    if v is not None:
        try:
            date.fromisoformat(v)
        except ValueError:
            raise ValueError("data inválida (AAAA-MM-DD)") from None
    return v


class Editable(BaseModel):
    """Campos que o encarregado/atleta pode alterar diretamente."""

    model_config = ConfigDict(extra="forbid")
    email: Annotated[str, StringConstraints(max_length=200, pattern=EMAIL)] = None  # type: ignore[assignment]
    phone: Annotated[str, StringConstraints(max_length=20)] = None  # type: ignore[assignment]
    address: Annotated[str, StringConstraints(max_length=300)] = None  # type: ignore[assignment]
    postalCode: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{3}$")] = None  # type: ignore[assignment]
    city: Annotated[str, StringConstraints(max_length=100)] = None  # type: ignore[assignment]
    idExpiry: Annotated[str, StringConstraints(pattern=DATE)] = None  # type: ignore[assignment]
    shirtSize: Annotated[str, StringConstraints(max_length=5)] = None  # type: ignore[assignment]
    shirtType: Literal["Normal", "Alças"] | None = None
    emergencyName: Annotated[str, StringConstraints(max_length=120)] = None  # type: ignore[assignment]
    emergencyPhone: Annotated[str, StringConstraints(max_length=20)] = None  # type: ignore[assignment]
    consentRgpd: bool = None  # type: ignore[assignment]
    consentImage: bool = None  # type: ignore[assignment]

    _date = field_validator("idExpiry")(_valid_date)


class Identity(BaseModel):
    """Dados de identificação: só mudam por pedido validado pela secretaria."""

    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(min_length=3, max_length=160)] = None  # type: ignore[assignment]
    birthDate: Annotated[str, StringConstraints(pattern=DATE)] = None  # type: ignore[assignment]
    gender: Literal["Feminino", "Masculino"] = None  # type: ignore[assignment]
    idNumber: str = None  # type: ignore[assignment]
    taxNumber: str = None  # type: ignore[assignment]

    _date = field_validator("birthDate")(_valid_date)


IDENTITY = set(Identity.model_fields)


class ChangeRequest(BaseModel):
    changes: Identity


class Note(BaseModel):
    note: str = Field(min_length=3, max_length=500)


class DocNote(BaseModel):
    note: str = Field(min_length=3, max_length=300)


# Campos que o treinador não vê (minimização de dados)
SENSITIVE = ("idNumber", "idExpiry", "taxNumber", "address", "postalCode")

AthleteId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
Id = Annotated[int, Path(ge=1)]

Access = Literal["staff", "treinador", "encarregado", "co-encarregado", "atleta"]


async def access_of(req: Request, athlete_id: str) -> str | None:
    """Relação de quem pede com o atleta (None = sem acesso)."""
    if can(req, "athletes.manage"):
        return "staff"
    who = actor(req)
    if who.id:
        row = await fetch_one(pool(req), "select role from athlete_access where user_id = %s and athlete_id = %s", [who.id, athlete_id])
        if row:
            return str(row["role"])
    return "treinador" if can(req, "athletes.view") else None


async def require_access(req: Request, athlete_id: str, write: bool = False) -> str:
    access = await access_of(req, athlete_id)
    if not access or (write and access == "treinador"):
        raise forbidden()
    return access


def missing_fields(a: dict[str, Any]) -> list[str]:
    def has(k: str) -> bool:
        return a.get(k) not in (None, "")

    checks = [
        (has("gender"), "Género"),
        (has("idNumber"), "N.º CC"),
        (has("taxNumber"), "NIF"),
        (has("email"), "Email"),
        (has("phone"), "Telemóvel"),
        (has("address") and has("postalCode") and has("city"), "Morada"),
        (has("shirtSize"), "Tamanho da t-shirt"),
        (has("emergencyName") and has("emergencyPhone"), "Contacto de emergência"),
        (a.get("consentRgpd") is True, "Consentimento RGPD"),
    ]
    return [label for ok, label in checks if not ok]


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Atletas"]
    office: list[str | Any] = ["Backoffice · Atletas"]

    @r.get("/athletes", tags=tags, summary="Atletas: os acessíveis pelo utilizador, ou todos (staff com scope=all)")
    async def list_athletes(
        req: Request,
        scope: Literal["mine", "all"] = "mine",
        q: Annotated[str | None, Query(max_length=100)] = None,
        sport: Annotated[str | None, Query(max_length=40)] = None,
        pending: Literal["docs", "confirm", "requests"] | None = None,
    ) -> list[dict[str, Any]]:
        season = current_season().start
        where: list[str] = []
        args: list[Any] = []
        if scope == "all":
            require(req, "athletes.view", "athletes.manage")
        else:
            user = require_user(req)
            # Fichas com o email desta conta (importadas só com o email de contacto) ficam ligadas à conta
            async with tx(pool(req)) as c:
                await claim_athletes(c, user)
            where.append("a.id in (select athlete_id from athlete_access where user_id = %s)")
            args.append(user)
        if q:
            where.append("(a.name ilike %s or a.code ilike %s)")
            args += [f"%{q}%", f"%{q}%"]
        if sport:
            where.append("a.sport_slug = %s")
            args.append(sport)
        if pending == "docs":
            where.append(
                "exists (select 1 from athlete_documents d where d.athlete_id = a.id and d.status in ('Em análise', 'Rejeitado', 'Em falta'))"
            )
        if pending == "confirm":
            where.append("(a.confirmed_at is null or a.confirmed_at < %s::date)")
            args.append(season)
        if pending == "requests":
            where.append("exists (select 1 from athlete_change_requests r where r.athlete_id = a.id and r.status = 'pendente')")
        rows = await fetch(
            pool(req),
            f"""select a.id, a.code, a.name, a.birth_date, a.sport_slug, a.category, a.confirmed_at,
                  (a.confirmed_at is not null and a.confirmed_at >= %s::date) as confirmed,
                  (select count(*)::int from athlete_documents d where d.athlete_id = a.id and d.status = 'Aprovado') as docs_approved,
                  (select count(*)::int from athlete_documents d where d.athlete_id = a.id) as docs_total,
                  (select count(*)::int from athlete_documents d where d.athlete_id = a.id and d.status = 'Em análise') as docs_to_review,
                  (select count(*)::int from athlete_change_requests r where r.athlete_id = a.id and r.status = 'pendente') as pending_requests
                from athletes a {"where " + " and ".join(where) if where else ""} order by a.name""",
            [season, *args],
        )
        return [camel(x) for x in rows]

    @r.get("/athletes/{id}", tags=tags, summary="Ficha do atleta, documentos e pedidos pendentes")
    async def athlete(req: Request, id: AthleteId) -> dict[str, Any]:
        access = await require_access(req, id)
        row = await fetch_one(pool(req), "select * from athletes where id = %s", [id])
        if not row:
            raise not_found("Atleta")
        a = camel(row)
        if access in ("staff", "treinador") and not can(req, "athletes.sensitive"):
            for k in SENSITIVE:
                a.pop(k, None)
        docs = await fetch(pool(req), "select id, kind, status, note, updated_at from athlete_documents where athlete_id = %s order by id", [id])
        reqs = await fetch(
            pool(req),
            "select id, changes, status, note, requested_at from athlete_change_requests where athlete_id = %s and status = 'pendente' order by requested_at",
            [id],
        )
        season = current_season()
        return {
            **a,
            "access": access,
            "season": season.label,
            "confirmed": bool(a.get("confirmedAt")) and str(a["confirmedAt"]) >= season.start,
            "missing": missing_fields(a),
            "documents": [camel(x) for x in docs],
            "pendingRequests": [camel(x) for x in reqs],
        }

    @r.patch("/athletes/{id}", tags=tags, summary="Altera contactos, emergência, equipamento e consentimentos")
    async def update_athlete(req: Request, id: AthleteId, body: Editable) -> dict[str, Any]:
        await require_access(req, id, write=True)
        data = body.model_dump(exclude_unset=True)
        if not data:
            raise HttpError(400, "validation", "body: tem de ter pelo menos um campo")
        for k, label in (("phone", "Telemóvel inválido"), ("emergencyPhone", "Telefone de emergência inválido")):
            v = data.get(k)
            if isinstance(v, str) and v and not is_valid_phone(v):
                raise HttpError(400, "invalid_phone", label)
        keys = list(data)
        async with tx(pool(req)) as c:
            sets = ", ".join(f"{snake(k)} = %s" for k in keys)
            cur = await c.execute(f"update athletes set {sets} where id = %s returning *", [*(data[k] for k in keys), id])
            row = await cur.fetchone()
            if not row:
                raise not_found("Atleta")
            await audit(c, actor(req), "athletes.update", "athletes", id, {"fields": keys})
        return camel(row)

    @r.post("/athletes/{id}/confirm", tags=tags, summary="Confirma a ficha para a época em curso")
    async def confirm(req: Request, id: AthleteId) -> dict[str, Any]:
        await require_access(req, id, write=True)
        row = await fetch_one(pool(req), "select * from athletes where id = %s", [id])
        if not row:
            raise not_found("Atleta")
        missing = missing_fields(camel(row))
        if missing:
            raise HttpError(422, "incomplete", f"Ficha incompleta: {', '.join(missing)}")
        season = current_season()
        async with tx(pool(req)) as c:
            cur = await c.execute("update athletes set confirmed_at = current_date where id = %s returning confirmed_at", [id])
            done = await cur.fetchone()
            await audit(c, actor(req), "athletes.confirm", "athletes", id, {"season": season.label})
        return {"id": id, "confirmedAt": done["confirmed_at"] if done else date.today().isoformat(), "season": season.label}

    @r.post(
        "/athletes/{id}/change-requests", tags=tags, summary="Pede alteração de dados de identificação (validação pela secretaria)", status_code=201
    )
    async def change_request(req: Request, id: AthleteId, body: ChangeRequest) -> dict[str, Any]:
        await require_access(req, id, write=True)
        changes = body.changes.model_dump(exclude_unset=True)
        if not changes:
            raise HttpError(400, "validation", "changes: tem de ter pelo menos um campo")
        if changes.get("taxNumber") and not is_valid_nif(changes["taxNumber"]):
            raise HttpError(400, "invalid_nif", "NIF inválido")
        if changes.get("idNumber") and not is_valid_id_number(changes["idNumber"]):
            raise HttpError(400, "invalid_id_number", "N.º de CC inválido")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "insert into athlete_change_requests (athlete_id, requested_by, changes) values (%s, %s, %s) returning *",
                [id, who.id, Jsonb(changes)],
            )
            row = await cur.fetchone()
            assert row is not None
            await audit(c, who, "athletes.change_request", "athletes", id, {"fields": list(changes)})
        return camel(row)

    @r.get("/athletes/{id}/results", tags=tags, summary="Resultados no Troféu de Almada")
    async def results(req: Request, id: AthleteId) -> list[dict[str, Any]]:
        await require_access(req, id)
        rows = await fetch(
            pool(req),
            """select r.id, ra.season, ra.round, ra.name as race, ra.base_name as race_base, ra.race_date as date, r.category, r.place, r.time, r.time_s,
                      r.distance_m, r.trophy_points
                 from results r join races ra on ra.id = r.race_id where r.athlete_id = %s order by ra.race_date desc""",
            [id],
        )
        return [camel(x) for x in rows]

    # ------------------------------------------------------------- backoffice: pedidos e documentos
    @r.get("/change-requests", tags=office, summary="Pedidos de alteração (secretaria)")
    async def change_requests(req: Request, status: Literal["pendente", "aprovado", "rejeitado"] = "pendente") -> list[dict[str, Any]]:
        require(req, "athletes.manage")
        rows = await fetch(
            pool(req),
            """select r.id, r.athlete_id, a.name as athlete_name, a.code as athlete_code, r.changes, r.status, r.note, r.requested_at, u.name as requested_by,
                      json_build_object('name', a.name, 'birthDate', a.birth_date, 'gender', a.gender, 'idNumber', a.id_number, 'taxNumber', a.tax_number) as current
                 from athlete_change_requests r join athletes a on a.id = r.athlete_id left join users u on u.id = r.requested_by
                where r.status = %s order by r.requested_at""",
            [status],
        )
        return [camel(x) for x in rows]

    @r.post("/change-requests/{id}/approve", tags=office, summary="Aprova e aplica a alteração")
    async def approve(req: Request, id: Id) -> dict[str, Any]:
        require(req, "athletes.manage")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute("select * from athlete_change_requests where id = %s and status = 'pendente' for update", [id])
            row = await cur.fetchone()
            if not row:
                raise not_found("Pedido pendente")
            changes: dict[str, Any] = row["changes"]
            keys = [k for k in changes if k in IDENTITY]
            # Única via autorizada para mudar dados de identificação (ver trigger protect_identity)
            await c.execute("select set_config('app.identity_change', 'on', true)")
            if keys:
                sets = ", ".join(f"{snake(k)} = %s" for k in keys)
                await c.execute(f"update athletes set {sets} where id = %s", [*(changes[k] for k in keys), row["athlete_id"]])
            await c.execute(
                "update athlete_change_requests set status = 'aprovado', reviewed_by = %s, reviewed_at = now() where id = %s", [who.id, id]
            )
            await audit(c, who, "change_requests.approve", "athletes", row["athlete_id"], {"request": id, "fields": keys})
        return {"id": id, "status": "aprovado"}

    @r.post("/change-requests/{id}/reject", tags=office, summary="Rejeita com motivo")
    async def reject(req: Request, id: Id, body: Note) -> dict[str, Any]:
        require(req, "athletes.manage")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "update athlete_change_requests set status = 'rejeitado', note = %s, reviewed_by = %s, reviewed_at = now() where id = %s and status = 'pendente' returning athlete_id",
                [body.note, who.id, id],
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Pedido pendente")
            await audit(c, who, "change_requests.reject", "athletes", row["athlete_id"], {"request": id, "note": body.note})
        return {"id": id, "status": "rejeitado"}

    @r.get("/documents", tags=office, summary="Documentos de inscrição por estado")
    async def documents(req: Request, status: Literal["Em análise", "Rejeitado", "Em falta", "Aprovado"] = "Em análise") -> list[dict[str, Any]]:
        require(req, "athletes.manage")
        rows = await fetch(
            pool(req),
            """select d.id, d.kind, d.status, d.note, d.updated_at, d.athlete_id, a.name as athlete_name, a.code as athlete_code
                 from athlete_documents d join athletes a on a.id = d.athlete_id where d.status = %s order by d.updated_at""",
            [status],
        )
        return [camel(x) for x in rows]

    async def _set_document(req: Request, id: int, action: str, status: str, note: str | None) -> dict[str, Any]:
        require(req, "athletes.manage")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "update athlete_documents set status = %s, note = %s, updated_at = now() where id = %s returning athlete_id, kind", [status, note, id]
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Documento")
            await audit(c, who, f"documents.{action}", "athletes", row["athlete_id"], {"document": id, "kind": row["kind"], "note": note})
        return {"id": id, "status": status, "note": note}

    @r.post("/documents/{id}/approve", tags=office, summary="Aprova documento")
    async def approve_document(req: Request, id: Id, _body: Annotated[dict[str, Any] | None, Body()] = None) -> dict[str, Any]:
        return await _set_document(req, id, "approve", "Aprovado", None)

    @r.post("/documents/{id}/reject", tags=office, summary="Rejeita documento (motivo obrigatório)")
    async def reject_document(req: Request, id: Id, body: DocNote) -> dict[str, Any]:
        return await _set_document(req, id, "reject", "Rejeitado", body.note)
