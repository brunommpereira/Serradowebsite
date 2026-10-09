"""Sócios: dados e quotas (o próprio sócio, ou a secretaria/admin)."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Request

from ...db.pool import Row, fetch, fetch_one
from ..core import actor, camel, can, forbidden, not_found, pool

Number = Annotated[str, Path(pattern=r"^\d{1,8}$")]


async def _check(req: Request, number: str) -> Row:
    row = await fetch_one(pool(req), "select * from members where member_number = %s", [number])
    if not row:
        raise not_found("Sócio")
    if row["user_id"] != actor(req).id and not can(req, "members.view"):
        raise forbidden()
    return row


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Sócios"]

    @r.get("/members/{number}", tags=tags, summary="Dados de sócio")
    async def member(req: Request, number: Number) -> dict[str, Any]:
        return camel(await _check(req, number))

    @r.get("/members/{number}/quotas", tags=tags, summary="Quotas e pagamentos")
    async def quotas(req: Request, number: Number) -> list[dict[str, Any]]:
        await _check(req, number)
        rows = await fetch(
            pool(req),
            """select id, period, amount, due_date, paid_at, payment_method, receipt_number,
                      case when paid_at is not null then 'Pago' when due_date < current_date then 'Em atraso' else 'Pendente' end as status
                 from quotas where member_number = %s order by due_date desc""",
            [number],
        )
        return [camel(x) for x in rows]
