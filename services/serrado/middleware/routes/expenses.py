"""
Pedidos de gasto (backoffice): pedido → tesoureiro do núcleo → tesoureiro da direção (pagamento).
Registado antes do router /admin (a rota genérica «/{kind}/{id}/{action}» apanharia estes caminhos).
As permissões e as regras de quem aprova o quê estão no backend.
"""

import base64
from typing import Annotated, Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Body, Path, Request, Response

from ..deps import backend
from ..session import staff

Id = Annotated[int, Path(ge=1)]
FileId = Annotated[str, Path(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
JsonObject = Annotated[dict[str, Any], Body()]
Nucleo = Literal["direcao", "atletismo", "futsal", "rugby", "formacao", "escola-de-desporto"]


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Backoffice · Pedidos de gasto"]

    @r.get("/admin/expenses/meta", tags=tags, summary="Núcleos, categorias e o que o utilizador pode fazer")
    async def meta(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/expenses/meta", actor=s)

    @r.get("/admin/expenses", tags=tags, summary="Pedidos (scope: todo, mine, all; year)")
    async def list_(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/expenses", actor=s, query=dict(req.query_params))

    @r.post("/admin/expenses", tags=tags, summary="Novo pedido de gasto (anexos em base64)", status_code=201)
    async def create(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/expenses", actor=s, body=body)

    @r.get("/admin/expenses/files/{file_id}", tags=tags, summary="Descarregar um anexo")
    async def download(req: Request, file_id: FileId) -> Response:
        s = await staff(req)
        out = await backend(req).call("GET", f"/expenses/files/{file_id}", actor=s)
        name = str(out["filename"])
        return Response(
            content=base64.b64decode(out["data"]),
            media_type=str(out["mime"]),
            headers={
                "content-disposition": f"attachment; filename*=UTF-8''{quote(name)}",
                "cache-control": "private, no-store",
                "x-content-type-options": "nosniff",
            },
        )

    @r.get("/admin/expenses-approvers", tags=tags, summary="Tesoureiros de cada núcleo")
    async def approvers(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/expenses-approvers", actor=s)

    @r.put("/admin/expenses-approvers/{nucleo}", tags=tags, summary="Definir os tesoureiros de um núcleo")
    async def set_approvers(req: Request, nucleo: Nucleo, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("PUT", f"/expenses-approvers/{nucleo}", actor=s, body=body)

    @r.get("/admin/expenses/{id}", tags=tags, summary="Pedido, com anexos e histórico")
    async def get(req: Request, id: Id) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/expenses/{id}", actor=s)

    @r.post("/admin/expenses/{id}/files", tags=tags, summary="Juntar um anexo (ex.: a fatura-recibo final)", status_code=201)
    async def upload(req: Request, id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/expenses/{id}/files", actor=s, body=body)

    @r.post("/admin/expenses/{id}/{step}", tags=tags, summary="Decidir, pagar, anular ou marcar a fatura recebida")
    async def act(req: Request, id: Id, step: Literal["nucleo", "final", "pay", "cancel", "invoice"], body: JsonObject | None = None) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/expenses/{id}/{step}", actor=s, body=body or {})
