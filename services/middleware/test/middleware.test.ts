import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildBackend } from '../../backend/src/app.ts';
import { buildMiddleware, SESSION_COOKIE } from '../src/app.ts';
import { BackendClient } from '../src/backend-client.ts';
import { freshDatabase } from '../../test-utils/db.ts';
import type { Pool } from '../../shared/db.ts';

let backend: FastifyInstance;
let mw: FastifyInstance;
let pool: Pool;

before(async () => {
  pool = await freshDatabase('middleware');
  backend = await buildBackend(pool);
  // O middleware fala com o backend real (em memória, sem rede)
  const client = new BackendClient(async ({ method, path, headers, body }) => {
    const r = await backend.inject({ method: method as 'GET', url: path, headers, payload: body as object });
    return { status: r.statusCode, body: r.body ? r.json() : null };
  });
  mw = await buildMiddleware({ backend: client });
});
after(async () => {
  await mw.close();
  await backend.close();
  await pool.end();
});

const XHR = { 'x-requested-with': 'XMLHttpRequest' };

let ip = 0;
async function login(user: string, password: string) {
  // IP diferente por login (o rate limit é por IP)
  const r = await mw.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: user, password }, headers: XHR, remoteAddress: `10.1.0.${++ip}` });
  assert.equal(r.statusCode, 200, r.body);
  const c = r.cookies.find((c) => c.name === SESSION_COOKIE)!;
  return { cookie: `${SESSION_COOKIE}=${c.value}`, raw: c, body: r.json() };
}

function as(cookie: string, method: string, url: string, payload?: object): Promise<LightMyRequestResponse> {
  return mw.inject({ method: method as 'GET', url: '/api/v1' + url, payload, headers: { cookie, ...XHR } });
}

describe('sessão', () => {
  test('login define cookie httpOnly e /me devolve o perfil', async () => {
    const s = await login('socio@exemplo.pt', 'serrado1978');
    assert.equal(s.raw.httpOnly, true);
    assert.equal(s.raw.sameSite, 'Strict');
    assert.equal(s.body.member.memberNumber, '00482');
    assert.equal(s.body.token, undefined); // o token nunca vai no corpo da resposta
    const me = await as(s.cookie, 'GET', '/me');
    assert.equal(me.json().athletes.length, 2);
  });

  test('sem sessão → 401; credenciais erradas → 401', async () => {
    assert.equal((await mw.inject({ method: 'GET', url: '/api/v1/me' })).statusCode, 401);
    assert.equal((await mw.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'socio@exemplo.pt', password: 'nao' }, headers: XHR, remoteAddress: '10.2.0.1' })).statusCode, 401);
  });

  test('CSRF: login sem X-Requested-With → 403 (impede iniciar sessão a partir de outro site)', async () => {
    const r = await mw.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'socio@exemplo.pt', password: 'serrado1978' }, remoteAddress: '10.2.0.2' });
    assert.equal(r.statusCode, 403);
    assert.equal(r.cookies.length, 0);
  });

  test('CSRF: escrita com cookie mas sem X-Requested-With → 403', async () => {
    const s = await login('joao@exemplo.pt', 'atleta2026');
    const r = await mw.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: s.cookie } });
    assert.equal(r.statusCode, 403);
  });

  test('rate limit no login', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await mw.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'x@x.pt', password: 'x' }, headers: XHR, remoteAddress: '10.0.0.9' })).statusCode;
    }
    assert.equal(last, 429);
  });

  test('rate limit em toda a API (por IP)', async () => {
    let last = 0;
    for (let i = 0; i < 305; i++) last = (await mw.inject({ method: 'GET', url: '/api/v1/content/partners', remoteAddress: '10.3.0.1' })).statusCode;
    assert.equal(last, 429);
    // outro IP não é afetado
    assert.equal((await mw.inject({ method: 'GET', url: '/api/v1/content/partners', remoteAddress: '10.3.0.2' })).statusCode, 200);
  });

  test('conta desativada ou papel retirado deixam de valer logo, mesmo com sessão aberta', async () => {
    const s = await login('treinador@serradofc.pt', 'treinador2026');
    assert.equal((await as(s.cookie, 'GET', '/admin/athletes')).statusCode, 200);
    await pool.query(`delete from user_roles where user_id = (select id from users where email = 'treinador@serradofc.pt')`);
    const afterRole = await as(s.cookie, 'GET', '/admin/athletes');
    assert.equal(afterRole.statusCode, 403);
    await pool.query(`update users set disabled = true where email = 'treinador@serradofc.pt'`);
    assert.equal((await as(s.cookie, 'GET', '/me')).statusCode, 401);
    await pool.query(`update users set disabled = false where email = 'treinador@serradofc.pt'`);
    await pool.query(`insert into user_roles select id, 'treinador' from users where email = 'treinador@serradofc.pt'`);
  });

  test('CORS: só as origens do site', async () => {
    const ok = await mw.inject({ method: 'OPTIONS', url: '/api/v1/me', headers: { origin: 'https://brunommpereira.github.io', 'access-control-request-method': 'GET' } });
    assert.equal(ok.headers['access-control-allow-origin'], 'https://brunommpereira.github.io');
    assert.equal(ok.headers['access-control-allow-credentials'], 'true');
    const bad = await mw.inject({ method: 'OPTIONS', url: '/api/v1/me', headers: { origin: 'https://malicioso.example', 'access-control-request-method': 'GET' } });
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });
});

