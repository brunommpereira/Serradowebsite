"""Gestão: indicadores do backoffice e registo de auditoria."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request

from ...db.pool import fetch, fetch_one
from ...validation import current_season
from ..core import actor, camel, has_role, pool, require_role


def register(r: APIRouter) -> None:
    @r.get("/stats", tags=["Gestão"], summary="Indicadores do backoffice (contagens)")
    async def stats(req: Request) -> dict[str, Any]:
        require_role(req, "editor", "secretaria", "treinador")
        season = current_season()
        row = await fetch_one(
            pool(req),
            """select
                 (select count(*)::int from cms_news where status = 'published') as news_published,
                 (select count(*)::int from cms_news where status = 'draft') as news_drafts,
                 (select count(*)::int from cms_events where status = 'published' and starts_at >= now()) as events_upcoming,
                 (select count(*)::int from cms_pages where status = 'draft') + (select count(*)::int from cms_events where status = 'draft')
                   + (select count(*)::int from cms_partners where status = 'draft') as other_drafts,
                 (select count(*)::int from athletes) as athletes,
                 (select count(*)::int from athletes where confirmed_at is null or confirmed_at < %s::date) as athletes_to_confirm,
                 (select count(*)::int from athlete_documents where status = 'Em análise') as documents_to_review,
                 (select count(*)::int from athlete_change_requests where status = 'pendente') as change_requests,
                 (select count(*)::int from members where status = 'Ativo') as members_active,
                 (select count(*)::int from results) as results""",
            [season.start],
        )
        return {**camel(row or {}), "season": season.label}

    @r.get("/audit", tags=["Gestão"], summary="Registo de auditoria (admin; restantes staff veem o próprio)")
    async def audit_log(req: Request, limit: Annotated[int, Query(ge=1, le=500)] = 100) -> list[dict[str, Any]]:
        require_role(req, "editor", "secretaria", "treinador")
        everything = has_role(req)  # só admin (has_role sem papéis extra = admin)
        where = "" if everything else "where l.actor_id = %s"
        args: list[Any] = [] if everything else [actor(req).id]
        rows = await fetch(
            pool(req),
            f"""select l.id, l.at, l.action, l.entity, l.entity_id, l.details, u.name as actor
                  from audit_log l left join users u on u.id = l.actor_id
                 {where} order by l.at desc, l.id desc limit %s""",
            [*args, limit],
        )
        return [camel(x) for x in rows]
