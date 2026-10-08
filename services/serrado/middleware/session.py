"""Sessão: JWT assinado (HS256) num cookie httpOnly; permissões por papel."""

import time

import jwt
from fastapi import Request

from ..config import config
from ..web import HttpError
from .backend_client import Session

SESSION_COOKIE = "sfc_session"
JWT_ALGORITHM = "HS256"


def sign_session(user_id: str, name: str, roles: list[str]) -> str:
    now = int(time.time())
    payload = {"sub": user_id, "name": name, "roles": roles, "iat": now, "exp": now + int(config.session_hours * 3600)}
    return jwt.encode(payload, config.jwt_secret, algorithm=JWT_ALGORITHM)


async def session(req: Request) -> Session:
    """Exige sessão (cookie httpOnly ou Authorization: Bearer); devolve o utilizador."""
    token = req.cookies.get(SESSION_COOKIE)
    header = req.headers.get("authorization", "")
    if not token and header.startswith("Bearer "):
        token = header[7:]
    try:
        payload = jwt.decode(token or "", config.jwt_secret, algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})
        return Session(sub=str(payload["sub"]), name=str(payload.get("name", "")), roles=[str(r) for r in payload.get("roles", [])])
    except jwt.PyJWTError:
        raise HttpError(401, "unauthenticated", "Sessão inválida ou expirada") from None


async def staff(req: Request, *roles: str) -> Session:
    """Exige sessão com um dos papéis (admin passa sempre)."""
    s = await session(req)
    if not any(r == "admin" or r in roles for r in s.roles):
        raise HttpError(403, "forbidden", "Sem permissão para esta área")
    return s
