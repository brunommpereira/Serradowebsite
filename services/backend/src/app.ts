import Fastify, { type FastifyError } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { timingSafeEqual } from 'node:crypto';
import { config, ROLES, type Role } from '../../shared/config.ts';
import type { Pool } from '../../shared/db.ts';
import { HttpError } from './core.ts';
import { authRoutes } from './routes/auth.ts';
import { cmsRoutes } from './routes/cms.ts';
import { athleteRoutes } from './routes/athletes.ts';
import { memberRoutes } from './routes/members.ts';
import { resultRoutes } from './routes/results.ts';
import { adminRoutes } from './routes/admin.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tokenOk(header: string | undefined) {
  const expected = Buffer.from(`Bearer ${config.serviceToken}`);
  const got = Buffer.from(header ?? '');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * BACKEND — API interna (/internal/v1). Regras de negócio e acesso à base de dados.
 * Não deve estar exposto à Internet: só aceita pedidos do middleware (SERVICE_TOKEN).
 */
export async function buildBackend(pool: Pool, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, ajv: { customOptions: { removeAdditional: false, coerceTypes: true } } });
  app.decorate('pool', pool);
  app.decorateRequest('actor', null as never);

  await app.register(swagger, {
    openapi: {
      info: { title: 'Serrado FC — Backend (API interna)', version: '1.0.0', description: 'Regras de negócio e dados. Acesso só pelo middleware (Bearer SERVICE_TOKEN + X-Actor-*).' },
      servers: [{ url: 'http://localhost:4100' }],
      components: { securitySchemes: { service: { type: 'http', scheme: 'bearer' } } },
      security: [{ service: [] }],
    },
  });
  if (!config.production) await app.register(swaggerUi, { routePrefix: '/internal/docs' });

  app.addHook('onRequest', async (req) => {
    const path = req.url.split('?')[0];
    if (path === '/internal/health' || path.startsWith('/internal/docs')) {
      (req as { actor: unknown }).actor = { id: null, roles: [] };
      return;
    }
    if (!tokenOk(req.headers.authorization)) throw new HttpError(401, 'invalid_service_token', 'Token de serviço inválido');
    const id = String(req.headers['x-actor-id'] ?? '');
    const roles = String(req.headers['x-actor-roles'] ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    (req as { actor: unknown }).actor = { id: UUID.test(id) ? id : null, roles };
  });

  app.setErrorHandler((err: FastifyError & { code?: string }, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err.validation) return reply.status(400).send({ error: 'validation', message: err.message });
    // Erros do PostgreSQL com significado para o cliente
    if (err.code === '23505') return reply.status(409).send({ error: 'conflict', message: 'Já existe um registo com esse identificador (slug, n.º, …)' });
    if (err.code === '23514' || err.code === '22P02' || err.code === '22007') return reply.status(400).send({ error: 'invalid', message: 'Valor inválido' });
    if (err.message?.startsWith('identity_locked')) return reply.status(409).send({ error: 'identity_locked', message: 'Dados de identificação só mudam por pedido validado pela secretaria' });
    req.log.error(err);
    return reply.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: 'internal', message: err.statusCode && err.statusCode < 500 ? err.message : 'Erro interno' });
  });

  app.get('/internal/health', { schema: { hide: true } }, async () => {
    await pool.query('select 1');
    return { ok: true };
  });

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(cmsRoutes);
      await v1.register(athleteRoutes);
      await v1.register(memberRoutes);
      await v1.register(resultRoutes);
      await v1.register(adminRoutes);
    },
    { prefix: '/internal/v1' },
  );
  return app;
}
