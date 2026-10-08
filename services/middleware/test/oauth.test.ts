import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { buildBackend } from '../../backend/src/app.ts';
import { buildMiddleware, SESSION_COOKIE } from '../src/app.ts';
import { BackendClient } from '../src/backend-client.ts';
import { callbackUrl, OidcProvider, type OAuthProvider } from '../src/oauth.ts';
import { config } from '../../shared/config.ts';
import { freshDatabase } from '../../test-utils/db.ts';
import type { Pool } from '../../shared/db.ts';

/**
 * Entrada com Google/Microsoft, de ponta a ponta: middleware real (openid-client) contra um
 * fornecedor OpenID Connect falso local que assina id_tokens RS256 e confirma o PKCE.
 */

const CLIENT_ID = 'serrado-test';
const CLIENT_SECRET = 'segredo-de-teste';
const SITE = 'https://site.test';

// ---------- Fornecedor OIDC falso ----------
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'k1';
let issuer = '';
/** code → pedido pendente (o teste escolhe as claims que o fornecedor devolve) */
const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string; claims: Record<string, unknown> }>();

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function signIdToken(claims: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const body = b64url(JSON.stringify(claims));
  const sig = createSign('RSA-SHA256').update(`${header}.${body}`).sign(privateKey);
  return `${header}.${body}.${b64url(sig)}`;
}

const idp: Server = createServer(async (req, res) => {
  const url = new URL(req.url!, issuer);
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/.well-known/openid-configuration') {
    return json(200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    });
  }
  if (url.pathname === '/jwks') return json(200, { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] });
  if (url.pathname === '/token' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const form = new URLSearchParams(raw);
    const basic = req.headers.authorization?.startsWith('Basic ') ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString().split(':').map(decodeURIComponent) : null;
    const [id, secret] = basic ?? [form.get('client_id'), form.get('client_secret')];
    if (id !== CLIENT_ID || secret !== CLIENT_SECRET) return json(401, { error: 'invalid_client' });
    const pending = codes.get(form.get('code') ?? '');
    codes.delete(form.get('code') ?? '');
    if (!pending) return json(400, { error: 'invalid_grant' });
    if (form.get('redirect_uri') !== pending.redirectUri) return json(400, { error: 'invalid_grant', error_description: 'redirect_uri' });
    if (createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== pending.challenge) return json(400, { error: 'invalid_grant', error_description: 'pkce' });
    const now = Math.floor(Date.now() / 1000);
    const idToken = signIdToken({ iss: issuer, aud: CLIENT_ID, iat: now, exp: now + 300, nonce: pending.nonce, ...pending.claims });
    return json(200, { access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token: idToken });
  }
  json(404, {});
});

// ---------- Serviços ----------
let backend: FastifyInstance;
let mw: FastifyInstance;
let pool: Pool;

before(async () => {
  await new Promise<void>((r) => idp.listen(0, '127.0.0.1', r));
  issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;
  config.oauth.publicUrl = SITE;
  config.oauth.siteUrl = SITE;

  pool = await freshDatabase('oauth');
  backend = await buildBackend(pool);
  const client = new BackendClient(async ({ method, path, headers, body }) => {
    const r = await backend.inject({ method: method as 'GET', url: path, headers, payload: body as object });
    return { status: r.statusCode, body: r.body ? r.json() : null };
  });
  const google = new OidcProvider('google', 'Google', {
    issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: callbackUrl('google'),
    emailVerified: (c) => c['email_verified'] === true,
  });
  mw = await buildMiddleware({ backend: client, oauth: new Map<string, OAuthProvider>([['google', google]]) });
});
after(async () => {
  await mw.close();
  await backend.close();
  await pool.end();
  idp.close();
});

let ip = 0;
/** Começa a entrada; devolve o cookie temporário e os parâmetros enviados ao fornecedor. */
async function start(voltar?: string) {
  const r = await mw.inject({ method: 'GET', url: '/api/v1/auth/oauth/google' + (voltar ? `?voltar=${encodeURIComponent(voltar)}` : ''), remoteAddress: `10.9.0.${++ip}` });
  assert.equal(r.statusCode, 303, r.body);
  const to = new URL(r.headers.location as string);
  const c = r.cookies.find((c) => c.name === 'sfc_oauth')!;
  return { to, cookie: c, header: `sfc_oauth=${c.value}` };
}

