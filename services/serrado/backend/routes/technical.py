"""
APIs técnicas (sistemas externos): pedidos de gasto e decisão do tesoureiro do núcleo, com credenciais de cliente.

- Credenciais (backoffice, quem gere utilizadores): client_id + client_secret, mostrado uma única vez, com
  permissões próprias (registar pedidos; decidir como tesoureiro do núcleo) e núcleos permitidos.
- Token (OAuth2 client credentials): client_id + client_secret → token de acesso de 15 minutos.
- Pedidos: criar em nome de quem pede (requesterEmail; devolve o id; com externalRef, repetir devolve o mesmo
  pedido), consultar o estado e decidir o 2.º passo em nome do tesoureiro (approverEmail).

As regras são as do backoffice: quem pede tem de poder pedir gastos, quem decide tem de ser tesoureiro desse
núcleo (ou a tesouraria, se o núcleo não tiver outro) e ninguém decide o próprio pedido.
Do segredo e dos tokens só se guarda o SHA-256 (são aleatórios com 256 bits: não precisam de um hash lento).
O middleware passa o token no cabeçalho X-Api-Token.
"""

import hashlib
import hmac
import secrets
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from ...db.pool import Conn, fetch, fetch_one, tx
from ...permissions import effective
from ..core import Actor, HttpError, actor, audit, not_found, pool, require
from .expenses import (
    FLOWS,
    NUCLEOS,
    ExpenseIn,
    Nucleo,
    NucleoDecision,
    insert_expense,
    may_decide_nucleo,
    nucleo_decision,
    number,
    teams,
    validate_new,
)

TOKEN_TTL = 15 * 60  # segundos
MAX_TOKENS = 20  # tokens válidos ao mesmo tempo por cliente (os mais antigos caem)
UUID = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
EMAIL = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
Ref = Annotated[str, Field(pattern=r"^[A-Za-z0-9._:/-]{1,64}$")]
Email = Annotated[str, Field(pattern=EMAIL, max_length=254)]
Scope = Literal["expenses.create", "expenses.approve_nucleo"]
SCOPES = {
    "expenses.create": "Registar pedidos de gasto",
    "expenses.approve_nucleo": "Decidir como tesoureiro do núcleo",
}

STATUS = {
    "pedido": "Aguarda aprovação do tesoureiro do núcleo",
    "aprovado_nucleo": "Aguarda aprovação da tesouraria da direção",
    "aprovado": "Aprovado, aguarda pagamento",
    "pago": "Pago",
    "rejeitado": "Rejeitado",
    "anulado": "Anulado",
}
FINAL = {"pago", "rejeitado", "anulado"}
ACTIONS = {
    "pedido": "Pedido registado",
    "aprovado_nucleo": "Aprovado pelo tesoureiro do núcleo",
    "rejeitado_nucleo": "Rejeitado pelo tesoureiro do núcleo",
    "aprovado": "Aprovado pela tesouraria da direção",
    "rejeitado": "Rejeitado pela tesouraria da direção",
    "pago": "Pago",
    "anulado": "Anulado",
    "anexo": "Anexo junto",
    "fatura_recebida": "Fatura-recibo final recebida",
    "fatura_em_falta": "Fatura-recibo final em falta",
}


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class ClientIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=3, max_length=80)
    userId: str = Field(pattern=UUID)
    nucleos: list[Nucleo] = Field(default_factory=list, max_length=len(NUCLEOS))
    scopes: list[Scope] = Field(default_factory=lambda: list[Scope](["expenses.create"]), min_length=1, max_length=len(SCOPES))


class TokenIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clientId: str = Field(max_length=40)
    clientSecret: str = Field(max_length=100)


class TechnicalExpenseIn(ExpenseIn):
    requesterEmail: Email
    externalRef: Ref | None = None


class TechnicalNucleoDecision(NucleoDecision):
    approverEmail: Email


def new_secret() -> str:
    return "sfc_sk_" + secrets.token_urlsafe(32)


