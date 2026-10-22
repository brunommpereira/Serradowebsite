"""Novas entradas (backoffice): o que chegou pelo site nos últimos dias. Registado antes do router /admin."""

from typing import Any

from fastapi import APIRouter, Request

from ..deps import backend
from ..session import staff


def register(r: APIRouter) -> None:
    @r.get("/admin/recent-entries", tags=["Backoffice · Novas entradas"], summary="Entradas dos últimos dias (?days=30)")
    async def recent(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/recent-entries", actor=s, query=dict(req.query_params))
