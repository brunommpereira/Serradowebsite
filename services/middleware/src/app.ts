import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../../shared/config.ts';
import { BackendClient, BackendError, type Session } from './backend-client.ts';
import { TtlCache } from './cache.ts';
import { authRoutes } from './routes/auth.ts';
import { contentRoutes } from './routes/content.ts';
import { meRoutes } from './routes/me.ts';
import { adminRoutes } from './routes/admin.ts';

export const SESSION_COOKIE = 'sfc_session';

declare module 'fastify' {
  interface FastifyInstance {
    backend: BackendClient;
    cache: TtlCache;
    /** Exige sessão; devolve o utilizador. */
    session(req: FastifyRequest): Promise<Session>;
    /** Exige sessão com um dos papéis (admin passa sempre). */
    staff(req: FastifyRequest, ...roles: string[]): Promise<Session>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Session;
    user: Session;
  }
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * MIDDLEWARE (BFF) — API pública /api/v1 consumida pelo front.
 * Autenticação, permissões por papel, validação, rate limit, CORS, cache e
 * agregação. Não acede à base de dados: fala com o backend.
 */
export async function buildMiddleware(opts: { backend?: BackendClient; logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: config.trustProxy, ajv: { customOptions: { removeAdditional: false, coerceTypes: true } } });
  app.decorate('backend', opts.backend ?? new BackendClient());
  app.decorate('cache', new TtlCache());

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-requested-with', 'authorization'],
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, cookie: { cookieName: SESSION_COOKIE, signed: false }, sign: { expiresIn: `${config.sessionHours}h` } });
  await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: {
      info: { title: 'Serrado FC — Middleware (API pública)', version: '1.0.0', description: 'API consumida pelo front. Sessão por cookie httpOnly (sfc_session) ou Authorization: Bearer.' },
      servers: [{ url: 'http://localhost:4000' }],
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE } } },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  // CSRF: pedidos que alteram dados com cookie de sessão têm de trazer X-Requested-With
  // (cabeçalho personalizado → obriga a preflight CORS, que só aceita as origens do site).
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    if (req.headers.authorization?.startsWith('Bearer ')) return;
    if (req.url.startsWith('/api/v1/auth/login')) return; // ainda sem sessão
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') throw new ApiError(403, 'csrf', 'Cabeçalho X-Requested-With em falta');
  });

  app.decorate('session', async (req: FastifyRequest) => {
    try {
      return await req.jwtVerify<Session>();
    } catch {
      throw new ApiError(401, 'unauthenticated', 'Sessão inválida ou expirada');
    }
  });

  app.decorate('staff', async (req: FastifyRequest, ...roles: string[]) => {
    const s = await app.session(req);
    if (!s.roles.some((r) => r === 'admin' || roles.includes(r))) throw new ApiError(403, 'forbidden', 'Sem permissão para esta área');
    return s;
  });

  app.setErrorHandler((err: FastifyError, req, reply: FastifyReply) => {
    if (err instanceof BackendError) return reply.status(err.status).send(err.body);
    if (err instanceof ApiError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err.validation) return reply.status(400).send({ error: 'validation', message: err.message });
    if (err.statusCode === 429) return reply.status(429).send({ error: 'rate_limited', message: 'Demasiadas tentativas. Tenta novamente daqui a pouco.' });
    req.log.error(err);
    return reply.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: 'internal', message: 'Erro interno' });
  });

  app.get('/api/health', { schema: { hide: true } }, async () => ({ ok: true, version: config.version }));

  await app.register(
    async (v1) => {
      await v1.register(authRoutes);
      await v1.register(contentRoutes);
      await v1.register(meRoutes);
      await v1.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: '/api/v1' },
  );
  return app;
}

export { ApiError };
