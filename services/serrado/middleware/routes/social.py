"""
Reels e histórias da página de Facebook: lista pública (com cache de 60 s) e, no backoffice,
esconder ou mostrar. Registado antes do router /admin (a rota genérica «/{kind}/{id}/{action}»).
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Path, Query, Request, Response

from ..deps import backend, cache
from ..session import staff

Id = Annotated[int, Path(ge=1)]
JsonObject = Annotated[dict[str, Any], Body()]


def register(r: APIRouter) -> None:
    @r.get("/content/social", tags=["Conteúdos"], summary="Reels e histórias da página de Facebook")
    async def public(
        req: Request,
        resp: Response,
        kind: Annotated[Literal["reel", "story"], Query()] = "reel",
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
    ) -> Any:
        resp.headers["cache-control"] = "public, max-age=60"

        async def load() -> Any:
            return await backend(req).call("GET", "/social", query={"kind": kind, "limit": limit})

        return await cache(req).get(f"content:social:{kind}:{limit}", load)

    tags: list[str | Any] = ["Backoffice · Redes sociais"]

    @r.get("/admin/social", tags=tags, summary="Reels e histórias importados")
    async def admin_list(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/social/admin", actor=s)

    @r.patch("/admin/social/{id}", tags=tags, summary="Esconder ou mostrar no site")
    async def set_hidden(req: Request, id: Id, body: JsonObject) -> Any:
        s = await staff(req)
        out = await backend(req).call("PATCH", f"/social/{id}", actor=s, body=body)
        cache(req).invalidate("content:social:")
        return out
