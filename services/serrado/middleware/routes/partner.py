"""
API de parceiros (/api/v1/partner): sistemas externos registam pedidos de gasto e consultam o estado.

1. POST /partner/oauth/token — OAuth2 client credentials: client_id + client_secret (HTTP Basic, formulário
   ou JSON) → token de acesso de 15 minutos.
2. POST /partner/expenses — com Authorization: Bearer <token>: regista o pedido e devolve o id.
3. GET /partner/expenses/{id} (ou ?externalRef=...) — estado do pedido.

Credenciais geridas no backoffice (/admin/api-clients, quem gere utilizadores). As regras estão no backend.
"""

import base64
import binascii
import json
from typing import Annotated, Any
from urllib.parse import parse_qs, unquote

from fastapi import APIRouter, Body, Path, Request
from fastapi.responses import JSONResponse

from ...web import HttpError
from ..backend_client import BackendError
from ..deps import backend
from ..session import staff

UUID = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
JsonObject = Annotated[dict[str, Any], Body()]


def bearer(req: Request) -> dict[str, str]:
    header = req.headers.get("authorization", "")
    if not header.startswith("Bearer sfc_at_"):
        raise HttpError(401, "invalid_token", "Falta o token de acesso (Authorization: Bearer ...): pede-o em /api/v1/partner/oauth/token")
    return {"x-api-token": header[7:].strip()}


def oauth_error(status: int, code: str, text: str) -> JSONResponse:
    # Formato da RFC 6749 (error / error_description), com «message» como o resto da API
    headers = {"www-authenticate": 'Basic realm="serrado-fc"'} if status == 401 else {}
    return JSONResponse({"error": code, "error_description": text, "message": text}, status_code=status, headers=headers)


async def credentials(req: Request) -> tuple[str, str, str] | None:
    """(grant_type, client_id, client_secret) de HTTP Basic, formulário (x-www-form-urlencoded) ou JSON."""
    raw = await req.body()
    kind = req.headers.get("content-type", "").split(";")[0].strip().lower()
    try:
        if kind == "application/json":
            data = json.loads(raw or b"{}")
            form = {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}
        else:
            form = {k: v[0] for k, v in parse_qs(raw.decode(), keep_blank_values=True).items()}
    except (ValueError, UnicodeDecodeError):
        return None
    cid, secret = form.get("client_id", ""), form.get("client_secret", "")
    header = req.headers.get("authorization", "")
    if header.startswith("Basic "):
        try:
            user, _, pw = base64.b64decode(header[6:], validate=True).decode().partition(":")
        except (binascii.Error, ValueError, UnicodeDecodeError):
            return None
        cid, secret = unquote(user), unquote(pw)
    return form.get("grant_type", ""), cid, secret


def register(r: APIRouter) -> None:
    tags: list[Any] = ["API de parceiros"]
    admin_tags: list[Any] = ["Backoffice · API de parceiros"]

    @r.post("/partner/oauth/token", tags=tags, summary="Token de acesso (OAuth2 client credentials)", response_model=None)
    async def token(req: Request) -> Any:
        creds = await credentials(req)
        if creds is None:
            return oauth_error(400, "invalid_request", "Pedido mal formado")
        grant, cid, secret = creds
        if grant != "client_credentials":
            return oauth_error(400, "unsupported_grant_type", "Use grant_type=client_credentials")
        if not cid or not secret or len(cid) > 40 or len(secret) > 100:
            return oauth_error(401, "invalid_client", "Credenciais do cliente inválidas")
        try:
            out = await backend(req).call("POST", "/partner/token", body={"clientId": cid, "clientSecret": secret})
        except BackendError as e:
            if e.status == 401:
                return oauth_error(401, "invalid_client", "Credenciais do cliente inválidas")
            raise
        return JSONResponse(
            {"access_token": out["accessToken"], "token_type": "Bearer", "expires_in": out["expiresIn"]},
            headers={"cache-control": "no-store", "pragma": "no-cache"},
        )

    @r.post("/partner/expenses", tags=tags, summary="Registar um pedido de gasto (devolve o id)", status_code=201)
    async def create(req: Request, body: JsonObject) -> Any:
        return await backend(req).call("POST", "/partner/expenses", body=body, headers=bearer(req))

    @r.get("/partner/expenses", tags=tags, summary="Procurar um pedido pela referência externa (?externalRef=...)")
    async def by_ref(req: Request) -> Any:
        return await backend(req).call("GET", "/partner/expenses", query=dict(req.query_params), headers=bearer(req))

    @r.get("/partner/expenses/{id}", tags=tags, summary="Estado de um pedido")
    async def status(req: Request, id: Annotated[int, Path(ge=1)]) -> Any:
        return await backend(req).call("GET", f"/partner/expenses/{id}", headers=bearer(req))

    # ------------------------------------------------------------ backoffice: credenciais

    @r.get("/admin/api-clients", tags=admin_tags, summary="Clientes da API")
    async def list_clients(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/api-clients", actor=s)

    @r.post("/admin/api-clients", tags=admin_tags, summary="Novo cliente (o segredo só é mostrado agora)", status_code=201)
    async def create_client(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/api-clients", actor=s, body=body)

    @r.post("/admin/api-clients/{id}/{action}", tags=admin_tags, summary="Novo segredo (rotate) ou revogar (revoke)")
    async def act(req: Request, id: Annotated[str, Path(pattern=UUID)], action: Annotated[str, Path(pattern=r"^(rotate|revoke)$")]) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/api-clients/{id}/{action}", actor=s, body={})
