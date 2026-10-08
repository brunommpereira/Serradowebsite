import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildBackend } from '../src/app.ts';
import { config } from '../../shared/config.ts';
import { freshDatabase } from '../../test-utils/db.ts';
import { sanitizeBody, toHtml } from '../../shared/html.ts';
import type { Pool } from '../../shared/db.ts';

// PNG 1×1 transparente
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

let app: FastifyInstance;
let pool: Pool;
const users: Record<string, string> = {};

before(async () => {
  pool = await freshDatabase('media');
  app = await buildBackend(pool);
  for (const r of (await pool.query('select id, email from users')).rows) users[r.email] = r.id;
});
after(async () => {
  await app.close();
  await pool.end();
});

function call(method: string, url: string, as: { email?: string; roles?: string } = {}, payload?: object) {
  return app.inject({
    method: method as 'GET',
    url: '/internal/v1' + url,
    payload,
    headers: { authorization: `Bearer ${config.serviceToken}`, 'x-actor-id': as.email ? users[as.email] : '', 'x-actor-roles': as.roles ?? '' },
  });
}
const editor = { email: 'editor@serradofc.pt', roles: 'editor' };
const treinador = { email: 'treinador@serradofc.pt', roles: 'treinador' };

describe('biblioteca de imagens', () => {
  let id: number;
  let key: string;

  test('o editor carrega uma imagem; o tipo vem do conteúdo, não do nome', async () => {
    const r = await call('POST', '/cms/media', editor, { name: 'equipa<script>.jpg', data: PNG, alt: ' Equipa sub-11 ', width: 1, height: 1 });
    assert.equal(r.statusCode, 201);
    const m = r.json();
    assert.equal(m.mime, 'image/png');
    assert.equal(m.name, 'equipascript.jpg');
    assert.equal(m.alt, 'Equipa sub-11');
    assert.equal(m.uploadedByName, 'Equipa de Comunicação');
    assert.equal(m.data, undefined);
    id = m.id;
    key = m.key;
  });

  test('recusa ficheiros que não são imagens e quem não é editor', async () => {
    const txt = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
    assert.equal((await call('POST', '/cms/media', editor, { name: 'x.svg', data: txt })).statusCode, 415);
    assert.equal((await call('POST', '/cms/media', treinador, { name: 'a.png', data: PNG })).statusCode, 403);
    assert.equal((await call('GET', '/cms/media', treinador)).statusCode, 403);
  });

  test('lista, pesquisa e altera o texto alternativo', async () => {
    const list = await call('GET', '/cms/media?q=sub-11', editor);
    assert.equal(list.json().length, 1);
    const p = await call('PATCH', `/cms/media/${id}`, editor, { alt: 'Equipa de sub-11 em 2026' });
    assert.equal(p.json().alt, 'Equipa de sub-11 em 2026');
  });

  test('o conteúdo público só se obtém pela chave aleatória', async () => {
    const r = await call('GET', `/media/${key}`);
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().mime, 'image/png');
    assert.equal(r.json().data, PNG);
    assert.equal((await call('GET', '/media/00000000-0000-0000-0000-000000000000')).statusCode, 404);
    assert.equal((await call('GET', '/media/1')).statusCode, 400);
  });

  test('não se apaga uma imagem em uso; depois de deixar de ser usada, apaga-se', async () => {
    const news = await call('POST', '/cms/news', editor, {
      slug: 'com-imagem', title: 'Com imagem', category: 'Clube', body: `<p>Olá</p><img src="/api/v1/media/${key}.png" alt="x">`,
    });
    assert.equal(news.statusCode, 201);
    const del = await call('DELETE', `/cms/media/${id}`, editor);
    assert.equal(del.statusCode, 409);
    assert.match(del.json().message, /Com imagem/);
    assert.deepEqual((await call('GET', `/cms/media/${id}/usage`, editor)).json().map((u: { title: string }) => u.title), ['Com imagem']);
    await call('DELETE', `/cms/news/${news.json().id}`, editor);
    assert.equal((await call('DELETE', `/cms/media/${id}`, editor)).statusCode, 204);
    const audit = await pool.query(`select action from audit_log where entity = 'cms_media' order by id`);
    assert.deepEqual(audit.rows.map((r) => r.action), ['cms.media.upload', 'cms.media.update', 'cms.media.delete']);
  });
});

describe('texto rico (HTML) nos conteúdos', () => {
  test('o HTML do editor é limpo antes de ser gravado', async () => {
    const r = await call('POST', '/cms/news', editor, {
      slug: 'html-limpo', title: 'HTML', category: 'Clube',
      body: '<h1>Título</h1><p onclick="x()" style="color:red">Olá <b>mundo</b><script>alert(1)</script></p>'
        + '<a href="javascript:alert(1)">mau</a><a href="https://serradofc.pt" target="_blank">bom</a>'
        + '<img src="javascript:alert(1)"><img src="http://inseguro.pt/a.png"><img src="/api/v1/media/abc.webp" alt="ok"><iframe src="https://x"></iframe>',
    });
    assert.equal(r.statusCode, 201);
    assert.equal(
      r.json().body,
      '<h2>Título</h2><p>Olá <strong>mundo</strong></p><a>mau</a><a href="https://serradofc.pt" target="_blank" rel="noopener noreferrer">bom</a><img src="/api/v1/media/abc.webp" alt="ok" />',
    );
  });

  test('a capa só aceita imagens da biblioteca ou https', async () => {
    const base = { slug: 'capa', title: 'Capa', category: 'Clube' };
    assert.equal((await call('POST', '/cms/news', editor, { ...base, coverUrl: 'javascript:alert(1)' })).statusCode, 400);
    assert.equal((await call('POST', '/cms/news', editor, { ...base, coverUrl: '/api/v1/media/abc.webp' })).statusCode, 201);
  });

  test('o texto simples antigo mantém-se e passa a parágrafos no site', () => {
    const old = 'Primeiro parágrafo <com> sinais.\n\nSegundo\ncom quebra.';
    assert.equal(sanitizeBody(old), old);
    assert.equal(toHtml(old), '<p>Primeiro parágrafo &lt;com&gt; sinais.</p><p>Segundo<br>com quebra.</p>');
    assert.equal(toHtml('<p>Já é HTML</p>'), '<p>Já é HTML</p>');
  });
});
