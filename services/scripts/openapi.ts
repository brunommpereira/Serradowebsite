/** Gera backend/openapi.json e middleware/openapi.json a partir das rotas (sem base de dados). */
import { writeFile } from 'node:fs/promises';
import { createPool } from '../shared/db.ts';
import { buildBackend } from '../backend/src/app.ts';
import { buildMiddleware } from '../middleware/src/app.ts';

const pool = createPool('postgres://localhost/nao-usada'); // não liga: só lê as rotas
const backend = await buildBackend(pool);
const middleware = await buildMiddleware();
await Promise.all([backend.ready(), middleware.ready()]);
for (const [name, app] of [['backend', backend], ['middleware', middleware]] as const) {
  const spec = app.swagger();
  await writeFile(new URL(`../${name}/openapi.json`, import.meta.url), JSON.stringify(spec, null, 2) + '\n');
  console.log(`✔ ${name}/openapi.json — ${Object.keys(spec.paths ?? {}).length} caminhos`);
}
await Promise.all([backend.close(), middleware.close(), pool.end()]);
