/** Base de dados de teste: criada do zero (migrações + seed) para cada ficheiro de testes. */
import pg from 'pg';
import { createPool, type Pool } from '../shared/db.ts';
import { migrate } from '../db/migrate.ts';
import { seed } from '../db/seed/seed.ts';

const BASE = process.env['TEST_DATABASE_URL'] ?? 'postgres://serrado:serrado@localhost:5432/serrado_test';

export async function freshDatabase(suffix: string): Promise<Pool> {
  const url = new URL(BASE);
  const name = `${url.pathname.slice(1)}_${suffix}`;
  const admin = new pg.Client({ connectionString: Object.assign(new URL(BASE), { pathname: '/postgres' }).toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const pool = createPool(Object.assign(url, { pathname: '/' + name }).toString());
  await migrate(pool, () => {});
  await seed(pool, () => {});
  return pool;
}
