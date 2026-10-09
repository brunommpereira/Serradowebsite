"""
Conteúdos do site (blocos): público em /content/blocks e edição em /admin/site/blocks.
Registado antes do router /admin (a rota genérica «/{kind}/{id}/{action}» apanharia estes caminhos).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Body, Path, Request, Response

from ..deps import backend, cache
from ..session import staff

Key = Annotated[str, Path(pattern=r"^[a-z][a-z0-9-]{1,40}$")]
JsonObject = Annotated[dict[str, Any], Body()]


def register(r: APIRouter) -> None:
    @r.get("/content/blocks", tags=["Conteúdo público"], summary="Blocos editados no backoffice (o site junta-os ao conteúdo original)")
    async def blocks(req: Request, resp: Response) -> Any:
        async def load() -> Any:
            return await backend(req).call("GET", "/site/blocks")

        resp.headers["cache-control"] = "public, max-age=60"
        return await cache(req).get("content:blocks", load)

    tags: list[str | Any] = ["Backoffice · Conteúdos do site"]

    @r.get("/admin/site/blocks/{key}", tags=tags, summary="Um bloco")
    async def get(req: Request, key: Key) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/site/blocks/{key}", actor=s)

    @r.put("/admin/site/blocks/{key}", tags=tags, summary="Gravar")
    async def save(req: Request, key: Key, body: JsonObject) -> Any:
        s = await staff(req)
        out = await backend(req).call("PUT", f"/site/blocks/{key}", actor=s, body=body)
        cache(req).invalidate("content:")
        return out

    @r.delete("/admin/site/blocks/{key}", tags=tags, summary="Voltar ao conteúdo original", status_code=204)
    async def reset(req: Request, key: Key) -> Response:
        s = await staff(req)
        await backend(req).call("DELETE", f"/site/blocks/{key}", actor=s)
        cache(req).invalidate("content:")
        return Response(status_code=204)

    @r.get("/admin/site/blocks/{key}/revisions", tags=tags, summary="Histórico de versões")
    async def revisions(req: Request, key: Key) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", f"/site/blocks/{key}/revisions", actor=s)

    @r.post("/admin/site/blocks/{key}/revisions/{rev}/restore", tags=tags, summary="Repor versão")
    async def restore(req: Request, key: Key, rev: Annotated[int, Path(ge=1)]) -> Any:
        s = await staff(req)
        out = await backend(req).call("POST", f"/site/blocks/{key}/revisions/{rev}/restore", actor=s)
        cache(req).invalidate("content:")
        return out
