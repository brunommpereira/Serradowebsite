"""
BACKEND — API interna (/internal/v1). Regras de negócio e acesso à base de dados.
Não deve estar exposto à Internet: só aceita pedidos do middleware (SERVICE_TOKEN).
"""

import hmac
import re
from collections.abc import Awaitable, Callable

import psycopg
from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import JSONResponse

from ..config import ROLES, config
from ..db.pool import Pool, fetch_one
from ..web import BodyLimit, HttpError, MiB, error, install_error_handlers, log
from .core import Actor
from .routes import admin, athletes, auth, cms, media, members, payments, results

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
PUBLIC = ("/internal/health", "/internal/docs", "/internal/openapi.json")


def _token_ok(header: str | None) -> bool:
    return hmac.compare_digest(f"Bearer {config.service_token}".encode(), (header or "").encode())


def _body_limit(method: str, path: str) -> int:
    if path == "/internal/v1/cms/media":
        return 8 * MiB
    if path == "/internal/v1/results/import":
        return 5 * MiB
    return MiB


def build_backend(pool: Pool) -> FastAPI:
    docs = not config.production
    app = FastAPI(
        title="Serrado FC — Backend (API interna)",
        version="1.0.0",
        description="Regras de negócio e dados. Acesso só pelo middleware (Bearer SERVICE_TOKEN + X-Actor-*).",
        docs_url="/internal/docs" if docs else None,
        redoc_url=None,
        swagger_ui_oauth2_redirect_url=None,
        openapi_url="/internal/openapi.json" if docs else None,
        servers=[{"url": "http://localhost:4100"}],
    )
    app.state.pool = pool
    install_error_handlers(app)

    @app.exception_handler(psycopg.Error)
    async def _db_error(req: Request, exc: psycopg.Error) -> JSONResponse:
        # Erros do PostgreSQL com significado para o cliente
        code = exc.sqlstate or ""
        if code == "23505":
            return error(409, "conflict", "Já existe um registo com esse identificador (slug, n.º, …)")
        if code in ("23514", "22P02", "22007", "22008"):
            return error(400, "invalid", "Valor inválido")
        if "identity_locked" in str(exc):
            return error(409, "identity_locked", "Dados de identificação só mudam por pedido validado pela secretaria")
        log.exception("erro da base de dados em %s %s", req.method, req.url.path, exc_info=exc)
        return error(500, "internal", "Erro interno")

    @app.middleware("http")
    async def _service_auth(req: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        path = req.url.path
        if path in PUBLIC or path.startswith("/internal/docs"):
            req.state.actor = Actor()
            return await call_next(req)
        if not _token_ok(req.headers.get("authorization")):
            return error(401, "invalid_service_token", "Token de serviço inválido")
        # O middleware diz QUEM é; os papéis (e se a conta está ativa) vêm sempre da base de dados,
        # para que uma conta desativada ou um papel retirado deixem de valer logo, mesmo com sessão aberta
        actor_id = req.headers.get("x-actor-id", "")
        if not UUID.match(actor_id):
            req.state.actor = Actor()
            return await call_next(req)
        row = await fetch_one(
            pool,
            """select coalesce(array_agg(r.role) filter (where r.role is not null), '{}') as roles
                 from users u left join user_roles r on r.user_id = u.id where u.id = %s and not u.disabled group by u.id""",
            [actor_id],
        )
        if not row:
            return error(401, "session_revoked", "A sessão já não é válida. Entra de novo.")
        req.state.actor = Actor(id=actor_id, roles=[r for r in row["roles"] if r in ROLES])
        return await call_next(req)

    @app.get("/internal/health", include_in_schema=False)
    async def health() -> dict[str, bool]:
        await fetch_one(pool, "select 1")
        return {"ok": True}

    v1 = APIRouter(prefix="/internal/v1")
    for module in (auth, media, cms, athletes, members, results, admin, payments):
        module.register(v1)
    app.include_router(v1)
    app.add_middleware(BodyLimit, limit_for=_body_limit)  # type: ignore[arg-type]
    return app


__all__ = ["HttpError", "build_backend"]
