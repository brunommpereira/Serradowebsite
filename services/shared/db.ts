import pg from 'pg';
import { config } from './config.ts';

// DATE como texto «AAAA-MM-DD» (sem conversões de fuso horário) e NUMERIC como número
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => v.replace(' ', 'T').slice(0, 16)); // timestamp sem fuso → «AAAA-MM-DDTHH:MM»
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(20, (v) => Number(v)); // bigint (ids) → número (seguro até 2^53)

export function createPool(connectionString = config.databaseUrl) {
  return new pg.Pool({ connectionString, max: 10 });
}

export type Pool = pg.Pool;
export type Client = pg.PoolClient;

/** Corre `fn` numa transação (commit/rollback automáticos). */
export async function tx<T>(pool: Pool, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}
