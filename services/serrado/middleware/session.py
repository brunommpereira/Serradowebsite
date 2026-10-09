"""Sessão: JWT assinado (HS256) num cookie httpOnly. As permissões decide-as o backend, a cada pedido."""

import time

import jwt
from fastapi import Request

from ..config import config
from ..web import HttpError
from .backend_client import Session

SESSION_COOKIE = "sfc_session"
JWT_ALGORITHM = "HS256"
# Quem emite a sessão e para quem ela serve: um token assinado com o mesmo segredo
# mas para outro fim (outro emissor ou outra audiência) não abre uma sessão
JWT_ISSUER = "serrado-fc/middleware"
JWT_AUDIENCE = "serrado-fc/api"


def sign_session(user_id: str, name: str, roles: list[str]) -> str:
    now = int(time.time())
    payload = {
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "sub": user_id,
        "name": name,
        "roles": roles,
        "iat": now,
        "exp": now + int(config.session_hours * 3600),
    }
    return jwt.encode(payload, config.jwt_secret, algorithm=JWT_ALGORITHM)


async def session(req: Request) -> Session:
    """Exige sessão (cookie httpOnly ou Authorization: Bearer); devolve o utilizador."""
    token = req.cookies.get(SESSION_COOKIE)
    header = req.headers.get("authorization", "")
    if not token and header.startswith("Bearer "):
        token = header[7:]
    try:
        payload = jwt.decode(
            token or "",
            config.jwt_secret,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
            options={"require": ["iss", "aud", "exp", "iat", "sub"]},
        )
        return Session(
            sub=str(payload["sub"]), name=str(payload.get("name", "")), roles=[str(r) for r in payload.get("roles", [])], iat=int(payload["iat"])
        )
    except jwt.PyJWTError:
        raise HttpError(401, "unauthenticated", "Sessão inválida ou expirada") from None


async def staff(req: Request) -> Session:
    """Exige sessão para o backoffice. Quem decide o que cada um pode fazer é o backend, pelas
    permissões dos papéis (editáveis no backoffice): assim uma mudança vale logo, sem nova sessão."""
    return await session(req)
