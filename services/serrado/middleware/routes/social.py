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

    # Publicar no Facebook e no Instagram (agora ou agendado)
    @r.get("/admin/social-posts/status", tags=tags, summary="Página de Facebook e conta de Instagram ligadas")
    async def publish_status(req: Request) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/social-posts/status", actor=s)

    @r.get("/admin/social-posts", tags=tags, summary="Publicações nas redes")
    async def publish_list(req: Request, limit: Annotated[int, Query(ge=1, le=200)] = 60) -> Any:
        s = await staff(req)
        return await backend(req).call("GET", "/social-posts", actor=s, query={"limit": limit})

    @r.post("/admin/social-posts", tags=tags, summary="Publica agora ou agenda no Facebook e/ou Instagram")
    async def publish_create(req: Request, body: JsonObject) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", "/social-posts", actor=s, body=body)

    @r.post("/admin/social-posts/{id}/{action}", tags=tags, summary="Cancela uma agendada ou volta a tentar uma que falhou")
    async def publish_action(req: Request, id: Id, action: Literal["cancel", "retry"]) -> Any:
        s = await staff(req)
        return await backend(req).call("POST", f"/social-posts/{id}/{action}", actor=s)
