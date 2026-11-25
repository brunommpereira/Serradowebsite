"""
Redes sociais no backoffice:
- reels e histórias da página de Facebook (importados por serrado.facebook): lista pública para o
  site e, no backoffice, esconder ou voltar a mostrar cada um;
- publicar no Facebook e no Instagram (serrado.social_publish): agora ou agendado.
"""

import re
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ... import social_publish
from ...db.pool import Pool, fetch, fetch_one, tx
from ...facebook import FacebookError
from ..core import HttpError, actor, audit, camel, not_found, pool, require

Id = Annotated[int, Path(ge=1)]
FIELDS = """id, kind, caption, permalink, media_type, thumb_url, duration_seconds::float as duration_seconds,
            posted_at, expires_at"""


class Visibility(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hidden: bool


def register(r: APIRouter) -> None:
    register_publish(r)

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


# ------------------------------------------------------------------ publicar nas redes
Network = Literal["facebook", "instagram"]
POST_FIELDS = """p.id, p.network, p.news_id, n.title as news_title, p.caption, p.link, p.image_url, p.scheduled_at, p.status,
                 p.attempts, p.error, p.external_id, p.permalink, p.created_at, p.published_at, u.name as created_by_name"""


class NewSocialPost(BaseModel):
    model_config = ConfigDict(extra="forbid")
    networks: Annotated[list[Network], Field(min_length=1, max_length=2)]
    caption: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2200)]
    link: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500, pattern=r"^https://\S+$")] = None
    image_url: Annotated[
        str | None, StringConstraints(strip_whitespace=True, max_length=500, pattern=r"^(https://\S+|/[A-Za-z0-9/._-]+)$"), Field(alias="imageUrl")
    ] = None
    news_id: Annotated[int | None, Field(ge=1, alias="newsId")] = None
    # Vazio = agora
    scheduled_at: Annotated[datetime | None, Field(alias="scheduledAt")] = None

    @field_validator("networks")
    @classmethod
    def _unique(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("rede repetida")
        return v


async def _run_dispatch(p: Pool, ids: list[int]) -> None:
    try:
        await social_publish.dispatch(p, ids=ids)
    except Exception:  # noqa: BLE001 — corre depois da resposta; o estado fica na tabela e o timer volta a tentar
        social_publish.log.exception("publicar agora")


def register_publish(r: APIRouter) -> None:
    tags: list[str | Any] = ["Backoffice · Redes sociais"]

    @r.get("/social-posts/status", tags=tags, summary="Página de Facebook e conta de Instagram ligadas")
    async def status(req: Request) -> dict[str, Any]:
        require(req, "cms.edit")
        if not social_publish.configured():
            return {"configured": False, "page": None, "instagram": None, "error": None}
        try:
            got = await social_publish.accounts()
        except FacebookError as e:
            return {"configured": True, "page": None, "instagram": None, "error": str(e)}
        return {"configured": True, **got, "error": None}

    @r.get("/social-posts", tags=tags, summary="Publicações nas redes (agendadas, publicadas e com erro)")
    async def list_posts(req: Request, limit: Annotated[int, Query(ge=1, le=200)] = 60) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        rows = await fetch(
            pool(req),
            f"""select {POST_FIELDS} from social_posts p left join cms_news n on n.id = p.news_id left join users u on u.id = p.created_by
                 order by p.created_at desc, p.id desc limit %s""",
            [limit],
        )
        return [camel(x) for x in rows]

    @r.post("/social-posts", tags=tags, summary="Publica agora ou agenda (uma linha por rede)")
    async def create(req: Request, body: NewSocialPost, background: BackgroundTasks) -> list[dict[str, Any]]:
        require(req, "cms.edit")
        if not social_publish.configured():
            raise HttpError(409, "not_configured", "O Facebook ainda não está ligado no servidor (sudo serrado facebook).")
        if "instagram" in body.networks and not body.image_url:
            raise HttpError(400, "image_required", "O Instagram exige uma imagem.")
        if "instagram" in body.networks and len(re.findall(r"#\w", body.caption)) > 30:
            raise HttpError(400, "too_many_hashtags", "O Instagram aceita no máximo 30 hashtags.")
        now = datetime.now(UTC)
        when = body.scheduled_at
        if when is not None:
            if when.tzinfo is None:
                raise HttpError(400, "validation", "scheduledAt: indica o fuso horário")
            if when < now - timedelta(minutes=2):
                raise HttpError(400, "in_the_past", "A data marcada já passou.")
            if when > now + timedelta(days=75):
                raise HttpError(400, "too_far", "Só se pode agendar até 75 dias.")
        if body.news_id and not await fetch_one(pool(req), "select 1 from cms_news where id = %s", [body.news_id]):
            raise not_found("Notícia")
        who = actor(req)
        ids: list[int] = []
        async with tx(pool(req)) as c:
            for network in sorted(body.networks):
                cur = await c.execute(
                    """insert into social_posts (network, news_id, caption, link, image_url, scheduled_at, created_by)
                       values (%s, %s, %s, %s, %s, coalesce(%s, now()), %s) returning id""",
                    [network, body.news_id, body.caption, body.link, body.image_url, when, who.id],
                )
                row = await cur.fetchone()
                assert row is not None
                ids.append(int(row["id"]))
                await audit(
                    c, who, "social.schedule", "social_posts", row["id"], {"network": network, "news": body.news_id, "at": when and when.isoformat()}
                )
        if when is None or when <= now:
            background.add_task(_run_dispatch, pool(req), ids)
        rows = await fetch(
            pool(req),
            f"""select {POST_FIELDS} from social_posts p left join cms_news n on n.id = p.news_id left join users u on u.id = p.created_by
                 where p.id = any(%s) order by p.id""",
            [ids],
        )
        return [camel(x) for x in rows]

    @r.post("/social-posts/{id}/{action}", tags=tags, summary="Cancela uma agendada ou volta a tentar uma que falhou")
    async def act(req: Request, id: Id, action: Literal["cancel", "retry"], background: BackgroundTasks) -> dict[str, Any]:
        require(req, "cms.edit")
        who = actor(req)
        async with tx(pool(req)) as c:
            if action == "cancel":
                cur = await c.execute(
                    "update social_posts set status = 'cancelled', updated_at = now() where id = %s and status = 'scheduled' returning id, status",
                    [id],
                )
            else:
                cur = await c.execute(
                    """update social_posts set status = 'scheduled', scheduled_at = now(), attempts = 0, error = null, updated_at = now()
                       where id = %s and status = 'failed' returning id, status""",
                    [id],
                )
            row = await cur.fetchone()
            if not row:
                raise HttpError(409, "invalid_state", "Só se cancela uma agendada e só se repete uma que falhou.")
            await audit(c, who, f"social.{action}", "social_posts", id, None)
        if action == "retry":
            background.add_task(_run_dispatch, pool(req), [id])
        return camel(row)
