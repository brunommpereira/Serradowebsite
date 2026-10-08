import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../../shared/config.ts';
import { SESSION_COOKIE } from '../app.ts';
import { BackendError } from '../backend-client.ts';
import { callbackUrl } from '../oauth.ts';

interface Profile {
  id: string;
  name: string;
  email: string;
  roles: string[];
  member: unknown;
  athletes: { id: string; name: string; role: string }[];
}

/** Cookie temporário (10 min) com state, nonce e PKCE da entrada com Google/Microsoft. */
const OAUTH_COOKIE = 'sfc_oauth';
const OAUTH_PATH = '/api/v1/auth/oauth';

interface OAuthPending {
  p: string; // fornecedor
  s: string; // state
  n: string; // nonce
  v: string; // PKCE code_verifier
  r: string; // para onde voltar no site
}

export async function authRoutes(app: FastifyInstance) {
  const tags = ['Sessão'];
  const secure = config.production || config.sessionSameSite === 'none';

  async function startSession(reply: FastifyReply, profile: Profile) {
    const token = await reply.jwtSign({ sub: profile.id, name: profile.name, roles: profile.roles });
    // O token só vai no cookie httpOnly: nunca fica acessível ao JavaScript da página
    reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, secure, sameSite: config.sessionSameSite, maxAge: config.sessionHours * 3600 });
  }

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
      await startSession(reply, profile);
      return profile;
    },
  );

  app.post('/auth/logout', { schema: { tags, summary: 'Terminar sessão' } }, async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure, sameSite: config.sessionSameSite });
    return { ok: true };
  });

  // ---------- Entrar com Google / Microsoft (OpenID Connect) ----------

  app.get('/auth/providers', { schema: { tags, summary: 'Fornecedores de entrada ativos (Google, Microsoft…)' } }, async () =>
    [...app.oauth.values()].map((p) => ({ id: p.id, name: p.name })),
  );

  /** Volta ao site: /entrar com o resultado, ou o destino pedido. Só caminhos do próprio site. */
  function backToSite(reply: FastifyReply, path: string, error?: string) {
    const site = new URL(config.oauth.siteUrl + '/');
    let url = new URL(path, site);
    if (url.origin !== site.origin) url = new URL('/entrar', site);
    if (error) url.searchParams.set('erro', error);
    return reply.redirect(url.toString(), 303);
  }

  const providerParam = { type: 'object', properties: { provider: { type: 'string', pattern: '^[a-z0-9-]{1,32}$' } } } as const;

  app.get(
    '/auth/oauth/:provider',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags,
        summary: 'Começar a entrada com um fornecedor externo (redireciona para o fornecedor)',
        params: providerParam,
        querystring: { type: 'object', properties: { voltar: { type: 'string', maxLength: 200 } } },
      },
    },
    async (req, reply) => {
      const provider = app.oauth.get((req.params as { provider: string }).provider);
      if (!provider) return reply.status(404).send({ error: 'not_found', message: 'Fornecedor de entrada não disponível' });
      const back = safeReturn((req.query as { voltar?: string }).voltar);
      let start;
      try {
        start = await provider.start();
      } catch (err) {
        req.log.warn({ err, provider: provider.id }, 'oauth: descoberta falhou');
        return backToSite(reply, '/entrar', 'indisponivel');
      }
      const pending: OAuthPending = { p: provider.id, s: start.state, n: start.nonce, v: start.verifier, r: back };
      // SameSite=Lax: o cookie tem de acompanhar o regresso do fornecedor (navegação vinda de outro site)
      reply.setCookie(OAUTH_COOKIE, JSON.stringify(pending), { path: OAUTH_PATH, httpOnly: true, secure, sameSite: 'lax', maxAge: 600, signed: true });
      return reply.redirect(start.url.toString(), 303);
    },
  );

  app.get(
    '/auth/oauth/:provider/callback',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { tags, summary: 'Regresso do fornecedor: valida e inicia a sessão', params: providerParam },
    },
    async (req, reply) => {
      const pending = readPending(req);
      reply.clearCookie(OAUTH_COOKIE, { path: OAUTH_PATH, httpOnly: true, secure, sameSite: 'lax' });
      const id = (req.params as { provider: string }).provider;
      const provider = app.oauth.get(id);
      if (!provider || !pending || pending.p !== id) return backToSite(reply, '/entrar', 'expirou');
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      if (new URLSearchParams(query).has('error')) return backToSite(reply, '/entrar', 'cancelado'); // a pessoa cancelou no fornecedor

      let identity;
      try {
        identity = await provider.finish(new URL(callbackUrl(id) + query), { state: pending.s, nonce: pending.n, verifier: pending.v });
      } catch (err) {
        req.log.warn({ err, provider: id }, 'oauth: validação falhou');
        return backToSite(reply, '/entrar', 'falhou');
      }
      try {
        const profile = await app.backend.call<Profile>('POST', '/auth/oauth', { body: { provider: id, ...identity } });
        await startSession(reply, profile);
        return backToSite(reply, pending.r);
      } catch (err) {
        if (err instanceof BackendError && err.status === 403) return backToSite(reply, '/entrar', 'sem-conta');
        if (err instanceof BackendError && err.status === 409) return backToSite(reply, '/entrar', 'outra-conta');
        req.log.error({ err, provider: id }, 'oauth: erro ao iniciar sessão');
        return backToSite(reply, '/entrar', 'falhou');
      }
    },
  );
}

function readPending(req: FastifyRequest): OAuthPending | null {
  const raw = req.cookies[OAUTH_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const v = JSON.parse(unsigned.value) as OAuthPending;
    return typeof v.p === 'string' && typeof v.s === 'string' && typeof v.n === 'string' && typeof v.v === 'string' && typeof v.r === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Destino depois de entrar: só caminhos internos do site (nunca outro domínio). */
function safeReturn(path: string | undefined) {
  return path && /^\/(?![/\\])[^\s\\]*$/.test(path) ? path : '/entrar';
}
