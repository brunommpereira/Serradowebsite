"""Peças do backend: quem pede (actor), permissões, auditoria e conversão de nomes."""

import re
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request

from ..db.pool import Conn, Jsonb, Pool, Row
from ..web import HttpError, forbidden, not_found

__all__ = ["Actor", "HttpError", "audit", "camel", "can", "forbidden", "not_found", "pool", "require", "require_user", "snake"]


@dataclass
class Actor:
    """Quem faz o pedido: o middleware envia o id (X-Actor-Id); os papéis vêm da base de dados."""

    id: str | None = None
    roles: list[str] = field(default_factory=list)
    # Permissões efetivas (dos papéis, configuradas no backoffice; admin tem todas)
    permissions: set[str] = field(default_factory=set)


def actor(req: Request) -> Actor:
    return req.state.actor  # type: ignore[no-any-return]


def pool(req: Request) -> Pool:
    return req.app.state.pool  # type: ignore[no-any-return]


def can(req: Request, *permissions: str) -> bool:
    """Tem pelo menos uma das permissões (sem argumentos: é da equipa, com alguma permissão)."""
    granted = actor(req).permissions
    return bool(granted) if not permissions else any(p in granted for p in permissions)


def require(req: Request, *permissions: str) -> None:
    if not can(req, *permissions):
        raise forbidden()


def require_user(req: Request) -> str:
    user_id = actor(req).id
    if not user_id:
        raise HttpError(401, "unauthenticated", "Sessão necessária")
    return user_id


async def audit(c: Conn, who: Actor, action: str, entity: str, entity_id: str | int | None, details: dict[str, Any] | None = None) -> None:
    """Regista uma escrita no audit_log (na mesma transação)."""
    await c.execute(
        "insert into audit_log (actor_id, action, entity, entity_id, details) values (%s, %s, %s, %s, %s)",
        [who.id, action, entity, None if entity_id is None else str(entity_id), Jsonb(details or {})],
    )


_CAMEL = re.compile(r"_([a-z])")


def camel(row: Row) -> dict[str, Any]:
    """snake_case (BD) → camelCase (API)"""
    return {_CAMEL.sub(lambda m: m.group(1).upper(), k): v for k, v in row.items()}


def snake(key: str) -> str:
    return re.sub(r"[A-Z]", lambda m: "_" + m.group(0).lower(), key)
