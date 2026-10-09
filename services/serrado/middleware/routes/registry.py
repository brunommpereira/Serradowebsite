"""
Backoffice: sócios e atletas (à mão e por ficheiro). Registado antes do router /admin, que tem
uma rota genérica «/{kind}/{id}/{action}» que apanharia estes caminhos. As permissões verifica-as o backend.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Request, Response

from ..deps import backend
from ..session import staff

Number = Annotated[str, Path(pattern=r"^\d{1,8}$")]
AthleteId = Annotated[str, Path(pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]
JsonObject = Annotated[dict[str, Any], Body()]


def _q(req: Request) -> dict[str, Any]:
    return dict(req.query_params)


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Backoffice · Sócios e atletas"]

    @r.get("/admin/members", tags=tags, summary="Sócios (filtros: q, status, category)")
    async def members(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/members", actor=s, query=_q(req))

    @r.post("/admin/members", tags=tags, summary="Criar sócio", status_code=201)
    async def create_member(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/members", actor=s, body=body)

    @r.get("/admin/members/{number}", tags=tags, summary="Ficha do sócio (dados, conta, atletas e quotas)")
    async def member(req: Request, number: Number) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/members/{number}/detail", actor=s)

    @r.put("/admin/members/{number}", tags=tags, summary="Alterar sócio")
    async def update_member(req: Request, number: Number, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/members/{number}", actor=s, body=body)

    @r.post("/admin/members/{number}/quotas", tags=tags, summary="Quota avulsa", status_code=201)
    async def add_quota(req: Request, number: Number, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/members/{number}/quotas", actor=s, body=body)

    @r.post("/admin/athletes", tags=tags, summary="Criar atleta", status_code=201)
    async def create_athlete(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/athletes", actor=s, body=body)

    @r.put("/admin/athletes/{id}", tags=tags, summary="Alterar a ficha do atleta (backoffice)")
    async def update_athlete(req: Request, id: AthleteId, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/athletes/{id}/admin", actor=s, body=body)

    @r.get("/admin/athletes/{id}/access", tags=tags, summary="Contas com acesso à ficha")
    async def access(req: Request, id: AthleteId) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/athletes/{id}/access", actor=s)

    @r.post("/admin/athletes/{id}/access", tags=tags, summary="Dar acesso a um encarregado", status_code=201)
    async def add_access(req: Request, id: AthleteId, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/athletes/{id}/access", actor=s, body=body)

    @r.delete("/admin/athletes/{id}/access/{user}", tags=tags, summary="Retirar acesso", status_code=204)
    async def remove_access(req: Request, id: AthleteId, user: AthleteId) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/athletes/{id}/access/{user}", actor=s)
        return Response(status_code=204)

    @r.post("/admin/registry/import", tags=tags, summary="Importar sócios ou atletas (CSV/XLSX lido no browser)")
    async def import_registry(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/registry/import", actor=s, body=body)
