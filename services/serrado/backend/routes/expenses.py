"""
Pedidos de gasto, com aprovação em 3 passos e emails em cada um:

1. Um elemento da direção pede (descrição, fornecedor, valor com IVA, núcleo, anexos) → email aos
   tesoureiros do núcleo.
2. O tesoureiro do núcleo aprova (com o valor aprovado) ou rejeita → email a quem pediu e, se aprovado,
   à tesouraria da direção («pode proceder ao pagamento»).
3. O tesoureiro da direção dá a aprovação final e regista o pagamento (data, valor, meio, comprovativo,
   conta e n.º do documento) → email a quem pediu, com cópia ao Presidente (expenses.view).

Ninguém aprova o próprio pedido, e os passos 2 e 3 são de pessoas diferentes. Se o núcleo não tiver
outro tesoureiro além de quem pede, o 2.º passo passa para a tesouraria da direção.
"""

import base64
import binascii
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ...config import config
from ...db.pool import Conn, fetch, fetch_one, tx
from ...mail import enqueue, layout
from ...notify import expense as notify_expense
from ..core import HttpError, actor, audit, can, forbidden, not_found, pool, require, require_user
from .media import sniff_image

NUCLEOS = {
    "direcao": "Direção (geral)",
    "atletismo": "Atletismo",
    "futsal": "Futsal",
    "rugby": "Rugby",
    "formacao": "Formação",
    "escola-de-desporto": "Escola de Desporto",
}
Nucleo = Literal["direcao", "atletismo", "futsal", "rugby", "formacao", "escola-de-desporto"]
CATEGORIES = [
    "Material e equipamentos",
    "Deslocações e transportes",
    "Inscrições, taxas e filiações",
    "Arbitragem",
    "Alimentação",
    "Instalações e manutenção",
    "Saúde e seguros",
    "Comunicação e marketing",
    "Serviços e honorários",
    "Outros",
]
METHODS = {
    "transferencia": "transferência",
    "numerario": "numerário",
    "cartao": "cartão",
    "mbway": "MB WAY",
    "cheque": "cheque",
    "debito": "débito direto",
}
Method = Literal["transferencia", "numerario", "cartao", "mbway", "cheque", "debito"]
FILE_KINDS = {"fatura": "Fatura / orçamento", "comprovativo": "Comprovativo de pagamento", "recibo": "Fatura-recibo final", "outro": "Outro"}
MAX_FILE = 10 * 1024 * 1024
# Acima disto os anexos não vão no email (só a ligação para o backoffice)
MAX_MAIL_ATTACHMENTS = 8 * 1024 * 1024
Id = Annotated[int, Path(ge=1)]
Money = Annotated[Decimal, Field(gt=0, lt=1_000_000, max_digits=8, decimal_places=2)]


class FileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    data: str = Field(min_length=8, max_length=14_100_000)  # base64 de até 10 MB


class ExpenseIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    nucleo: Nucleo
    category: str
    title: str = Field(min_length=3, max_length=120)
    purpose: str = Field(default="", max_length=2000)
    supplier: str = Field(min_length=2, max_length=160)
    supplierNif: str | None = Field(default=None, pattern=r"^[0-9]{9}$")
    amount: Money
    dueDate: date | None = None
    paymentInfo: str = Field(default="", max_length=300)
    files: list[FileIn] = Field(default_factory=list, max_length=3)

    @field_validator("category")
    @classmethod
    def _category(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError("categoria desconhecida")
        return v

    @field_validator("supplierNif", mode="before")
    @classmethod
    def _nif(cls, v: Any) -> Any:
        return (str(v).replace(" ", "") or None) if v is not None else None


class NucleoDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    approve: bool
    amount: Money | None = None
    note: str = Field(default="", max_length=1000)


class FinalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    approve: bool
    note: str = Field(default="", max_length=1000)


class PaymentIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    paidOn: date
    amount: Money
    method: Method
    accountCode: str = Field(default="", max_length=20)
    docNumber: str = Field(default="", max_length=60)
    note: str = Field(default="", max_length=1000)
    proof: FileIn | None = None


class FileUpload(FileIn):
    kind: Literal["fatura", "comprovativo", "recibo", "outro"] = "outro"


class InvoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    received: bool


class ApproversIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    userIds: list[Annotated[str, Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]] = Field(
        default_factory=list, max_length=20
    )


# ---------------------------------------------------------------- ajudas


def eur(v: Decimal | float | int | None) -> str:
    """1234.5 → «1 234,50 €»"""
    s = f"{Decimal(v or 0):,.2f}".replace(",", " ").replace(".", ",")
    return f"{s} €"


def dmy(v: Any) -> str:
    """Data (date ou texto ISO, como vem da base de dados) → «05/01/2026»"""
    d = v if isinstance(v, date) else date.fromisoformat(str(v)[:10])
    return f"{d:%d/%m/%Y}"


def number(row: dict[str, Any]) -> str:
    return f"{row['year']}/{row['seq']:03d}"


def decode(f: FileIn) -> tuple[bytes, str]:
    try:
        data = base64.b64decode(f.data, validate=True)
    except (binascii.Error, ValueError):
        raise HttpError(400, "invalid_file", f"Ficheiro inválido: {f.name}") from None
    mime = sniff_image(data)
    if mime not in ("application/pdf", "image/jpeg", "image/png", "image/webp"):
        raise HttpError(415, "unsupported_file", f"«{f.name}»: só PDF, JPG, PNG ou WebP")
    if len(data) > MAX_FILE:
        raise HttpError(413, "file_too_large", f"«{f.name}» tem mais de 10 MB")
    return data, mime


async def add_file(c: Conn, expense_id: int, kind: str, f: FileIn, user_id: str) -> dict[str, Any]:
    data, mime = decode(f)
    cur = await c.execute(
        """insert into expense_files (expense_id, kind, name, mime, size_bytes, data, uploaded_by)
           values (%s, %s, %s, %s, %s, %s, %s) returning id""",
        [expense_id, kind, f.name, mime, len(data), data, user_id],
    )
    row = await cur.fetchone()
    assert row is not None
    return {"id": str(row["id"]), "name": f.name, "content": f.data, "size": len(data)}


async def event(c: Conn, expense_id: int, user_id: str | None, action: str, note: str = "") -> None:
    await c.execute("insert into expense_events (expense_id, user_id, action, note) values (%s, %s, %s, %s)", [expense_id, user_id, action, note])


async def holders(c: Conn, permission: str) -> list[dict[str, Any]]:
    """Quem tem a permissão por um papel (o admin, que tem tudo, só recebe se também tiver o papel)."""
    return await fetch(
        c,
        """select distinct u.id::text as id, u.email, u.name from users u
           join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role = ur.role
           where rp.permission = %s and not u.disabled""",
        [permission],
    )


async def users_by_id(c: Conn, ids: list[str]) -> list[dict[str, Any]]:
    if not ids:
        return []
    return await fetch(c, "select id::text as id, email, name from users where id = any(%s::uuid[]) and not disabled", [ids])


async def load(c: Conn, id: int) -> dict[str, Any]:
    row = await fetch_one(c, "select * from expenses where id = %s for update", [id])
    if not row:
        raise not_found("Pedido")
    return row


Teams = dict[str, list[str]]


async def teams(c: Conn) -> Teams:
    """Tesoureiros de cada núcleo (contas ativas)."""
    out: Teams = {k: [] for k in NUCLEOS}
    for r in await fetch(c, "select a.nucleo, a.user_id::text as id from expense_approvers a join users u on u.id = a.user_id where not u.disabled"):
        out[r["nucleo"]].append(r["id"])
    return out


def can_decide_nucleo(req: Request, row: dict[str, Any], t: Teams) -> bool:
    me = actor(req).id
    if row["status"] != "pedido" or me == str(row["requested_by"]):
        return False
    team = [u for u in t[row["nucleo"]] if u != str(row["requested_by"])]
    if me in team and can(req, "expenses.approve", "expenses.pay"):
        return True
    # Sem outro tesoureiro no núcleo além de quem pede: a tesouraria da direção faz o 2.º passo
    return not team and can(req, "expenses.pay")


def can_final(req: Request, row: dict[str, Any]) -> bool:
    me = actor(req).id
    return row["status"] == "aprovado_nucleo" and can(req, "expenses.pay") and me not in (str(row["requested_by"]), str(row["nucleo_by"]))


def can_pay(req: Request, row: dict[str, Any]) -> bool:
    me = actor(req).id
    return (row["status"] == "aprovado" and can(req, "expenses.pay") and me != str(row["requested_by"])) or can_final(req, row)


def visible(req: Request, row: dict[str, Any], t: Teams) -> bool:
    me = actor(req).id
    if can(req, "expenses.view", "expenses.pay") or me == str(row["requested_by"]):
        return True
    return can(req, "expenses.approve") and me in t[row["nucleo"]]


def actions(req: Request, row: dict[str, Any], t: Teams) -> list[str]:
    me = actor(req).id
    out: list[str] = []
    if can_decide_nucleo(req, row, t):
        out.append("nucleo")
    if can_final(req, row):
        out.append("final")
    if can_pay(req, row):
        out.append("pay")
    if row["status"] == "pedido" and me == str(row["requested_by"]):
        out.append("cancel")
    if row["status"] == "pago" and can(req, "expenses.pay"):
        out.append("invoice")
    if row["status"] not in ("rejeitado", "anulado"):
        out.append("upload")
    return out


LIST_COLUMNS = """e.id, e.year, e.seq, e.nucleo, e.category, e.title, e.supplier, e.amount, e.due_date as "dueDate", e.status,
    e.requested_by::text as "requestedBy", e.nucleo_by::text as "nucleoBy", e.requested_at as "requestedAt", ru.name as "requestedByName",
    e.nucleo_at as "nucleoAt", e.nucleo_amount as "nucleoAmount", nu.name as "nucleoByName",
    e.final_at as "finalAt", fu.name as "finalByName", e.paid_on as "paidOn", e.paid_amount as "paidAmount",
    e.paid_method as "paidMethod", e.account_code as "accountCode", e.doc_number as "docNumber",
    e.invoice_received_at as "invoiceReceivedAt", e.rejected_at as "rejectedAt",
    (select count(*) from expense_files f where f.expense_id = e.id)::int as "files"
    from expenses e
    join users ru on ru.id = e.requested_by
    left join users nu on nu.id = e.nucleo_by
    left join users fu on fu.id = e.final_by"""


def summary_lines(row: dict[str, Any], requester: str) -> list[str]:
    lines = [
        f"Requerente: {requester}",
        f"Data do pedido: {dmy(row['requested_at'])}",
        f"Descrição / finalidade: {row['title']}" + (f" — {row['purpose']}" if row["purpose"] else ""),
        f"Fornecedor: {row['supplier']}" + (f" (NIF {row['supplier_nif']})" if row["supplier_nif"] else ""),
        f"Valor (com IVA): {eur(row['amount'])}",
        f"Categoria / centro de custo: {row['category']} · {NUCLEOS[row['nucleo']]}",
    ]
    if row["due_date"]:
        lines.append(f"Data limite de pagamento: {dmy(row['due_date'])}")
    if row["payment_info"]:
        lines.append(f"Dados para pagamento: {row['payment_info']}")
    return lines


def link(row: dict[str, Any]) -> tuple[str, str]:
    return ("Abrir o pedido no backoffice", f"{config.oauth.site_url}/admin/pedidos-de-gasto?id={row['id']}")


async def mail(
    c: Conn, people: list[dict[str, Any]], subject: str, title: str, lines: list[str], row: dict[str, Any], files: list[dict[str, Any]] | None = None
) -> None:
    # Também por notificação na app, a quem a tiver ativado
    await notify_expense(c, [p["id"] for p in people], title, subject, row["id"])
    if not config.mail.enabled:
        return
    attach = [{"name": f["name"], "content": f["content"]} for f in files or []]
    if sum(f["size"] for f in files or []) > MAX_MAIL_ATTACHMENTS:
        attach = []
        lines = [*lines, "Os anexos são grandes demais para o email: estão no backoffice."]
    seen: set[str] = set()
    for p in people:
        if p["email"].lower() in seen:
            continue
        seen.add(p["email"].lower())
        await enqueue(c, to_email=p["email"], to_name=p["name"], subject=subject, html_body=layout(title, lines, link(row)), attachments=attach)


# ---------------------------------------------------------------- rotas


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Pedidos de gasto"]

    @r.get("/expenses/meta", tags=tags, summary="Núcleos, categorias e o que o utilizador pode fazer")
    async def meta(req: Request) -> dict[str, Any]:
        me = require_user(req)
        require(req, "expenses.request", "expenses.approve", "expenses.pay", "expenses.view")
        mine = await fetch(pool(req), "select nucleo from expense_approvers where user_id = %s", [me])
        return {
            "nucleos": [{"key": k, "label": v} for k, v in NUCLEOS.items()],
            "categories": CATEGORIES,
            "methods": [{"key": k, "label": v} for k, v in METHODS.items()],
            "fileKinds": [{"key": k, "label": v} for k, v in FILE_KINDS.items()],
            "myNucleos": [m["nucleo"] for m in mine] if can(req, "expenses.approve", "expenses.pay") else [],
            "me": me,
        }

    @r.get("/expenses", tags=tags, summary="Pedidos (scope: todo = à espera de mim, mine = os meus, all = todos os que posso ver)")
    async def list_(
        req: Request,
        scope: Annotated[Literal["todo", "mine", "all"], Query()] = "todo",
        year: Annotated[int | None, Query(ge=2020, le=2100)] = None,
    ) -> list[dict[str, Any]]:
        me = require_user(req)
        require(req, "expenses.request", "expenses.approve", "expenses.pay", "expenses.view")
        where: list[str] = []
        params: list[Any] = []
        if year:
            where.append("e.year = %s")
            params.append(year)
        if scope == "mine":
            where.append("e.requested_by = %s")
            params.append(me)
        elif not can(req, "expenses.view", "expenses.pay"):
            # Os seus pedidos e os dos núcleos que aprova
            where.append("(e.requested_by = %s or (%s and e.nucleo in (select nucleo from expense_approvers where user_id = %s)))")
            params += [me, can(req, "expenses.approve"), me]
        if scope == "todo":
            where.append("e.status in ('pedido', 'aprovado_nucleo', 'aprovado')")
        sql = f"select {LIST_COLUMNS} {'where ' + ' and '.join(where) if where else ''} order by e.year desc, e.seq desc limit 1000"
        async with tx(pool(req)) as c:
            rows = await fetch(c, sql, params)
            t = await teams(c)
        out = []
        for row in rows:
            acts = actions(req, {**row, "requested_by": row["requestedBy"], "nucleo_by": row["nucleoBy"]}, t)
            if scope == "todo" and not {"nucleo", "final", "pay"} & set(acts):
                continue
            out.append({**row, "number": number(row), "actions": acts})
        return out

    @r.get("/expenses/{id}", tags=tags, summary="Pedido, com anexos e histórico")
    async def get(req: Request, id: Id) -> dict[str, Any]:
        require_user(req)
        async with tx(pool(req)) as c:
            raw = await fetch_one(c, "select * from expenses where id = %s", [id])
            t = await teams(c)
            if not raw or not visible(req, raw, t):
                raise not_found("Pedido")
            row = await fetch_one(c, f"select {LIST_COLUMNS} where e.id = %s", [id])
            assert row is not None
            files = await fetch(
                c,
                """select f.id::text as id, f.kind, f.name, f.mime, f.size_bytes as size, f.created_at as "createdAt", u.name as "uploadedBy"
                   from expense_files f left join users u on u.id = f.uploaded_by where f.expense_id = %s order by f.created_at""",
                [id],
            )
            events = await fetch(
                c,
                """select e.at, e.action, e.note, u.name as "by" from expense_events e left join users u on u.id = e.user_id
                   where e.expense_id = %s order by e.at, e.id""",
                [id],
            )
            return {
                **row,
                "number": number(row),
                "purpose": raw["purpose"],
                "supplierNif": raw["supplier_nif"],
                "paymentInfo": raw["payment_info"],
                "nucleoNote": raw["nucleo_note"],
                "finalNote": raw["final_note"],
                "rejectReason": raw["reject_reason"],
                "files": files,
                "events": events,
                "actions": actions(req, raw, t),
            }

    @r.post("/expenses", tags=tags, summary="Novo pedido de gasto (com anexos em base64)", status_code=201)
    async def create(req: Request, body: ExpenseIn) -> dict[str, Any]:
        me = require_user(req)
        require(req, "expenses.request")
        if body.dueDate and body.dueDate < date.today():
            raise HttpError(400, "invalid_due_date", "A data limite já passou")
        for f in body.files:
            decode(f)  # valida antes de gravar
        year = date.today().year
        async with tx(pool(req)) as c:
            await c.execute("lock table expenses in share row exclusive mode")
            nxt = await fetch_one(c, "select coalesce(max(seq), 0) + 1 as n from expenses where year = %s", [year])
            assert nxt is not None
            cur = await c.execute(
                """insert into expenses (year, seq, nucleo, category, title, purpose, supplier, supplier_nif, amount, due_date, payment_info, requested_by)
                   values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning *""",
                [
                    year,
                    nxt["n"],
                    body.nucleo,
                    body.category,
                    body.title,
                    body.purpose,
                    body.supplier,
                    body.supplierNif,
                    body.amount,
                    body.dueDate,
                    body.paymentInfo,
                    me,
                ],
            )
            row = await cur.fetchone()
            assert row is not None
            files = [await add_file(c, row["id"], "fatura", f, me) for f in body.files]
            await event(c, row["id"], me, "pedido")
            await audit(c, actor(req), "create", "expense", row["id"], {"amount": str(body.amount), "nucleo": body.nucleo})
            requester = await fetch_one(c, "select name from users where id = %s", [me])
            assert requester is not None
            team = [u for u in (await teams(c))[body.nucleo] if u != me]
            to = await users_by_id(c, team) if team else [p for p in await holders(c, "expenses.pay") if p["id"] != me]
            await mail(
                c,
                to,
                f"[PEDIDO DE GASTO] {body.title} – {eur(body.amount)}",
                f"Pedido de gasto {number(row)}",
                [
                    "Exmo(a). Responsável Financeiro,",
                    "Solicito autorização para o seguinte gasto:",
                    *summary_lines(row, requester["name"]),
                    f"Anexos: {', '.join(f.name for f in body.files)}" if body.files else "Anexos: (sem anexos)",
                ],
                row,
                files,
            )
        return {"id": row["id"], "number": number(row)}

    @r.post("/expenses/{id}/nucleo", tags=tags, summary="2.º passo: decisão do tesoureiro do núcleo")
    async def decide_nucleo(req: Request, id: Id, body: NucleoDecision) -> dict[str, Any]:
        me = require_user(req)
        async with tx(pool(req)) as c:
            row = await load(c, id)
            if not can_decide_nucleo(req, row, await teams(c)):
                raise forbidden()
            amount = body.amount or row["amount"]
            if body.approve and amount > row["amount"]:
                raise HttpError(400, "amount_too_high", "O valor aprovado não pode ser maior do que o pedido")
            if not body.approve and not body.note:
                raise HttpError(400, "reason_required", "Indique o motivo da rejeição")
            if body.approve:
                await c.execute(
                    """update expenses set status = 'aprovado_nucleo', nucleo_by = %s, nucleo_at = now(), nucleo_amount = %s,
                       nucleo_note = %s, updated_at = now() where id = %s""",
                    [me, amount, body.note, id],
                )
            else:
                await c.execute(
                    """update expenses set status = 'rejeitado', nucleo_by = %s, nucleo_at = now(), nucleo_note = %s,
                       rejected_by = %s, rejected_at = now(), reject_reason = %s, updated_at = now() where id = %s""",
                    [me, body.note, me, body.note, id],
                )
            await event(c, id, me, "aprovado_nucleo" if body.approve else "rejeitado_nucleo", body.note)
            await audit(c, actor(req), "approve" if body.approve else "reject", "expense", id, {"step": "nucleo"})
            decider = await fetch_one(c, "select name from users where id = %s", [me])
            assert decider is not None
            verdict = "APROVADO" if body.approve else "REJEITADO"
            lines = [
                f"Pedido {number(row)}: {row['title']} ({row['supplier']}, {eur(row['amount'])})",
                f"Decisão: {verdict}",
                *([f"Valor aprovado: {eur(amount)}"] if body.approve else []),
                f"Observações / condições: {body.note or '—'}",
                f"Data: {date.today():%d/%m/%Y} · {decider['name']} (tesoureiro do núcleo {NUCLEOS[row['nucleo']]})",
            ]
            to = await users_by_id(c, [str(row["requested_by"])])
            if body.approve:
                lines.append("Tesoureiro, pode proceder ao pagamento.")
                to += [p for p in await holders(c, "expenses.pay") if p["id"] not in (me, str(row["requested_by"]))]
            await mail(c, to, f"RE: [PEDIDO DE GASTO] {row['title']} – {verdict}", f"Pedido de gasto {number(row)}: {verdict.lower()}", lines, row)
        return {"ok": True}

    @r.post("/expenses/{id}/final", tags=tags, summary="3.º passo: aprovação final ou rejeição pelo tesoureiro da direção (sem pagar ainda)")
    async def decide_final(req: Request, id: Id, body: FinalDecision) -> dict[str, Any]:
        me = require_user(req)
        async with tx(pool(req)) as c:
            row = await load(c, id)
            if not can_final(req, row):
                raise forbidden()
            if body.approve:
                await c.execute(
                    "update expenses set status = 'aprovado', final_by = %s, final_at = now(), final_note = %s, updated_at = now() where id = %s",
                    [me, body.note, id],
                )
            else:
                if not body.note:
                    raise HttpError(400, "reason_required", "Indique o motivo da rejeição")
                await c.execute(
                    """update expenses set status = 'rejeitado', final_by = %s, final_at = now(), final_note = %s,
                       rejected_by = %s, rejected_at = now(), reject_reason = %s, updated_at = now() where id = %s""",
                    [me, body.note, me, body.note, id],
                )
            await event(c, id, me, "aprovado" if body.approve else "rejeitado", body.note)
            await audit(c, actor(req), "approve" if body.approve else "reject", "expense", id, {"step": "final"})
            verdict = "APROVADO" if body.approve else "REJEITADO"
            to = await users_by_id(c, [str(row["requested_by"]), str(row["nucleo_by"])])
            await mail(
                c,
                to,
                f"RE: [PEDIDO DE GASTO] {row['title']} – {verdict} pela tesouraria",
                f"Pedido de gasto {number(row)}: {verdict.lower()} pela tesouraria",
                [
                    f"Pedido {number(row)}: {row['title']} ({row['supplier']}, {eur(row['nucleo_amount'] or row['amount'])})",
                    f"Decisão final: {verdict}",
                    f"Observações: {body.note or '—'}",
                    "O pagamento vai ser feito e receberá a confirmação." if body.approve else "O pedido fica fechado.",
                ],
                row,
            )
        return {"ok": True}

    @r.post("/expenses/{id}/pay", tags=tags, summary="Pagamento e registo contabilístico (inclui a aprovação final, se ainda não estiver dada)")
    async def pay(req: Request, id: Id, body: PaymentIn) -> dict[str, Any]:
        me = require_user(req)
        if body.paidOn > date.today():
            raise HttpError(400, "invalid_date", "A data do pagamento não pode ser no futuro")
        async with tx(pool(req)) as c:
            row = await load(c, id)
            if not can_pay(req, row):
                raise forbidden()
            if row["status"] == "aprovado_nucleo":
                await c.execute("update expenses set final_by = %s, final_at = now(), final_note = %s where id = %s", [me, body.note, id])
                await event(c, id, me, "aprovado", body.note)
            await c.execute(
                """update expenses set status = 'pago', paid_by = %s, paid_on = %s, paid_amount = %s, paid_method = %s,
                   account_code = %s, doc_number = %s, updated_at = now() where id = %s""",
                [me, body.paidOn, body.amount, body.method, body.accountCode, body.docNumber, id],
            )
            files = [await add_file(c, id, "comprovativo", body.proof, me)] if body.proof else []
            await event(c, id, me, "pago", f"{eur(body.amount)} por {METHODS[body.method]} em {body.paidOn:%d/%m/%Y}")
            await audit(c, actor(req), "pay", "expense", id, {"amount": str(body.amount), "method": body.method})
            payer = await fetch_one(c, "select name from users where id = %s", [me])
            assert payer is not None
            lines = [
                f"Pedido {number(row)}: {row['title']} ({row['supplier']})",
                f"O pagamento foi efetuado em {body.paidOn:%d/%m/%Y}, no valor de {eur(body.amount)}, por {METHODS[body.method]}.",
                "Segue o comprovativo em anexo." if files else "O comprovativo fica no backoffice.",
            ]
            if not row["invoice_received_at"]:
                lines.append(
                    "Solicito à pessoa requerente que envie a fatura/recibo final, caso ainda não o tenha feito (pode carregá-la no pedido, no backoffice)."
                )
            lines.append(f"Tesoureiro: {payer['name']}")
            to = await users_by_id(c, [str(row["requested_by"])])
            # Com cópia ao Presidente (e a quem acompanha todos os pedidos)
            to += [p for p in await holders(c, "expenses.view") if p["id"] not in (me, str(row["requested_by"]))]
            await mail(c, to, f"[PAGO] {row['title']} – {eur(body.amount)}", f"Pagamento do pedido {number(row)}", lines, row, files)
        return {"ok": True}

    @r.post("/expenses/{id}/cancel", tags=tags, summary="Anular o próprio pedido (antes da decisão do núcleo)")
    async def cancel(req: Request, id: Id) -> dict[str, Any]:
        me = require_user(req)
        async with tx(pool(req)) as c:
            row = await load(c, id)
            if row["status"] != "pedido" or str(row["requested_by"]) != me:
                raise forbidden()
            await c.execute("update expenses set status = 'anulado', updated_at = now() where id = %s", [id])
            await event(c, id, me, "anulado")
            await audit(c, actor(req), "cancel", "expense", id)
        return {"ok": True}

    @r.post("/expenses/{id}/files", tags=tags, summary="Juntar um anexo (ex.: a fatura-recibo final)", status_code=201)
    async def upload(req: Request, id: Id, body: FileUpload) -> dict[str, Any]:
        me = require_user(req)
        async with tx(pool(req)) as c:
            row = await load(c, id)
            t = await teams(c)
            if not visible(req, row, t) or "upload" not in actions(req, row, t):
                raise forbidden()
            out = await add_file(c, id, body.kind, body, me)
            await event(c, id, me, "anexo", f"{FILE_KINDS[body.kind]}: {body.name}")
            if body.kind == "recibo" and row["status"] == "pago" and not row["invoice_received_at"]:
                await c.execute("update expenses set invoice_received_at = now(), updated_at = now() where id = %s", [id])
                await event(c, id, me, "fatura_recebida")
            await audit(c, actor(req), "upload", "expense", id, {"kind": body.kind})
        return {"id": out["id"]}

    @r.post("/expenses/{id}/invoice", tags=tags, summary="Marcar a fatura/recibo final como recebida (ou não)")
    async def invoice(req: Request, id: Id, body: InvoiceIn) -> dict[str, Any]:
        me = require_user(req)
        require(req, "expenses.pay")
        async with tx(pool(req)) as c:
            row = await load(c, id)
            if row["status"] != "pago":
                raise HttpError(409, "not_paid", "O pedido ainda não está pago")
            await c.execute(
                "update expenses set invoice_received_at = case when %s then coalesce(invoice_received_at, now()) end, updated_at = now() where id = %s",
                [body.received, id],
            )
            await event(c, id, me, "fatura_recebida" if body.received else "fatura_em_falta")
            await audit(c, actor(req), "invoice", "expense", id, {"received": body.received})
        return {"ok": True}

    @r.get("/expenses/files/{file_id}", tags=tags, summary="Descarregar um anexo (quem pode ver o pedido)")
    async def download(req: Request, file_id: Annotated[str, Path(pattern=r"^[0-9a-f-]{36}$")]) -> dict[str, str]:
        require_user(req)
        async with tx(pool(req)) as c:
            f = await fetch_one(c, "select expense_id, name, mime, data from expense_files where id = %s", [file_id])
            if not f:
                raise not_found("Anexo")
            row = await fetch_one(c, "select * from expenses where id = %s", [f["expense_id"]])
            if not row or not visible(req, row, await teams(c)):
                raise not_found("Anexo")
        return {"filename": f["name"], "mime": f["mime"], "data": base64.b64encode(f["data"]).decode()}

    @r.get("/expenses-approvers", tags=tags, summary="Tesoureiros de cada núcleo e quem pode ser escolhido")
    async def get_approvers(req: Request) -> dict[str, Any]:
        require(req, "expenses.pay", "users.manage")
        rows = await fetch(
            pool(req),
            "select a.nucleo, u.id::text as id, u.name, u.email from expense_approvers a join users u on u.id = a.user_id order by u.name",
        )
        candidates = await fetch(
            pool(req),
            """select distinct u.id::text as id, u.name, u.email from users u
               join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role = ur.role
               where rp.permission in ('expenses.approve', 'expenses.pay') and not u.disabled order by u.name""",
        )
        return {
            "nucleos": [{"key": k, "label": v, "approvers": [r for r in rows if r["nucleo"] == k]} for k, v in NUCLEOS.items()],
            "candidates": candidates,
        }

    @r.put("/expenses-approvers/{nucleo}", tags=tags, summary="Definir os tesoureiros de um núcleo")
    async def set_approvers(req: Request, nucleo: Nucleo, body: ApproversIn) -> dict[str, Any]:
        require(req, "expenses.pay", "users.manage")
        async with tx(pool(req)) as c:
            ok = await fetch(c, "select id::text as id from users where id = any(%s::uuid[])", [body.userIds]) if body.userIds else []
            if len(ok) != len(set(body.userIds)):
                raise HttpError(400, "unknown_user", "Utilizador desconhecido")
            await c.execute("delete from expense_approvers where nucleo = %s", [nucleo])
            for uid in set(body.userIds):
                await c.execute("insert into expense_approvers (nucleo, user_id) values (%s, %s)", [nucleo, uid])
            await audit(c, actor(req), "update", "expense_approvers", nucleo, {"users": sorted(set(body.userIds))})
        return {"ok": True}
