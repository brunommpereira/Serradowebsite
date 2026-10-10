"""
Importação dos resultados do Troféu de Almada (results.csv gerado por
tools/trofeu-almada/consolidate.py, convertido em JSON pelo front).
"""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field, StringConstraints, field_validator

from ...db.pool import fetch, tx
from ...registry import link_results
from ..core import HttpError, actor, audit, camel, pool, require
from .athletes import _valid_date


class ResultRow(BaseModel):
    athleteCode: Annotated[str, StringConstraints(max_length=20)] | None = None
    athleteName: Annotated[str, StringConstraints(max_length=160)]
    birthYear: int | None = None
    season: Annotated[str, StringConstraints(pattern=r"^\d{4}/\d{4}$")]
    round: Annotated[int, Field(ge=1)]
    race: Annotated[str, StringConstraints(max_length=200)]
    raceBase: Annotated[str, StringConstraints(max_length=200)]
    raceDate: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    category: Annotated[str, StringConstraints(max_length=60)]
    place: int | None = None
    bib: Annotated[str, StringConstraints(max_length=20)] | None = None
    time: Annotated[str, StringConstraints(max_length=20)] | None = None
    timeS: float | None = None
    distanceM: int | None = None
    trophyPoints: int | None = None
    teamPoints: int | None = None
    sourceUrl: Annotated[str, StringConstraints(max_length=500)] | None = None

    _date = field_validator("raceDate")(_valid_date)


class Link(BaseModel):
    """Liga (ou desliga, sem athleteId) todos os resultados desta pessoa (nome + ano) a um atleta."""

    athleteName: Annotated[str, StringConstraints(min_length=2, max_length=160)]
    birthYear: int | None = None
    athleteId: Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F-]{36}$")] | None = None


class Import(BaseModel):
    rows: Annotated[list[ResultRow], Field(min_length=1, max_length=5000)]


def register(r: APIRouter) -> None:
    tags: list[str | Any] = ["Backoffice · Resultados"]

    @r.get("/results", tags=tags, summary="Resultados carregados (filtros: época, prova, escalão, nome, ligados ou não)")
    async def list_results(
        req: Request,
        season: Annotated[str | None, Query(max_length=9)] = None,
        race: Annotated[int | None, Query(ge=1)] = None,
        category: Annotated[str | None, Query(max_length=60)] = None,
        q: Annotated[str | None, Query(max_length=80)] = None,
        linked: Literal["yes", "no"] | None = None,
        limit: Annotated[int, Query(ge=1, le=2000)] = 500,
    ) -> dict[str, Any]:
        require(req, "results.import", "athletes.view")
        where: list[str] = ["true"]
        args: list[Any] = []
        if season:
            where.append("ra.season = %s")
            args.append(season)
        if race:
            where.append("ra.id = %s")
            args.append(race)
        if category:
            where.append("r.category = %s")
            args.append(category)
        if q:
            where.append("(r.athlete_name ilike %s or a.name ilike %s or a.code ilike %s)")
            args += [f"%{q}%"] * 3
        if linked == "yes":
            where.append("r.athlete_id is not null")
        if linked == "no":
            where.append("r.athlete_id is null")
        cond = " and ".join(where)
        rows = await fetch(
            pool(req),
            f"""select r.id, r.athlete_name, r.birth_year, r.category, r.place, r.time, r.trophy_points, r.team_points,
                       ra.id as race_id, ra.season, ra.round, ra.name as race, ra.race_date,
                       a.id as athlete_id, a.code as athlete_code, a.name as linked_name
                  from results r join races ra on ra.id = r.race_id left join athletes a on a.id = r.athlete_id
                 where {cond}
                 order by ra.race_date desc, r.category, r.place nulls last limit %s""",
            [*args, limit],
        )
        counts = await fetch(
            pool(req),
            f"""select count(*)::int as total, count(r.athlete_id)::int as linked
                  from results r join races ra on ra.id = r.race_id left join athletes a on a.id = r.athlete_id where {cond}""",
            args,
        )
        races = await fetch(pool(req), "select id, season, round, name, race_date from races order by race_date desc")
        cats = await fetch(pool(req), "select distinct category from results order by category")
        return {
            "items": [camel(x) for x in rows],
            "total": counts[0]["total"],
            "linked": counts[0]["linked"],
            "seasons": sorted({x["season"] for x in races}, reverse=True),
            "races": [camel(x) for x in races],
            "categories": [x["category"] for x in cats],
        }

    @r.post("/results/link", tags=tags, summary="Liga à mão os resultados de uma pessoa (nome + ano) a um atleta, ou desliga")
    async def link(req: Request, body: Link) -> dict[str, Any]:
        require(req, "results.import")
        async with tx(pool(req)) as c:
            if body.athleteId and not await (await c.execute("select 1 from athletes where id = %s", [body.athleteId])).fetchone():
                raise HttpError(404, "not_found", "Atleta não encontrado")
            cur = await c.execute(
                "update results set athlete_id = %s where athlete_name = %s and birth_year is not distinct from %s",
                [body.athleteId, body.athleteName, body.birthYear],
            )
            n = cur.rowcount
            await audit(
                c,
                actor(req),
                "results.link",
                "results",
                None,
                {"name": body.athleteName, "year": body.birthYear, "athlete": body.athleteId, "rows": n},
            )
        return {"updated": n}

    @r.post("/results/import", tags=["Backoffice · Resultados"], summary="Importa/atualiza resultados (idempotente por prova + atleta)")
    async def import_results(req: Request, body: Import) -> dict[str, Any]:
        require(req, "results.import")
        inserted = updated = linked = 0
        races: set[str] = set()
        async with tx(req.app.state.pool) as c:
            for x in body.rows:
                cur = await c.execute(
                    """insert into races (season, round, name, base_name, race_date) values (%s, %s, %s, %s, %s)
                       on conflict (season, round) do update set name = excluded.name, base_name = excluded.base_name, race_date = excluded.race_date returning id""",
                    [x.season, x.round, x.race, x.raceBase, x.raceDate],
                )
                race = await cur.fetchone()
                assert race is not None
                races.add(f"{x.season}#{x.round}")
                cur = await c.execute(
                    """insert into results (race_id, athlete_id, athlete_name, birth_year, category, place, bib, time, time_s, distance_m, trophy_points, team_points, source_url)
                       values (%s, (select id from athletes where code = %s), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       on conflict (race_id, athlete_name, birth_year) do update set athlete_id = excluded.athlete_id, category = excluded.category, place = excluded.place,
                         time = excluded.time, time_s = excluded.time_s, distance_m = excluded.distance_m, trophy_points = excluded.trophy_points, team_points = excluded.team_points
                       returning (xmax = 0) as inserted, athlete_id""",
                    [
                        race["id"],
                        x.athleteCode,
                        x.athleteName,
                        x.birthYear,
                        x.category,
                        x.place,
                        x.bib,
                        x.time,
                        x.timeS,
                        x.distanceM,
                        x.trophyPoints,
                        x.teamPoints,
                        x.sourceUrl,
                    ],
                )
                res = await cur.fetchone()
                assert res is not None
                if res["inserted"]:
                    inserted += 1
                else:
                    updated += 1
                if res["athlete_id"]:
                    linked += 1
            # Sem código de atleta: liga pelo nome e ano de nascimento
            linked += await link_results(c)
            summary = {
                "rows": len(body.rows),
                "inserted": inserted,
                "updated": updated,
                "linked": linked,
                "unlinked": max(0, len(body.rows) - linked),
                "races": len(races),
            }
            await audit(c, actor(req), "results.import", "results", None, summary)
        return summary
