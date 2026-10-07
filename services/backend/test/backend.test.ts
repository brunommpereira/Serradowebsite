import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildBackend } from '../src/app.ts';
import { config } from '../../shared/config.ts';
import { freshDatabase } from '../../test-utils/db.ts';
import type { Pool } from '../../shared/db.ts';

let app: FastifyInstance;
let pool: Pool;
const users: Record<string, string> = {};

before(async () => {
  pool = await freshDatabase('backend');
  app = await buildBackend(pool);
  for (const r of (await pool.query('select id, email from users')).rows) users[r.email] = r.id;
});
after(async () => {
  await app.close();
  await pool.end();
});

/** Pedido como se viesse do middleware, em nome de um utilizador com papéis. */
function call(method: string, url: string, as: { email?: string; roles?: string } = {}, payload?: object) {
  return app.inject({
    method: method as 'GET',
    url: '/internal/v1' + url,
    payload,
    headers: {
      authorization: `Bearer ${config.serviceToken}`,
      'x-actor-id': as.email ? users[as.email] : '',
      'x-actor-roles': as.roles ?? '',
    },
  });
}
const editor = { email: 'editor@serradofc.pt', roles: 'editor' };
const secretaria = { email: 'secretaria@serradofc.pt', roles: 'secretaria' };
const socio = { email: 'socio@exemplo.pt' };

describe('segurança entre serviços', () => {
  test('sem token de serviço → 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/internal/v1/cms/news' });
    assert.equal(r.statusCode, 401);
  });
  test('health não precisa de token', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/internal/health' })).statusCode, 200);
  });
});

describe('autenticação', () => {
  test('login por email e por n.º de sócio', async () => {
    const a = await call('POST', '/auth/verify', {}, { login: 'Socio@Exemplo.pt', password: 'serrado1978' });
    assert.equal(a.statusCode, 200);
    assert.equal(a.json().member.memberNumber, '00482');
    assert.equal(a.json().athletes.length, 2);
    const b = await call('POST', '/auth/verify', {}, { login: '482', password: 'serrado1978' });
    assert.equal(b.json().email, 'socio@exemplo.pt');
  });
  test('password errada ou conta inexistente → 401 igual', async () => {
    assert.equal((await call('POST', '/auth/verify', {}, { login: 'socio@exemplo.pt', password: 'x' })).statusCode, 401);
    assert.equal((await call('POST', '/auth/verify', {}, { login: 'ninguem@exemplo.pt', password: 'x' })).statusCode, 401);
  });
  test('atleta não sócio: member null', async () => {
    const r = await call('POST', '/auth/verify', {}, { login: 'joao@exemplo.pt', password: 'atleta2026' });
    assert.equal(r.json().member, null);
    assert.deepEqual(r.json().athletes.map((a: { role: string }) => a.role), ['atleta']);
  });
});

