"""
Importação dos resultados do Troféu de Almada (results.csv gerado por
tools/trofeu-almada/consolidate.py, convertido em JSON pelo front).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, StringConstraints, field_validator

from ...db.pool import tx
from ..core import actor, audit, require_role
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


class Import(BaseModel):
    rows: Annotated[list[ResultRow], Field(min_length=1, max_length=5000)]


def register(r: APIRouter) -> None:
    @r.post("/results/import", tags=["Backoffice · Resultados"], summary="Importa/atualiza resultados (idempotente por prova + atleta)")
    async def import_results(req: Request, body: Import) -> dict[str, Any]:
        require_role(req, "secretaria")
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
            summary = {
                "rows": len(body.rows),
                "inserted": inserted,
                "updated": updated,
                "linked": linked,
                "unlinked": len(body.rows) - linked,
                "races": len(races),
            }
            await audit(c, actor(req), "results.import", "results", None, summary)
        return summary
