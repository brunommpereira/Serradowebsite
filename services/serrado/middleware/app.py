"""
MIDDLEWARE (BFF) — API pública /api/v1 consumida pelo front.
Autenticação, permissões por papel, validação, rate limit, CORS, cache e
agregação. Não acede à base de dados: fala com o backend.
"""

import re
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from ..config import config
from ..web import BodyLimit, MiB, error, install_error_handlers
from .backend_client import BackendClient, BackendError
from .cache import TtlCache
from .net import RateLimiter, client_ip, compile_trust
from .oauth import OAuthProvider, configured_providers
from .routes import admin, auth, content, interest, me, payments, registry, signup, site
from .session import SESSION_COOKIE, session, sign_session, staff

# Limites por rota (por minuto e por IP); as restantes partilham o limite global (RATE_LIMIT_MAX)
ROUTE_LIMITS: list[tuple[str, re.Pattern[str], str, int]] = [
    ("POST", re.compile(r"^/api/v1/auth/login$"), "login", 10),
    ("POST", re.compile(r"^/api/v1/auth/password/forgot$"), "password-forgot", 5),
    ("POST", re.compile(r"^/api/v1/auth/password/reset$"), "password-reset", 10),
    ("POST", re.compile(r"^/api/v1/admin/media$"), "media-upload", 30),
    ("GET", re.compile(r"^/api/v1/auth/oauth/[^/]+$"), "oauth-start", 20),
    ("GET", re.compile(r"^/api/v1/auth/oauth/[^/]+/callback$"), "oauth-callback", 20),
    ("POST", re.compile(r"^/api/v1/me/payments$"), "payments", 10),
    ("POST", re.compile(r"^/api/v1/registrations/[a-z]+$"), "signup", 5),
    ("POST", re.compile(r"^/api/v1/interest$"), "interest", 5),
    ("POST", re.compile(r"^/api/v1/payments/stripe/webhook$"), "stripe-webhook", 600),
]
# Sem cookie de sessão nem X-Requested-With: autenticados pela assinatura do Stripe
CSRF_EXEMPT = ("/api/v1/payments/stripe/webhook",)


def _body_limit(method: str, path: str) -> int:
    if path == "/api/v1/admin/media":
        return 15 * MiB
    if path in ("/api/v1/admin/results/import", "/api/v1/admin/registry/import"):
        return 5 * MiB
    return MiB


def build_middleware(*, backend_client: BackendClient | None = None, oauth: dict[str, OAuthProvider] | None = None) -> FastAPI:
    app = FastAPI(
        title="Serrado FC — Middleware (API pública)",
        version="1.0.0",
        description="API consumida pelo front. Sessão por cookie httpOnly (sfc_session) ou Authorization: Bearer.",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        swagger_ui_oauth2_redirect_url=None,
        servers=[{"url": "http://localhost:4000"}],
    )
    app.state.backend = backend_client or BackendClient()
    app.state.cache = TtlCache()
    app.state.oauth = configured_providers() if oauth is None else oauth
    limiter = RateLimiter()
    trust = compile_trust(config.trust_proxy)
    install_error_handlers(app)

    @app.exception_handler(BackendError)
    async def _backend_error(_req: Request, exc: BackendError) -> JSONResponse:
        body = exc.body if isinstance(exc.body, dict) else {"error": "backend", "message": "Erro do serviço"}
        return JSONResponse(body, status_code=exc.status)

    @app.middleware("http")
    async def _guard(req: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        peer = req.client.host if req.client else "0.0.0.0"  # noqa: S104 — só um valor por omissão, não um endereço de escuta
        ip = client_ip(peer, req.headers.get("x-forwarded-for"), trust)
        req.state.ip = ip
        path = req.url.path
        # Limite por IP em toda a API (proteção contra abuso); login e carregamentos têm limites mais apertados
        if path != "/api/health" and req.method != "OPTIONS":
            bucket, limit = "global", config.rate_limit_max
            for method, pattern, name, max_ in ROUTE_LIMITS:
                if req.method == method and pattern.match(path):
                    bucket, limit = name, max_
                    break
            if not limiter.allow(bucket, ip, limit):
                return error(429, "rate_limited", "Demasiadas tentativas. Tenta novamente daqui a pouco.")
        # CSRF: pedidos que alteram dados com cookie de sessão têm de trazer X-Requested-With
        # (cabeçalho personalizado → obriga a preflight CORS, que só aceita as origens do site).
        if (
            req.method not in ("GET", "HEAD", "OPTIONS")
            and path not in CSRF_EXEMPT
            and not req.headers.get("authorization", "").startswith("Bearer ")
        ):
            if req.headers.get("x-requested-with") != "XMLHttpRequest":
                return error(403, "csrf", "Cabeçalho X-Requested-With em falta")
        return await call_next(req)

    @app.get("/api/health", include_in_schema=False)
    async def health() -> dict[str, Any]:
        return {"ok": True, "version": config.version}

    v1 = APIRouter(prefix="/api/v1")
    for module in (auth, content, me, payments, registry, signup, site, interest):
        module.register(v1)
    admin_router = APIRouter(prefix="/admin")
    admin.register(admin_router)
    v1.include_router(admin_router)
    app.include_router(v1)

    app.add_middleware(BodyLimit, limit_for=_body_limit)  # type: ignore[arg-type]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["content-type", "x-requested-with", "authorization"],
    )
    return app


__all__ = ["SESSION_COOKIE", "build_middleware", "session", "sign_session", "staff"]
