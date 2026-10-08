"""Acesso ao cliente do backend e à cache a partir de um pedido."""

from fastapi import Request

from .backend_client import BackendClient
from .cache import TtlCache


def backend(req: Request) -> BackendClient:
    return req.app.state.backend  # type: ignore[no-any-return]


def cache(req: Request) -> TtlCache:
    return req.app.state.cache  # type: ignore[no-any-return]
