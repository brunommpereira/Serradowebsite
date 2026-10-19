"""Notificações da app (PWA): subscrição do dispositivo (com ou sem sessão) e avisos da comunicação."""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Request, Response

from ...web import HttpError
from ..deps import backend
from ..session import Session, session, staff

JsonObject = Annotated[dict[str, Any], Body()]


async def maybe_session(req: Request) -> Session | None:
    """Com sessão, os temas pessoais (pagamentos, pedidos de gasto) ficam ligados à conta."""
    try:
        return await session(req)
    except HttpError:
        return None


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Notificações"]

    @r.get("/push/key", tags=tags, summary="Chave pública para subscrever, temas e modalidades")
    async def key(req: Request) -> Any:
        return await backend(req).call("GET", "/push/key")

    @r.post("/push/subscribe", tags=tags, summary="Ativar ou alterar as notificações deste dispositivo")
    async def subscribe(req: Request, body: JsonObject) -> Any:
        body = {**body, "userAgent": req.headers.get("user-agent", "")[:400]}
        return await backend(req).call("POST", "/push/subscribe", actor=await maybe_session(req), body=body)

    @r.post("/push/status", tags=tags, summary="Temas ativos neste dispositivo")
    async def status(req: Request, body: JsonObject) -> Any:
        return await backend(req).call("POST", "/push/status", actor=await maybe_session(req), body=body)

    @r.post("/push/unsubscribe", tags=tags, summary="Desligar as notificações deste dispositivo", status_code=204)
    async def unsubscribe(req: Request, body: JsonObject) -> Response:
        await backend(req).call("POST", "/push/unsubscribe", body=body)
        return Response(status_code=204)

    @r.get("/admin/push/stats", tags=["Backoffice · Notificações"], summary="Dispositivos por tema")
    async def stats(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/push/stats", actor=s)

    @r.post("/admin/push/broadcast", tags=["Backoffice · Notificações"], summary="Enviar um aviso a quem segue um tema")
    async def broadcast(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/push/broadcast", actor=s, body=body)