describe('CMS', () => {
  test('público só vê publicados; editor vê rascunhos', async () => {
    const pub = await call('GET', '/cms/news');
    assert.ok(pub.json().items.every((n: { status: string }) => n.status === 'published'));
    const drafts = await call('GET', '/cms/news?status=draft', editor);
    assert.equal(drafts.json().total, 1);
    assert.equal((await call('GET', '/cms/news/slug/rascunho-gala-anual')).statusCode, 404);
  });

  test('fluxo editorial: criar → publicar → editar → repor versão', async () => {
    const created = await call('POST', '/cms/news', editor, { slug: 'teste-cms', title: 'Primeira versão', category: 'Clube', summary: 'Resumo', body: 'Texto' });
    assert.equal(created.statusCode, 201);
    const id = created.json().id;
    assert.equal(created.json().status, 'draft');
    assert.equal((await call('POST', `/cms/news/${id}/publish`, editor)).json().status, 'published');
    assert.equal((await call('GET', '/cms/news/slug/teste-cms')).statusCode, 200);
    await call('PUT', `/cms/news/${id}`, editor, { slug: 'teste-cms', title: 'Segunda versão', category: 'Clube', summary: 'Resumo', body: 'Texto novo' });
    const revs = (await call('GET', `/cms/news/${id}/revisions`, editor)).json();
    assert.equal(revs.length, 2);
    const first = revs[revs.length - 1];
    const restored = await call('POST', `/cms/news/${id}/revisions/${first.id}/restore`, editor);
    assert.equal(restored.json().title, 'Primeira versão');
    assert.equal(restored.json().status, 'published', 'repor uma versão não altera o estado de publicação');
  });

  test('validação e conflitos', async () => {
    assert.equal((await call('POST', '/cms/news', editor, { slug: 'Slug Inválido', title: 'x', category: 'Clube' })).statusCode, 400);
    assert.equal((await call('POST', '/cms/news', editor, { slug: 'nova-epoca-futsal', title: 'x', category: 'Clube' })).statusCode, 409);
    assert.equal((await call('POST', '/cms/news', editor, { slug: 'ok-slug', title: 'x', category: 'Inexistente' })).statusCode, 400);
  });

  test('só editor/admin escreve', async () => {
    assert.equal((await call('POST', '/cms/pages', secretaria, { slug: 'x', title: 'x' })).statusCode, 403);
    assert.equal((await call('POST', '/cms/pages', socio, { slug: 'x', title: 'x' })).statusCode, 403);
  });

  test('eventos: data local e campos numéricos', async () => {
    const r = await call('POST', '/cms/events', editor, { slug: 'torneio-teste', title: 'Torneio', kind: 'Torneio', startsAt: '2026-12-05T10:00', location: 'Pavilhão', capacity: 40, price: 5 });
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().startsAt, '2026-12-05T10:00');
    assert.equal(r.json().price, 5);
  });
});

describe('atletas', () => {
  test('encarregado vê só os educandos; staff vê todos', async () => {
    const mine = (await call('GET', '/athletes', socio)).json();
    assert.deepEqual(mine.map((a: { code: string }) => a.code).sort(), ['SFC-0001', 'SFC-0002']);
    assert.equal((await call('GET', '/athletes?scope=all', socio)).statusCode, 403);
    assert.equal((await call('GET', '/athletes?scope=all', secretaria)).json().length, 4);
  });

  test('sem acesso a atleta alheio', async () => {
    const rita = (await pool.query("select id from athletes where code = 'SFC-0003'")).rows[0].id;
    assert.equal((await call('GET', `/athletes/${rita}`, socio)).statusCode, 403);
    assert.equal((await call('PATCH', `/athletes/${rita}`, socio, { phone: '910000009' })).statusCode, 403);
  });

  test('treinador vê a ficha sem dados sensíveis e não altera', async () => {
    const tomas = (await pool.query("select id from athletes where code = 'SFC-0001'")).rows[0].id;
    const coach = { email: 'treinador@serradofc.pt', roles: 'treinador' };
    const r = (await call('GET', `/athletes/${tomas}`, coach)).json();
    assert.equal(r.taxNumber, undefined);
    assert.equal(r.idNumber, undefined);
    assert.equal(r.name, 'Tomás Exemplo');
    assert.equal((await call('PATCH', `/athletes/${tomas}`, coach, { phone: '910000009' })).statusCode, 403);
  });

  test('ficha: alterar contactos e confirmar só com a ficha completa', async () => {
    const tomas = (await pool.query("select id from athletes where code = 'SFC-0001'")).rows[0].id;
    const incomplete = await call('POST', `/athletes/${tomas}/confirm`, socio);
    assert.equal(incomplete.statusCode, 422);
    assert.match(incomplete.json().message, /Contacto de emergência/);
    assert.equal((await call('PATCH', `/athletes/${tomas}`, socio, { emergencyName: 'Mãe Exemplo', emergencyPhone: '910000003' })).statusCode, 200);
    assert.equal((await call('PATCH', `/athletes/${tomas}`, socio, { name: 'Outro' })).statusCode, 400, 'nome não é editável diretamente');
    assert.equal((await call('POST', `/athletes/${tomas}/confirm`, socio)).statusCode, 200);
    assert.equal((await call('GET', `/athletes/${tomas}`, socio)).json().confirmed, true);
  });

  test('identificação: pedido → aprovação pela secretaria aplica a alteração', async () => {
    const tomas = (await pool.query("select id from athletes where code = 'SFC-0001'")).rows[0].id;
    assert.equal((await call('POST', `/athletes/${tomas}/change-requests`, socio, { changes: { taxNumber: '123456788' } })).statusCode, 400, 'NIF inválido');
    const created = await call('POST', `/athletes/${tomas}/change-requests`, socio, { changes: { name: 'Tomás Miguel Exemplo', taxNumber: '123456789' } });
    assert.equal(created.statusCode, 201);
    assert.equal((await call('POST', `/change-requests/${created.json().id}/approve`, socio)).statusCode, 403);
    assert.equal((await call('POST', `/change-requests/${created.json().id}/approve`, secretaria)).statusCode, 200);
    const after = (await pool.query('select name, tax_number from athletes where id = $1', [tomas])).rows[0];
    assert.deepEqual(after, { name: 'Tomás Miguel Exemplo', tax_number: '123456789' });
    assert.equal((await call('POST', `/change-requests/${created.json().id}/approve`, secretaria)).statusCode, 404, 'não aprova duas vezes');
  });

  test('a base de dados recusa mudar a identificação fora de um pedido', async () => {
    await assert.rejects(pool.query("update athletes set name = 'X' where code = 'SFC-0002'"), /identity_locked/);
  });

  test('documentos: rejeitar exige motivo', async () => {
    const docs = (await call('GET', '/documents', secretaria)).json();
    assert.ok(docs.length >= 1);
    assert.equal((await call('POST', `/documents/${docs[0].id}/reject`, secretaria, {})).statusCode, 400);
    assert.equal((await call('POST', `/documents/${docs[0].id}/reject`, secretaria, { note: 'Ilegível' })).json().status, 'Rejeitado');
  });
});

