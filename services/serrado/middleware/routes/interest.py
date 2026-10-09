"""
Pré-inscrições: formulário público (/interest) e acompanhamento no backoffice (/admin/interest).
Registado antes do router /admin (a rota genérica «/{kind}/{id}/{action}» apanharia estes caminhos).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Request, Response

from ..deps import backend
from ..session import staff

Id = Annotated[int, Path(ge=1)]
JsonObject = Annotated[dict[str, Any], Body()]


def register(r: APIRouter) -> None:
    @r.post("/interest", tags=["Pré-inscrições"], summary="Pré-inscrição (pais deixam os contactos)", status_code=201)
    async def create(req: Request, body: JsonObject) -> Any:
        # O IP vem do middleware (regras de proxy de confiança), nunca do formulário
        client = {"ip": str(req.state.ip), "userAgent": req.headers.get("user-agent", "")[:400]}
        return await backend(req).call("POST", "/interest", body={"form": body, "client": client})

    tags: list[str | Any] = ["Backoffice · Pré-inscrições"]

    @r.get("/admin/interest", tags=tags, summary="Pré-inscrições (filtros: status, sport)")
    async def list_(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/interest", actor=s, query=dict(req.query_params))

    @r.patch("/admin/interest/{id}", tags=tags, summary="Estado e nota interna")
    async def update(req: Request, id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PATCH", f"/interest/{id}", actor=s, body=body)

    @r.delete("/admin/interest/{id}", tags=tags, summary="Apagar", status_code=204)
    async def delete(req: Request, id: Id) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/interest/{id}", actor=s)
        return Response(status_code=204)
