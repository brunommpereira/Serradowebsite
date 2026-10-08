import type { FastifyInstance } from 'fastify';
import { config } from '../../../shared/config.ts';
import { SESSION_COOKIE } from '../app.ts';

interface Profile {
  id: string;
  name: string;
  email: string;
  roles: string[];
  member: unknown;
  athletes: { id: string; name: string; role: string }[];
}

export async function authRoutes(app: FastifyInstance) {
  const tags = ['Sessão'];

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Entrar (email ou n.º de sócio). Define o cookie de sessão httpOnly.',
        body: { type: 'object', required: ['login', 'password'], properties: { login: { type: 'string', minLength: 1, maxLength: 200 }, password: { type: 'string', minLength: 1, maxLength: 200 } }, additionalProperties: false },
      },
    },
    async (req, reply) => {
      const profile = await app.backend.call<Profile>('POST', '/auth/verify', { body: req.body });
      const token = await reply.jwtSign({ sub: profile.id, name: profile.name, roles: profile.roles });
      reply.setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        secure: config.production || config.sessionSameSite === 'none',
        sameSite: config.sessionSameSite,
        maxAge: config.sessionHours * 3600,
      });
      // O token só vai no cookie httpOnly: nunca fica acessível ao JavaScript da página
      return profile;
    },
  );

  app.post('/auth/logout', { schema: { tags, summary: 'Terminar sessão' } }, async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: config.production || config.sessionSameSite === 'none', sameSite: config.sessionSameSite });
    return { ok: true };
  });
}