/** O fornecedor autentica a pessoa (com estas claims) e manda-a de volta ao callback. */
async function finish(s: Awaited<ReturnType<typeof start>>, claims: Record<string, unknown>, opts: { cookie?: string; state?: string } = {}) {
  const code = randomUUID();
  codes.set(code, { nonce: s.to.searchParams.get('nonce')!, challenge: s.to.searchParams.get('code_challenge')!, redirectUri: s.to.searchParams.get('redirect_uri')!, claims });
  const qs = new URLSearchParams({ code, state: opts.state ?? s.to.searchParams.get('state')!, iss: issuer });
  const r = await mw.inject({ method: 'GET', url: `/api/v1/auth/oauth/google/callback?${qs}`, headers: { cookie: opts.cookie ?? s.header }, remoteAddress: `10.9.1.${++ip}` });
  assert.equal(r.statusCode, 303, r.body);
  const session = r.cookies.find((c) => c.name === SESSION_COOKIE && c.value);
  return { location: r.headers.location as string, session: session ? `${SESSION_COOKIE}=${session.value}` : null, raw: session };
}

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

describe('entrar com Google (OpenID Connect)', () => {
  test('lista os fornecedores ativos', async () => {
    const r = await mw.inject({ method: 'GET', url: '/api/v1/auth/providers' });
    assert.deepEqual(r.json(), [{ id: 'google', name: 'Google' }]);
  });

  test('redireciona para o fornecedor com PKCE S256, state, nonce e cookie temporário assinado', async () => {
    const s = await start();
    assert.equal(s.to.origin + s.to.pathname, `${issuer}/authorize`);
    assert.equal(s.to.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(s.to.searchParams.get('redirect_uri'), `${SITE}/api/v1/auth/oauth/google/callback`);
    assert.equal(s.to.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(s.to.searchParams.get('scope'), 'openid email profile');
    assert.ok(s.to.searchParams.get('state') && s.to.searchParams.get('nonce'));
    assert.equal(s.cookie.httpOnly, true);
    assert.equal(s.cookie.sameSite, 'Lax');
    assert.equal(s.cookie.path, '/api/v1/auth/oauth');
    assert.match(decodeURIComponent(s.cookie.value), /\}\.[\w+/-]{20,}$/, 'cookie assinado');
  });

  test('primeira entrada: liga a conta Google à conta do clube com o mesmo email verificado', async () => {
    const s = await start('/area-socio/quotas');
    const r = await finish(s, { sub: 'g-socio', email: 'Socio@Exemplo.pt', email_verified: true });
    assert.equal(r.location, `${SITE}/area-socio/quotas`);
    assert.ok(r.session, 'cookie de sessão');
    assert.equal(r.raw!.httpOnly, true);
    assert.equal(r.raw!.sameSite, 'Strict');
    const me = await mw.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: r.session! } });
    assert.equal(me.json().member.memberNumber, '00482');
    const ids = await mw.inject({ method: 'GET', url: '/api/v1/me/identities', headers: { cookie: r.session! } });
    assert.deepEqual(ids.json().map((i: { provider: string; email: string }) => [i.provider, i.email]), [['google', 'socio@exemplo.pt']]);
  });

  test('entradas seguintes: pela conta Google (sub), mesmo que o email no Google mude', async () => {
    const r = await finish(await start(), { sub: 'g-socio', email: 'outro@gmail.com', email_verified: true });
    assert.equal(r.location, `${SITE}/entrar`);
    const me = await mw.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: r.session! } });
    assert.equal(me.json().email, 'socio@exemplo.pt');
  });

  test('email não verificado ou sem conta no clube → sem sessão (não cria contas)', async () => {
    const a = await finish(await start(), { sub: 'g-x1', email: 'joao@exemplo.pt', email_verified: false });
    assert.equal(a.location, `${SITE}/entrar?erro=sem-conta`);
    assert.equal(a.session, null);
    const b = await finish(await start(), { sub: 'g-x2', email: 'desconhecido@gmail.com', email_verified: true });
    assert.equal(b.location, `${SITE}/entrar?erro=sem-conta`);
    assert.equal(b.session, null);
    assert.equal((await pool.query("select count(*)::int as n from users where email = 'desconhecido@gmail.com'")).rows[0].n, 0);
  });

  test('outra conta Google com o email de uma conta já ligada → recusa', async () => {
    const r = await finish(await start(), { sub: 'g-intruso', email: 'socio@exemplo.pt', email_verified: true });
    assert.equal(r.location, `${SITE}/entrar?erro=outra-conta`);
    assert.equal(r.session, null);
  });

  test('state errado, cookie em falta ou adulterado → sem sessão', async () => {
    const s = await start();
    assert.equal((await finish(s, { sub: 'g-socio', email: 'socio@exemplo.pt', email_verified: true }, { state: 'outro' })).location, `${SITE}/entrar?erro=falhou`);
    const s2 = await start();
    assert.equal((await finish(s2, { sub: 'g-socio' }, { cookie: 'x=1' })).location, `${SITE}/entrar?erro=expirou`);
    const s3 = await start();
    const forged = encodeURIComponent(JSON.stringify({ p: 'google', s: 'a', n: 'b', v: 'c', r: '/' })) + '.assinatura-falsa';
    const r3 = await finish(s3, { sub: 'g-socio' }, { cookie: `sfc_oauth=${forged}` });
    assert.equal(r3.location, `${SITE}/entrar?erro=expirou`);
    assert.equal(r3.session, null);
  });

  test('nonce diferente do pedido (id_token reaproveitado) → sem sessão', async () => {
    const s = await start();
    const r = await finish(s, { sub: 'g-socio', nonce: 'outro-nonce' });
    assert.equal(r.location, `${SITE}/entrar?erro=falhou`);
    assert.equal(r.session, null);
  });

  test('destino só dentro do site (nada de redireções para fora)', async () => {
    for (const evil of ['//evil.example', 'https://evil.example', '/\\evil.example']) {
      const r = await finish(await start(evil), { sub: 'g-socio', email: 'socio@exemplo.pt', email_verified: true });
      assert.equal(r.location, `${SITE}/entrar`, evil);
    }
  });

  test('a pessoa cancela no fornecedor → volta a /entrar', async () => {
    const s = await start();
    const r = await mw.inject({ method: 'GET', url: `/api/v1/auth/oauth/google/callback?error=access_denied&state=${s.to.searchParams.get('state')}`, headers: { cookie: s.header } });
    assert.equal(r.headers.location, `${SITE}/entrar?erro=cancelado`);
  });

  test('fornecedor desconhecido → 404', async () => {
    assert.equal((await mw.inject({ method: 'GET', url: '/api/v1/auth/oauth/facebook' })).statusCode, 404);
  });

  test('desligar a conta Google e conta desativada deixa de entrar', async () => {
    const r = await finish(await start(), { sub: 'g-socio', email: 'socio@exemplo.pt', email_verified: true });
    const del = await mw.inject({ method: 'DELETE', url: '/api/v1/me/identities/google', headers: { cookie: r.session!, ...XHR } });
    assert.equal(del.statusCode, 200, del.body);
    assert.equal((await pool.query("select count(*)::int as n from user_identities where subject = 'g-socio'")).rows[0].n, 0);

    // Volta a ligar e depois a conta do clube é desativada
    await finish(await start(), { sub: 'g-joao', email: 'joao@exemplo.pt', email_verified: true });
    await pool.query("update users set disabled = true where email = 'joao@exemplo.pt'");
    const off = await finish(await start(), { sub: 'g-joao', email: 'joao@exemplo.pt', email_verified: true });
    assert.equal(off.location, `${SITE}/entrar?erro=sem-conta`);
    assert.equal(off.session, null);
  });
});