describe('resultados, sócios e gestão', () => {
  test('importação idempotente de resultados', async () => {
    const rows = [{ athleteCode: 'SFC-0004', athleteName: 'JOÃO EXEMPLO', birthYear: 1996, season: '2024/2025', round: 4, race: '30º GPA Charneca', raceBase: 'GPA Charneca da Caparica', raceDate: '2025-03-16', category: 'Seniores', place: 20, time: '35:00.00', timeS: 2100, distanceM: 7800, trophyPoints: 1 }];
    const first = (await call('POST', '/results/import', secretaria, { rows })).json();
    assert.deepEqual([first.inserted, first.linked], [1, 1]);
    const again = (await call('POST', '/results/import', secretaria, { rows })).json();
    assert.deepEqual([again.inserted, again.updated], [0, 1]);
    assert.equal((await call('POST', '/results/import', editor, { rows })).statusCode, 403);
  });

  test('quotas: o próprio sócio ou a secretaria', async () => {
    assert.equal((await call('GET', '/members/00482/quotas', socio)).json()[0].status, 'Pendente');
    assert.equal((await call('GET', '/members/00731/quotas', socio)).statusCode, 403);
    assert.equal((await call('GET', '/members/00731/quotas', secretaria)).statusCode, 200);
  });

  test('estatísticas e auditoria', async () => {
    const stats = (await call('GET', '/stats', editor)).json();
    assert.equal(typeof stats.newsPublished, 'number');
    assert.equal((await call('GET', '/stats', socio)).statusCode, 403);
    const log = (await call('GET', '/audit', { email: 'admin@serradofc.pt', roles: 'admin' })).json();
    assert.ok(log.some((l: { action: string }) => l.action === 'change_requests.approve'));
    const own = (await call('GET', '/audit', editor)).json();
    assert.ok(own.every((l: { actor: string }) => l.actor === 'Equipa de Comunicação'));
  });

  test('papéis: admin gere, não pode retirar o próprio admin', async () => {
    const admin = { email: 'admin@serradofc.pt', roles: 'admin' };
    assert.equal((await call('PUT', `/users/${users['joao@exemplo.pt']}/roles`, admin, { roles: ['treinador'] })).statusCode, 200);
    assert.equal((await call('PUT', `/users/${users['admin@serradofc.pt']}/roles`, admin, { roles: ['editor'] })).statusCode, 403);
    assert.equal((await call('PUT', `/users/${users['joao@exemplo.pt']}/roles`, editor, { roles: ['admin'] })).statusCode, 403);
  });
});
