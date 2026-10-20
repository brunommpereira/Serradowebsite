"""
Inscrições em eventos: formulário público (/events/{slug}/registrations) e lista no backoffice
(/admin/event-registrations). Registado antes do router /admin (a rota genérica «/{kind}/{id}/{action}»
apanharia estes caminhos).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Request, Response

from ..deps import backend
from ..session import staff

Id = Annotated[int, Path(ge=1)]
Slug = Annotated[str, Path(pattern=r"^[a-z0-9-]{1,120}$")]
JsonObject = Annotated[dict[str, Any], Body()]


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Inscrições em eventos"]

    @r.get("/events/{slug}/availability", tags=tags, summary="Vagas e se o evento aceita inscrições")
    async def availability(req: Request, slug: Slug) -> Any:
        return await backend(req).call("GET", f"/events/{slug}/availability")

    @r.post("/events/{slug}/registrations", tags=tags, summary="Inscrição num evento", status_code=201)
    async def create(req: Request, slug: Slug, body: JsonObject) -> Any:
        # O IP vem do middleware (regras de proxy de confiança), nunca do formulário
        client = {"ip": str(req.state.ip), "userAgent": req.headers.get("user-agent", "")[:400]}
        return await backend(req).call("POST", f"/events/{slug}/registrations", body={"form": body, "client": client})

    admin_tags: list[str | Any] = ["Backoffice · Inscrições em eventos"]

    @r.get("/admin/event-registrations/events", tags=admin_tags, summary="Eventos com inscrição e totais")
    async def events(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/event-registrations/events", actor=s)

    @r.get("/admin/event-registrations", tags=admin_tags, summary="Inscrições de um evento (?eventId=)")
    async def list_(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/event-registrations", actor=s, query=dict(req.query_params))

    @r.patch("/admin/event-registrations/{id}", tags=admin_tags, summary="Estado e nota interna")
    async def update(req: Request, id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PATCH", f"/event-registrations/{id}", actor=s, body=body)

    @r.delete("/admin/event-registrations/{id}", tags=admin_tags, summary="Apagar", status_code=204)
    async def delete(req: Request, id: Id) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/event-registrations/{id}", actor=s)
        return Response(status_code=204)
