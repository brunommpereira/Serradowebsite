import { config } from '../../shared/config.ts';
import { buildMiddleware } from './app.ts';

const app = await buildMiddleware({ logger: true });
await app.listen({ port: config.middlewarePort, host: config.host });
