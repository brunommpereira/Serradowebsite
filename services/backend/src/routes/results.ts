import type { FastifyInstance } from 'fastify';
import { tx } from '../../../shared/db.ts';
import { audit, requireRole } from '../core.ts';

/**
 * Importação dos resultados do Troféu de Almada (results.csv gerado por
 * tools/trofeu-almada/consolidate.py, convertido em JSON pelo front).
 */
const row = {
  type: 'object',
  required: ['season', 'round', 'race', 'raceBase', 'raceDate', 'athleteName', 'category'],
  properties: {
    athleteCode: { type: ['string', 'null'], maxLength: 20 },
    athleteName: { type: 'string', maxLength: 160 },
    birthYear: { type: ['integer', 'null'] },
    season: { type: 'string', pattern: '^\\d{4}/\\d{4}$' },
    round: { type: 'integer', minimum: 1 },
    race: { type: 'string', maxLength: 200 },
    raceBase: { type: 'string', maxLength: 200 },
    raceDate: { type: 'string', format: 'date' },
    category: { type: 'string', maxLength: 60 },
    place: { type: ['integer', 'null'] },
    bib: { type: ['string', 'null'], maxLength: 20 },
    time: { type: ['string', 'null'], maxLength: 20 },
    timeS: { type: ['number', 'null'] },
    distanceM: { type: ['integer', 'null'] },
    trophyPoints: { type: ['integer', 'null'] },
    teamPoints: { type: ['integer', 'null'] },
    sourceUrl: { type: ['string', 'null'], maxLength: 500 },
  },
} as const;

type Row = { [K in keyof (typeof row)['properties']]?: string | number | null };

export async function resultRoutes(app: FastifyInstance) {
  app.post(
    '/results/import',
    {
      bodyLimit: 5 * 1024 * 1024,
      schema: {
        tags: ['Backoffice · Resultados'],
        summary: 'Importa/atualiza resultados (idempotente por prova + atleta)',
        body: { type: 'object', required: ['rows'], properties: { rows: { type: 'array', minItems: 1, maxItems: 5000, items: row } } },
      },
    },
    async (req) => {
      requireRole(req, 'secretaria');
      const { rows } = req.body as { rows: Row[] };
      return tx(app.pool, async (c) => {
        let inserted = 0, updated = 0, linked = 0;
        const races = new Set<string>();
        for (const r of rows) {
          const race = await c.query(
            `insert into races (season, round, name, base_name, race_date) values ($1, $2, $3, $4, $5)
             on conflict (season, round) do update set name = excluded.name, base_name = excluded.base_name, race_date = excluded.race_date returning id`,
            [r.season, r.round, r.race, r.raceBase, r.raceDate],
          );
          races.add(`${r.season}#${r.round}`);
          const res = await c.query(
            `insert into results (race_id, athlete_id, athlete_name, birth_year, category, place, bib, time, time_s, distance_m, trophy_points, team_points, source_url)
             values ($1, (select id from athletes where code = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             on conflict (race_id, athlete_name, birth_year) do update set athlete_id = excluded.athlete_id, category = excluded.category, place = excluded.place,
               time = excluded.time, time_s = excluded.time_s, distance_m = excluded.distance_m, trophy_points = excluded.trophy_points, team_points = excluded.team_points
             returning (xmax = 0) as inserted, athlete_id`,
            [race.rows[0].id, r.athleteCode ?? null, r.athleteName, r.birthYear ?? null, r.category, r.place ?? null, r.bib ?? null, r.time ?? null, r.timeS ?? null, r.distanceM ?? null, r.trophyPoints ?? null, r.teamPoints ?? null, r.sourceUrl ?? null],
          );
          if (res.rows[0].inserted) inserted++;
          else updated++;
          if (res.rows[0].athlete_id) linked++;
        }
        const summary = { rows: rows.length, inserted, updated, linked, unlinked: rows.length - linked, races: races.size };
        await audit(c, req.actor, 'results.import', 'results', null, summary);
        return summary;
      });
    },
  );
}