async def person(c: Conn, email: str) -> Actor | None:
    """Conta ativa com este email, com as permissões efetivas (como o backend faz para uma sessão)."""
    row = await fetch_one(
        c,
        """select u.id::text as id, coalesce((select array_agg(role) from user_roles where user_id = u.id), '{}') as roles,
                  coalesce((select array_agg(distinct rp.permission) from user_roles ur join role_permissions rp on rp.role = ur.role
                             where ur.user_id = u.id), '{}') as permissions
             from users u where lower(u.email) = lower(%s) and not u.disabled""",
        [email.strip()],
    )
    if not row:
        return None
    roles = list(row["roles"])
    return Actor(id=row["id"], roles=roles, permissions=effective(roles, set(row["permissions"])))


async def candidates(c: Conn) -> list[dict[str, Any]]:
    """Quem pode ser o responsável pela integração: contas ativas da equipa (com algum papel)."""
    return await fetch(
        c,
        """select u.id::text as id, u.name, u.email from users u
            where not u.disabled and exists (select 1 from user_roles ur where ur.user_id = u.id) order by u.name""",
    )


async def client_view(c: Conn, id: str) -> dict[str, Any]:
    row = await fetch_one(
        c,
        """select k.id::text as id, k.client_id as "clientId", k.name, k.secret_hint as "secretHint", k.user_id::text as "userId",
                  u.name as "userName", k.nucleos, k.scopes, k.active, k.created_at as "createdAt", k.secret_rotated_at as "secretRotatedAt",
                  k.last_used_at as "lastUsedAt", k.revoked_at as "revokedAt",
                  (select count(*) from expenses e where e.api_client = k.id)::int as "requests"
             from api_clients k join users u on u.id = k.user_id where k.id = %s""",
        [id],
    )
    if not row:
        raise not_found("Cliente da API")
    return row


async def client_from_token(req: Request, c: Conn, scope: str) -> dict[str, Any]:
    """Cliente ativo dono do token (cabeçalho X-Api-Token), com a permissão pedida."""
    token = req.headers.get("x-api-token", "")
    row = (
        await fetch_one(
            c,
            """select k.id::text as id, k.name, k.nucleos, k.scopes from api_tokens t join api_clients k on k.id = t.client
                where t.token_hash = %s and t.expires_at > now() and k.active""",
            [sha(token)],
        )
        if token.startswith("sfc_at_")
        else None
    )
    if not row:
        raise HttpError(401, "invalid_token", "Token de acesso inválido ou expirado")
    if scope and scope not in row["scopes"]:
        raise HttpError(403, "scope_not_allowed", f"Esta credencial não tem permissão para: {SCOPES[scope]}")
    return row


async def status_view(c: Conn, expense_id: int, client: str) -> dict[str, Any]:
    e = await fetch_one(c, "select * from expenses where id = %s and api_client = %s", [expense_id, client])
    if not e:
        raise not_found("Pedido")
    history = await fetch(c, "select at, action, note from expense_events where expense_id = %s order by at, id", [expense_id])
    st = e["status"]
    return {
        "id": e["id"],
        "number": number(e),
        "externalRef": e["external_ref"],
        "status": st,
        "statusLabel": STATUS[st],
        "final": st in FINAL,
        "flow": e["flow"],
        "flowLabel": FLOWS[e["flow"]],
        "nucleo": e["nucleo"],
        "category": e["category"],
        "title": e["title"],
        "supplier": e["supplier"],
        "amount": float(e["amount"]),
        "approvedAmount": float(e["nucleo_amount"]) if e["nucleo_amount"] is not None else None,
        "requestedAt": e["requested_at"],
        "updatedAt": e["updated_at"],
        "rejectReason": (e["reject_reason"] or None) if st == "rejeitado" else None,
        "payment": {"paidOn": e["paid_on"], "amount": float(e["paid_amount"]), "method": e["paid_method"]} if st == "pago" else None,
        "invoiceReceived": e["invoice_received_at"] is not None,
        # Sem nomes nem notas internas: só o que aconteceu e quando
        "history": [{"at": h["at"], "action": h["action"], "label": ACTIONS.get(h["action"], h["action"])} for h in history],
    }


