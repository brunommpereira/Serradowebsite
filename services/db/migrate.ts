/** Aplica as migrações em db/migrations por ordem (cada uma numa transação). */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool, tx, type Pool } from '../shared/db.ts';

const dir = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function migrate(pool: Pool, log = console.log) {
  await pool.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await pool.query('select name from schema_migrations')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(dir + f, 'utf8');
    await tx(pool, async (c) => {
      await c.query(sql);
      await c.query('insert into schema_migrations (name) values ($1)', [f]);
    });
    log(`✔ ${f}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool();
  await migrate(pool);
  await pool.end();
}
