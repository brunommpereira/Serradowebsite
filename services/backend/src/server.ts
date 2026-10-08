import { config } from '../../shared/config.ts';
import { createPool } from '../../shared/db.ts';
import { buildBackend } from './app.ts';

const app = await buildBackend(createPool(), { logger: true });
await app.listen({ port: config.backendPort, host: config.host });