def register(r: APIRouter) -> None:
    admin_tags: list[Any] = ["APIs técnicas · credenciais"]
    tags: list[Any] = ["APIs técnicas"]

    # ------------------------------------------------------------ credenciais (backoffice)

    @r.get("/api-clients", tags=admin_tags, summary="Clientes das APIs técnicas, responsáveis possíveis, núcleos e permissões")
    async def list_clients(req: Request) -> dict[str, Any]:
        require(req, "users.manage")
        async with tx(pool(req)) as c:
            ids = await fetch(c, "select id::text as id from api_clients order by active desc, created_at desc")
            return {
                "clients": [await client_view(c, x["id"]) for x in ids],
                "candidates": await candidates(c),
                "nucleos": [{"key": k, "label": v} for k, v in NUCLEOS.items()],
                "scopes": [{"key": k, "label": v} for k, v in SCOPES.items()],
            }

    @r.post("/api-clients", tags=admin_tags, summary="Novo cliente (o segredo só é mostrado agora)", status_code=201)
    async def create_client(req: Request, body: ClientIn) -> dict[str, Any]:
        require(req, "users.manage")
        secret = new_secret()
        scopes = [s for s in SCOPES if s in body.scopes]
        async with tx(pool(req)) as c:
            if body.userId not in {x["id"] for x in await candidates(c)}:
                raise HttpError(400, "invalid_user", "O responsável tem de ser uma conta ativa da equipa")
            cur = await c.execute(
                """insert into api_clients (client_id, name, secret_hash, secret_hint, user_id, nucleos, scopes, created_by)
                   values (%s, %s, %s, %s, %s, %s, %s, %s) returning id::text as id""",
                [
                    "sfc_cli_" + secrets.token_hex(8),
                    body.name,
                    sha(secret),
                    secret[-4:],
                    body.userId,
                    sorted(set(body.nucleos)),
                    scopes,
                    actor(req).id,
                ],
            )
            row = await cur.fetchone()
            assert row is not None
            await audit(
                c,
                actor(req),
                "create",
                "api_client",
                row["id"],
                {"name": body.name, "user": body.userId, "nucleos": sorted(set(body.nucleos)), "scopes": scopes},
            )
            return {**await client_view(c, row["id"]), "clientSecret": secret}

    @r.post("/api-clients/{id}/rotate", tags=admin_tags, summary="Novo segredo (o anterior e os tokens deixam de valer)")
    async def rotate(req: Request, id: Annotated[str, Path(pattern=UUID)]) -> dict[str, Any]:
        require(req, "users.manage")
        secret = new_secret()
        async with tx(pool(req)) as c:
            if not (await client_view(c, id))["active"]:
                raise HttpError(409, "revoked", "Este cliente foi revogado: crie um novo")
            await c.execute(
                "update api_clients set secret_hash = %s, secret_hint = %s, secret_rotated_at = now() where id = %s", [sha(secret), secret[-4:], id]
            )
            await c.execute("delete from api_tokens where client = %s", [id])
            await audit(c, actor(req), "rotate_secret", "api_client", id)
            return {**await client_view(c, id), "clientSecret": secret}

    @r.post("/api-clients/{id}/revoke", tags=admin_tags, summary="Revogar (deixa de conseguir entrar; os pedidos ficam)")
    async def revoke(req: Request, id: Annotated[str, Path(pattern=UUID)]) -> dict[str, Any]:
        require(req, "users.manage")
        async with tx(pool(req)) as c:
            await client_view(c, id)
            await c.execute(
                "update api_clients set active = false, revoked_at = coalesce(revoked_at, now()), revoked_by = %s where id = %s", [actor(req).id, id]
            )
            await c.execute("delete from api_tokens where client = %s", [id])
            await audit(c, actor(req), "revoke", "api_client", id)
            return await client_view(c, id)

    # ------------------------------------------------------------ APIs técnicas

    @r.post("/technical/token", tags=tags, summary="Token de acesso (OAuth2 client credentials)")
    async def token(req: Request, body: TokenIn) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            row = await fetch_one(c, "select id::text as id, secret_hash from api_clients where client_id = %s and active", [body.clientId])
            # Compara sempre (mesmo sem cliente) para não revelar pelo tempo de resposta se o client_id existe
            ok = hmac.compare_digest(sha(body.clientSecret), row["secret_hash"] if row else "0" * 64)
            if not row or not ok:
                raise HttpError(401, "invalid_client", "Credenciais do cliente inválidas")
            access = "sfc_at_" + secrets.token_urlsafe(32)
            await c.execute("delete from api_tokens where expires_at < now() - interval '1 day'")
            await c.execute(
                "insert into api_tokens (token_hash, client, expires_at) values (%s, %s, now() + make_interval(secs => %s))",
                [sha(access), row["id"], TOKEN_TTL],
            )
            await c.execute(
                """delete from api_tokens where client = %s and token_hash not in
                   (select token_hash from api_tokens where client = %s order by created_at desc limit %s)""",
                [row["id"], row["id"], MAX_TOKENS],
            )
            await c.execute("update api_clients set last_used_at = now() where id = %s", [row["id"]])
        return {"accessToken": access, "tokenType": "Bearer", "expiresIn": TOKEN_TTL}

    @r.post("/technical/expenses", tags=tags, summary="Registar um pedido de gasto em nome de quem pede (devolve o id)", status_code=201)
    async def create(req: Request, body: TechnicalExpenseIn) -> dict[str, Any]:
        validate_new(body)
        async with tx(pool(req)) as c:
            client = await client_from_token(req, c, "expenses.create")
            if client["nucleos"] and body.nucleo not in client["nucleos"]:
                raise HttpError(403, "nucleo_not_allowed", f"Este cliente não pode fazer pedidos para o núcleo «{body.nucleo}»")
            if body.externalRef:
                await c.execute("select pg_advisory_xact_lock(hashtext(%s))", [client["id"] + body.externalRef])
                dup = await fetch_one(c, "select id from expenses where api_client = %s and external_ref = %s", [client["id"], body.externalRef])
                if dup:
                    return {**await status_view(c, dup["id"], client["id"]), "duplicate": True}
            who = await person(c, body.requesterEmail)
            if not who or "expenses.request" not in who.permissions:
                raise HttpError(403, "requester_not_allowed", "Não há uma conta ativa com este email que possa fazer pedidos de gasto")
            data = ExpenseIn.model_validate(body.model_dump(exclude={"externalRef", "requesterEmail"}))
            row = await insert_expense(c, who, data, api_client=client["id"], external_ref=body.externalRef, via=f"API técnica · {client['name']}")
            await c.execute("update api_clients set last_used_at = now() where id = %s", [client["id"]])
            return {**await status_view(c, row["id"], client["id"]), "duplicate": False}

    @r.post("/technical/expenses/{id}/nucleo-decision", tags=tags, summary="Decisão do tesoureiro do núcleo (aprovar ou rejeitar)")
    async def decide(req: Request, id: Annotated[int, Path(ge=1)], body: TechnicalNucleoDecision) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            client = await client_from_token(req, c, "expenses.approve_nucleo")
            row = await fetch_one(c, "select * from expenses where id = %s and api_client = %s for update", [id, client["id"]])
            if not row:
                raise not_found("Pedido")
            if row["status"] != "pedido":
                raise HttpError(409, "invalid_state", f"O pedido não está à espera da decisão do núcleo (estado: {row['status']})")
            who = await person(c, body.approverEmail)
            if not who or not may_decide_nucleo(who, row, await teams(c)):
                raise HttpError(
                    403,
                    "approver_not_allowed",
                    "Esta pessoa não pode decidir este pedido: tem de ser tesoureiro do núcleo (e não pode ser quem o pediu)",
                )
            data = NucleoDecision.model_validate(body.model_dump(exclude={"approverEmail"}))
            await nucleo_decision(c, who, row, data, via=f"API técnica · {client['name']}")
            await c.execute("update api_clients set last_used_at = now() where id = %s", [client["id"]])
            return await status_view(c, id, client["id"])

    @r.get("/technical/expenses", tags=tags, summary="Procurar um pedido pela referência do sistema externo")
    async def by_ref(req: Request, externalRef: Annotated[str, Query(pattern=r"^[A-Za-z0-9._:/-]{1,64}$")]) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            client = await client_from_token(req, c, "")
            row = await fetch_one(c, "select id from expenses where api_client = %s and external_ref = %s", [client["id"], externalRef])
            if not row:
                raise not_found("Pedido")
            return await status_view(c, row["id"], client["id"])

    @r.get("/technical/expenses/{id}", tags=tags, summary="Estado de um pedido feito por este cliente")
    async def status(req: Request, id: Annotated[int, Path(ge=1)]) -> dict[str, Any]:
        async with tx(pool(req)) as c:
            client = await client_from_token(req, c, "")
            return await status_view(c, id, client["id"])
