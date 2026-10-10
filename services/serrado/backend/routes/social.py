"""
Reels e histórias da página de Facebook (importados por serrado.facebook): lista pública para o
site e, no backoffice, esconder ou voltar a mostrar cada um.
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request
from pydantic import BaseModel, ConfigDict

from ...db.pool import fetch, tx
from ..core import actor, audit, camel, not_found, pool, require

Id = Annotated[int, Path(ge=1)]
FIELDS = """id, kind, caption, permalink, media_type, thumb_url, duration_seconds::float as duration_seconds,
            posted_at, expires_at"""


class Visibility(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hidden: bool


def register(r: APIRouter) -> None:
    @r.get("/social", tags=["Conteúdos"], summary="Reels e histórias visíveis no site (histórias: só nas 24 h seguintes)")
    async def public(
        req: Request,
        kind: Annotated[Literal["reel", "story"], Query()] = "reel",
        limit: Annotated[int, Query(ge=1, le=24)] = 12,
    ) -> list[dict[str, Any]]:
        rows = await fetch(
            pool(req),
            f"""select {FIELDS} from social_items
                 where kind = %s and not hidden and thumb_url is not null and (expires_at is null or expires_at > now())
                 order by posted_at desc limit %s""",
            [kind, limit],
        )
        return [camel(x) for x in rows]

    tags: list[str | Any] = ["Backoffice · Redes sociais"]

    @r.get("/social/admin", tags=tags, summary="Reels e histórias importados (incluindo escondidos e expirados)")
    async def admin_list(req: Request) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        rows = await fetch(
            pool(req),
            f"""select {FIELDS}, hidden, (expires_at is not null and expires_at <= now()) as expired
                  from social_items order by posted_at desc limit 200""",
        )
        return [camel(x) for x in rows]

    @r.patch("/social/{id}", tags=tags, summary="Esconde ou volta a mostrar no site")
    async def set_hidden(req: Request, id: Id, body: Visibility) -> dict[str, Any]:
        require(req, "cms.edit")
        who = actor(req)
        async with tx(pool(req)) as c:
            cur = await c.execute(
                "update social_items set hidden = %s, updated_by = %s, updated_at = now() where id = %s returning id, kind, hidden",
                [body.hidden, who.id, id],
            )
            row = await cur.fetchone()
            if not row:
                raise not_found("Publicação")
            await audit(c, who, "social.hide" if body.hidden else "social.show", "social_items", id, {"kind": row["kind"]})
        return camel(row)
