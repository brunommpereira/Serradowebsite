"""Troféu de Almada: pedidos de inscrição (área do atleta) e acompanhamento no backoffice. As permissões verifica-as o backend."""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Request

from ..deps import backend
from ..session import session, staff

AthleteId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
Id = Annotated[int, Path(ge=1)]
JsonObject = Annotated[dict[str, Any], Body()]


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Área de Atletas"]

    @r.get("/athletes/{id}/trophy", tags=tags, summary="Troféu de Almada: provas e estado da inscrição")
    async def trophy(req: Request, id: AthleteId) -> Any:
        s = await session(req)
        return await backend(req).call("GET", f"/athletes/{id}/trophy", actor=s)

    @r.post("/athletes/{id}/trophy/signup", tags=tags, summary="Pedir a inscrição no Troféu")
    async def signup(req: Request, id: AthleteId, body: JsonObject) -> Any:
        s = await session(req)
        return await backend(req).call("POST", f"/athletes/{id}/trophy/signup", actor=s, body=body)

    @r.delete("/athletes/{id}/trophy/signup", tags=tags, summary="Cancelar o pedido de inscrição")
    async def cancel(req: Request, id: AthleteId) -> Any:
        s = await session(req)
        return await backend(req).call("DELETE", f"/athletes/{id}/trophy/signup", actor=s)

    office: list[str | Any] = ["Backoffice · Troféu de Almada"]

    @r.get("/admin/races/editions", tags=office, summary="Edições, provas e contagens")
    async def editions(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/races/editions", actor=s)

    @r.post("/admin/races/editions", tags=office, summary="Nova edição", status_code=201)
    async def create(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/races/editions", actor=s, body=body)

    @r.put("/admin/races/editions/{edition_id}", tags=office, summary="Alterar edição")
    async def update(req: Request, edition_id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/races/editions/{edition_id}", actor=s, body=body)

    @r.put("/admin/races/editions/{edition_id}/calendar", tags=office, summary="Provas da edição")
    async def calendar(req: Request, edition_id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/races/editions/{edition_id}/calendar", actor=s, body=body)

    @r.get("/admin/races/editions/{edition_id}/signups", tags=office, summary="Pedidos de inscrição")
    async def signups(req: Request, edition_id: Id) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/races/editions/{edition_id}/signups", actor=s, query=dict(req.query_params))

    @r.post("/admin/races/editions/{edition_id}/signups", tags=office, summary="Inscrever atletas (secretaria)")
    async def staff_signup(req: Request, edition_id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/races/editions/{edition_id}/signups", actor=s, body=body)

    @r.post("/admin/races/editions/{edition_id}/check", tags=office, summary="Testar a ligação à Xistarca")
    async def check(req: Request, edition_id: Id) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/races/editions/{edition_id}/check", actor=s)

    @r.post("/admin/races/run", tags=office, summary="Enviar já os pedidos em fila", status_code=202)
    async def run(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/races/run", actor=s)

    @r.post("/admin/races/signups/{signup_id}/{action}", tags=office, summary="retry · cancel · done")
    async def act(req: Request, signup_id: Id, action: Annotated[str, Path(pattern="^(retry|cancel|done)$")]) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/races/signups/{signup_id}/{action}", actor=s)
