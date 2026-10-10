"""Backoffice: sócios e atletas criados à mão ou por ficheiro, contas ligadas e quotas avulsas."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from ...db.pool import fetch, fetch_one, tx
from ...registry import MAX_ROWS, AthleteIn, MemberIn, complete_pair, grant_access, import_rows, name_words, save_athlete, save_member, validate_rows
from ..core import HttpError, actor, audit, camel, can, forbidden, not_found, pool, require

Number = Annotated[str, Path(pattern=r"^\d{1,8}$")]
AthleteId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
UserId = AthleteId


SENSITIVE = {"idNumber", "idExpiry", "taxNumber", "address", "postalCode"}


def check_sensitive(req: Request, *models: BaseModel) -> None:
    """CC, NIF e morada dos atletas só os grava quem os pode ver (athletes.sensitive)."""
    if not can(req, "athletes.sensitive") and any(SENSITIVE & m.model_fields_set for m in models):
        raise forbidden()


class NewQuota(BaseModel):
    model_config = ConfigDict(extra="forbid")
    period: str = Field(min_length=3, max_length=40)
    amount: float = Field(gt=0, lt=1000)
    dueDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class Access(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", max_length=200)
    name: str = Field(min_length=2, max_length=160)
    role: Literal["encarregado", "co-encarregado", "atleta"] = "encarregado"


class ImportBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["members", "athletes"]
    rows: list[dict[str, Any]] = Field(min_length=1, max_length=MAX_ROWS)
    dryRun: bool = True


async def _member_detail(req: Request, number: str) -> dict[str, Any]:
    row = await fetch_one(
        pool(req),
        """select m.*, u.email as account_email, (u.password_hash <> '!') as account_has_password, u.last_login_at as account_last_login
             from members m left join users u on u.id = m.user_id where m.member_number = %s""",
        [number],
    )
    if not row:
        raise not_found("Sócio")
    out = camel(row)
    out["athletes"] = await fetch(
        pool(req), "select id, code, name, sport_slug as sport, category from athletes where member_number = %s order by name", [number]
    )
    out["quotas"] = [
        camel(q)
        for q in await fetch(
            pool(req),
            """select id, period, amount, due_date, paid_at, payment_method, receipt_number,
                      case when paid_at is not null then 'Pago' when due_date < current_date then 'Em atraso' else 'Pendente' end as status
                 from quotas where member_number = %s order by due_date desc limit 60""",
            [number],
        )
    ]
    return out


def match_reason(member: list[str], athlete: list[str], *, guardian: bool) -> tuple[int, str] | None:
    """Porque é que um atleta pode ser deste sócio (pontuação, motivo) — ou None."""
    if guardian:
        return 95, "O sócio é encarregado deste atleta no site"
    if not member or not athlete:
        return None
    if member == athlete:
        return 100, "Mesmo nome"
    if len(member) > 1 and len(athlete) > 1 and (member[0], member[-1]) == (athlete[0], athlete[-1]):
        return 80, "Primeiro e último nome iguais"
    if len(member[-1]) >= 3 and member[-1] == athlete[-1]:
        return 40, "Mesmo apelido (pode ser filho/a)"
    return None


def register(r: APIRouter) -> None:
    office: list[str | Any] = ["Backoffice · Sócios e atletas"]

    # ------------------------------------------------------------- sócios
    @r.get("/members", tags=office, summary="Sócios (filtros: q, status, category)")
    async def members(
        req: Request,
        q: Annotated[str | None, Query(max_length=100)] = None,
        status: Literal["Ativo", "Pendente", "Suspenso"] | None = None,
        category: Annotated[str | None, Query(max_length=40)] = None,
    ) -> list[dict[str, Any]]:
        require(req, "members.view")
        like = f"%{q}%" if q else None
        return await fetch(
            pool(req),
            """select m.member_number as "memberNumber", m.name, m.email, m.phone, m.category, m.status, m.joined_on as "joinedOn",
                      (m.user_id is not null) as "hasAccount",
                      (select count(*)::int from athletes a where a.member_number = m.member_number) as athletes,
                      (select count(*)::int from quotas qq where qq.member_number = m.member_number and qq.paid_at is null and qq.due_date < current_date) as overdue
                 from members m
                where (%s::text is null or m.name ilike %s or m.email ilike %s or m.member_number = lpad(%s, 5, '0'))
                  and (%s::text is null or m.status = %s) and (%s::text is null or m.category = %s)
                order by m.member_number limit 1000""",
            [like, like, like, q if q and q.isdigit() else "", status, status, category, category],
        )

    @r.get("/members/{number}/detail", tags=office, summary="Ficha do sócio: dados, conta no site, atletas e quotas")
    async def member_detail(req: Request, number: Number) -> dict[str, Any]:
        require(req, "members.view")
        return await _member_detail(req, number.zfill(5))

    @r.post("/members", tags=office, summary="Cria um sócio (sem n.º: o seguinte livre); com email, liga ou cria a conta no site", status_code=201)
    async def create_member(req: Request, body: MemberIn) -> dict[str, Any]:
        require(req, "members.manage")
        async with tx(pool(req)) as c:
            if body.memberNumber and await (await c.execute("select 1 from members where member_number = %s", [body.memberNumber])).fetchone():
                raise HttpError(409, "conflict", f"Já existe o sócio n.º {body.memberNumber}")
            number, _ = await save_member(c, actor(req), body)
        return await _member_detail(req, number)

    @r.put("/members/{number}", tags=office, summary="Altera os dados do sócio")
    async def update_member(req: Request, number: Number, body: MemberIn) -> dict[str, Any]:
        require(req, "members.manage")
        number = number.zfill(5)
        async with tx(pool(req)) as c:
            if not await (await c.execute("select 1 from members where member_number = %s", [number])).fetchone():
                raise not_found("Sócio")
            await save_member(c, actor(req), body.model_copy(update={"memberNumber": None}), number=number)
            # Atletas ligados que são a mesma pessoa: completa o que falta numa ficha e na outra
            for a in await (await c.execute("select id from athletes where member_number = %s", [number])).fetchall():
                await complete_pair(c, actor(req), number, str(a["id"]))
        return await _member_detail(req, number)

    @r.get(
        "/members/{number}/athlete-suggestions",
        tags=office,
        summary="Atletas que podem ser deste sócio (pelo nome ou por ser encarregado); com q, pesquisa",
    )
    async def athlete_suggestions(req: Request, number: Number, q: Annotated[str | None, Query(max_length=80)] = None) -> list[dict[str, Any]]:
        require(req, "members.view")
        require(req, "athletes.view")
        number = number.zfill(5)
        m = await fetch_one(pool(req), "select name, user_id from members where member_number = %s", [number])
        if not m:
            raise not_found("Sócio")
        rows = await fetch(
            pool(req),
            """select a.id, a.code, a.name, a.sport_slug as sport, a.category, a.birth_date, a.member_number,
                      exists(select 1 from athlete_access x where x.athlete_id = a.id and x.user_id = %s) as guardian
                 from athletes a where a.member_number is distinct from %s""",
            [m["user_id"], number],
        )
        out: list[dict[str, Any]] = []
        if q and q.strip():
            needle = name_words(q)
            for a in rows:
                words = name_words(a["name"])
                if needle and all(any(w.startswith(n) for w in words) for n in needle):
                    out.append({**camel(a), "score": 0, "reason": "Pesquisa"})
            return sorted(out, key=lambda x: x["name"])[:30]
        mine = name_words(m["name"])
        for a in rows:
            hit = match_reason(mine, name_words(a["name"]), guardian=a["guardian"])
            # Já ligado a outro sócio: só se mostra quando há forte indício (nome igual ou encarregado)
            if hit and (a["member_number"] is None or hit[0] >= 95):
                out.append({**camel(a), "score": hit[0], "reason": hit[1]})
        out.sort(key=lambda x: (-x["score"], x["name"]))
        return out[:30]

    @r.post("/members/{number}/athletes/{id}", tags=office, summary="Liga o atleta a este sócio (preenche o n.º de sócio na ficha do atleta)")
    async def link_athlete(req: Request, number: Number, id: AthleteId, force: Annotated[bool, Query()] = False) -> dict[str, Any]:
        require(req, "members.manage")
        require(req, "athletes.manage")
        number = number.zfill(5)
        async with tx(pool(req)) as c:
            if not await (await c.execute("select 1 from members where member_number = %s", [number])).fetchone():
                raise not_found("Sócio")
            a = await (await c.execute("select member_number from athletes where id = %s for update", [id])).fetchone()
            if not a:
                raise not_found("Atleta")
            before = a["member_number"]
            if before and before != number and not force:
                raise HttpError(409, "conflict", f"O atleta já está ligado ao sócio n.º {before}")
            await c.execute("update athletes set member_number = %s, updated_at = now() where id = %s", [number, id])
            await audit(c, actor(req), "athletes.link_member", "athletes", id, {"member": number, "before": before})
            completed = await complete_pair(c, actor(req), number, id)
        return {**await _member_detail(req, number), "completed": completed}

    @r.delete("/members/{number}/athletes/{id}", tags=office, summary="Desliga o atleta deste sócio")
    async def unlink_athlete(req: Request, number: Number, id: AthleteId) -> dict[str, Any]:
        require(req, "members.manage")
        require(req, "athletes.manage")
        number = number.zfill(5)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "update athletes set member_number = null, updated_at = now() where id = %s and member_number = %s returning id", [id, number]
            )
            if not await cur.fetchone():
                raise not_found("Ligação")
            await audit(c, actor(req), "athletes.unlink_member", "athletes", id, {"member": number})
        return await _member_detail(req, number)

    @r.post("/members/{number}/quotas", tags=office, summary="Acrescenta uma quota avulsa (ex.: joia ou quota em atraso)", status_code=201)
    async def add_quota(req: Request, number: Number, body: NewQuota) -> dict[str, Any]:
        require(req, "payments.manage")
        number = number.zfill(5)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "insert into quotas (member_number, period, amount, due_date) values (%s, %s, %s, %s) returning id",
                [number, body.period.strip(), body.amount, body.dueDate],
            )
            row = await cur.fetchone()
            assert row is not None
            await audit(c, actor(req), "quotas.create", "quotas", row["id"], {"member": number, "period": body.period, "amount": body.amount})
        return {"id": row["id"], "period": body.period, "amount": body.amount}

    # ------------------------------------------------------------- atletas
    @r.post("/athletes", tags=office, summary="Cria um atleta (sem código: o seguinte); com o email do encarregado, dá-lhe acesso", status_code=201)
    async def create_athlete(req: Request, body: AthleteIn) -> dict[str, Any]:
        require(req, "athletes.manage")
        check_sensitive(req, body)
        async with tx(pool(req)) as c:
            if body.code and await (await c.execute("select 1 from athletes where upper(code) = upper(%s)", [body.code])).fetchone():
                raise HttpError(409, "conflict", f"Já existe o atleta {body.code.upper()}")
            athlete_id, _ = await save_athlete(c, actor(req), body)
        row = await fetch_one(pool(req), "select id, code, name from athletes where id = %s", [athlete_id])
        return dict(row or {})

    @r.put("/athletes/{id}/admin", tags=office, summary="Altera a ficha (incluindo identificação, modalidade, escalão e n.º de sócio)")
    async def update_athlete(req: Request, id: AthleteId, body: AthleteIn) -> dict[str, Any]:
        require(req, "athletes.manage")
        check_sensitive(req, body)
        async with tx(pool(req)) as c:
            await save_athlete(c, actor(req), body.model_copy(update={"code": None}), athlete_id=id)
        return {"id": id}

    @r.get("/athletes/{id}/access", tags=office, summary="Quem acede à ficha no site (encarregados e o próprio)")
    async def access(req: Request, id: AthleteId) -> list[dict[str, Any]]:
        require(req, "athletes.manage")
        return await fetch(
            pool(req),
            """select u.id as "userId", u.name, u.email, aa.role, (u.password_hash <> '!') as "hasPassword"
                 from athlete_access aa join users u on u.id = aa.user_id where aa.athlete_id = %s order by aa.role, u.name""",
            [id],
        )

    @r.post("/athletes/{id}/access", tags=office, summary="Dá acesso a um encarregado (cria a conta, se não existir)", status_code=201)
    async def add_access(req: Request, id: AthleteId, body: Access) -> dict[str, Any]:
        require(req, "athletes.manage")
        async with tx(pool(req)) as c:
            if not await (await c.execute("select 1 from athletes where id = %s", [id])).fetchone():
                raise not_found("Atleta")
            user_id = await grant_access(c, id, body.email.lower(), body.name.strip(), body.role)
            await audit(c, actor(req), "athletes.access_grant", "athletes", id, {"user": user_id, "role": body.role})
        return {"userId": user_id, "role": body.role}

    @r.delete("/athletes/{id}/access/{user}", tags=office, summary="Retira o acesso de uma conta à ficha", status_code=204)
    async def remove_access(req: Request, id: AthleteId, user: UserId) -> None:
        require(req, "athletes.manage")
        async with tx(pool(req)) as c:
            cur = await c.execute("delete from athlete_access where athlete_id = %s and user_id = %s", [id, user])
            if not cur.rowcount:
                raise not_found("Acesso")
            await audit(c, actor(req), "athletes.access_revoke", "athletes", id, {"user": user})

    # ------------------------------------------------------------- importação
    @r.post(
        "/registry/import",
        tags=office,
        summary="Importa sócios ou atletas (linhas já lidas do CSV/XLSX). dryRun=true só valida; com erros, nada é gravado",
    )
    async def import_registry(req: Request, body: ImportBody) -> dict[str, Any]:
        require(req, "members.manage" if body.kind == "members" else "athletes.manage")
        rows, errors = validate_rows(body.kind, body.rows)
        if body.kind == "athletes":
            check_sensitive(req, *rows)
            # Os n.os de sócio indicados têm de existir (importar primeiro os sócios)
            wanted = {getattr(m, "memberNumber", None) for m in rows} - {None}
            if wanted:
                known = {
                    x["member_number"]
                    for x in await fetch(pool(req), "select member_number from members where member_number = any(%s)", [list(wanted)])
                }
                for i, m in enumerate(rows, start=1):
                    n = getattr(m, "memberNumber", None)
                    if n and n not in known:
                        errors.append({"row": i, "field": "memberNumber", "message": f"não há sócio n.º {n} (importa primeiro os sócios)"})
        out: dict[str, Any] = {"kind": body.kind, "total": len(body.rows), "valid": len(rows), "errors": errors[:500], "dryRun": body.dryRun}
        if errors or body.dryRun:
            # Estimativa do que vai acontecer (sem gravar)
            if body.kind == "members":
                numbers = [getattr(m, "memberNumber", None) for m in rows]
                existing = {
                    x["member_number"]
                    for x in await fetch(pool(req), "select member_number from members where member_number = any(%s)", [[n for n in numbers if n]])
                }
                out["updates"] = sum(1 for n in numbers if n in existing)
            else:
                codes = [str(getattr(m, "code", "") or "").upper() for m in rows]
                existing = {
                    x["code"] for x in await fetch(pool(req), "select upper(code) as code from athletes where upper(code) = any(%s)", [codes])
                }
                out["updates"] = sum(1 for code in codes if code in existing)
            out["creates"] = len(rows) - out["updates"]
            return out
        async with tx(pool(req)) as c:
            result = await import_rows(c, actor(req), body.kind, rows)
            await audit(c, actor(req), f"{body.kind}.import", body.kind, None, result)
        return {**out, **result}