describe('conteúdo público (BFF)', () => {
  test('notícias no formato do front, sem rascunhos', async () => {
    const news = (await mw.inject({ method: 'GET', url: '/api/v1/content/news' })).json();
    assert.ok(news.length >= 7);
    assert.match(news[0].bodyHtml, /^<p>/);
    assert.match(news[0].publicationDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!news.some((n: { slug: string }) => n.slug === 'rascunho-gala-anual'));
  });

  test('home agrega notícias, eventos e parceiros', async () => {
    const home = (await mw.inject({ method: 'GET', url: '/api/v1/content/home' })).json();
    assert.equal(home.news.length, 3);
    assert.ok(Array.isArray(home.events) && Array.isArray(home.partners));
  });

  test('página institucional em HTML', async () => {
    const page = (await mw.inject({ method: 'GET', url: '/api/v1/content/pages/privacidade' })).json();
    assert.equal(page.title, 'Política de Privacidade');
    assert.ok(page.bodyHtml.split('<p>').length > 2);
  });
});

describe('áreas reservadas', () => {
  test('atleta não sócio: atletas sim, área de sócio não', async () => {
    const s = await login('joao@exemplo.pt', 'atleta2026');
    assert.equal((await as(s.cookie, 'GET', '/me/athletes')).json()[0].code, 'SFC-0004');
    const m = await as(s.cookie, 'GET', '/me/member');
    assert.equal(m.statusCode, 404);
    assert.equal(m.json().error, 'not_member');
  });

  test('sócio: quotas', async () => {
    const s = await login('00482', 'serrado1978');
    assert.equal((await as(s.cookie, 'GET', '/me/quotas')).json().length, 3);
  });
});

describe('backoffice', () => {
  test('quem não é staff não entra', async () => {
    const s = await login('socio@exemplo.pt', 'serrado1978');
    assert.equal((await as(s.cookie, 'GET', '/admin/dashboard')).statusCode, 403);
  });

  test('editor: publica notícia e o site mostra-a logo (cache invalidada)', async () => {
    await mw.inject({ method: 'GET', url: '/api/v1/content/news' }); // aquece a cache
    const s = await login('editor@serradofc.pt', 'editor2026');
    const created = await as(s.cookie, 'POST', '/admin/cms/news', { slug: 'noticia-do-cms', title: 'Notícia criada no CMS', category: 'Clube', summary: 'Resumo', body: 'Parágrafo 1\n\nParágrafo 2' });
    assert.equal(created.statusCode, 201);
    let news = (await mw.inject({ method: 'GET', url: '/api/v1/content/news' })).json();
    assert.ok(!news.some((n: { slug: string }) => n.slug === 'noticia-do-cms'), 'rascunho não aparece');
    await as(s.cookie, 'POST', `/admin/cms/news/${created.json().id}/publish`);
    news = (await mw.inject({ method: 'GET', url: '/api/v1/content/news' })).json();
    const n = news.find((x: { slug: string }) => x.slug === 'noticia-do-cms');
    assert.equal(n.bodyHtml, '<p>Parágrafo 1</p><p>Parágrafo 2</p>');
  });

  test('editor: carrega uma imagem e o site serve-a com cache longa', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const s = await login('editor@serradofc.pt', 'editor2026');
    const up = await as(s.cookie, 'POST', '/admin/media', { name: 'logo.png', data: png, alt: 'Logótipo' });
    assert.equal(up.statusCode, 201);
    const { key, id } = up.json();
    assert.equal((await as(s.cookie, 'GET', '/admin/media')).json()[0].key, key);
    const img = await mw.inject({ method: 'GET', url: `/api/v1/media/${key}.png` });
    assert.equal(img.statusCode, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.match(String(img.headers['cache-control']), /immutable/);
    assert.equal(img.rawPayload.toString('base64'), png);
    // Sem sessão de staff não se carrega nada
    const socio = await login('socio@exemplo.pt', 'serrado1978');
    assert.equal((await as(socio.cookie, 'POST', '/admin/media', { name: 'x.png', data: png })).statusCode, 403);
    // HTML com a imagem: limpo e servido ao site
    const news = await as(s.cookie, 'POST', '/admin/cms/news', {
      slug: 'com-foto', title: 'Com foto', category: 'Clube', body: `<p>Olá<script>x()</script></p><img src="/api/v1/media/${key}.png" alt="Logótipo">`,
    });
    await as(s.cookie, 'POST', `/admin/cms/news/${news.json().id}/publish`);
    const pub = (await mw.inject({ method: 'GET', url: '/api/v1/content/news/com-foto' })).json();
    assert.equal(pub.bodyHtml, `<p>Olá</p><img src="/api/v1/media/${key}.png" alt="Logótipo" />`);
    assert.equal((await as(s.cookie, 'DELETE', `/admin/media/${id}`)).statusCode, 409);
  });

  test('editor não gere atletas; secretaria sim', async () => {
    const ed = await login('editor@serradofc.pt', 'editor2026');
    assert.equal((await as(ed.cookie, 'GET', '/admin/change-requests')).statusCode, 403);
    const sec = await login('secretaria@serradofc.pt', 'secretaria2026');
    const dash = (await as(sec.cookie, 'GET', '/admin/dashboard')).json();
    assert.equal(dash.stats.changeRequests, 1);
    assert.equal(dash.attention.requests.length, 1);
    const ok = await as(sec.cookie, 'POST', `/admin/change-requests/${dash.attention.requests[0].id}/approve`, {});
    assert.equal(ok.json().status, 'aprovado');
  });

  test('só admin gere utilizadores', async () => {
    const sec = await login('secretaria@serradofc.pt', 'secretaria2026');
    assert.equal((await as(sec.cookie, 'GET', '/admin/users')).statusCode, 403);
    const adm = await login('admin@serradofc.pt', 'admin2026');
    assert.ok((await as(adm.cookie, 'GET', '/admin/users')).json().length >= 7);
  });
});
