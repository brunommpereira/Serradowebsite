import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDatabase } from '../../test-utils/db.ts';
import { verifyPassword } from '../../shared/password.ts';
import type { Pool } from '../../shared/db.ts';
import { createAdmin } from '../create-admin.ts';
import { seedPublicContent } from '../seed/content.ts';

let pool: Pool;
before(async () => {
  pool = await freshDatabase('tools');
});
after(() => pool.end());

test('create-admin cria a conta com papel de admin e regista na auditoria', async () => {
  const id = await createAdmin(pool, ' Direcao@SerradoFC.pt ', 'Direção', 'uma-password-longa');
  const { rows } = await pool.query('select u.email, u.password_hash, array_agg(r.role) as roles from users u join user_roles r on r.user_id = u.id where u.id = $1 group by u.id', [id]);
  assert.equal(rows[0].email, 'direcao@serradofc.pt');
  assert.deepEqual(rows[0].roles, ['admin']);
  assert.ok(await verifyPassword('uma-password-longa', rows[0].password_hash));
  const audit = await pool.query(`select 1 from audit_log where action = 'users.create_admin' and entity_id = $1`, [id]);
  assert.equal(audit.rowCount, 1);
});

test('create-admin numa conta existente repõe a password sem a duplicar', async () => {
  const id1 = await createAdmin(pool, 'direcao@serradofc.pt', 'Direção', 'outra-password-longa');
  const { rows } = await pool.query(`select id, password_hash from users where email = 'direcao@serradofc.pt'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id1);
  assert.ok(await verifyPassword('outra-password-longa', rows[0].password_hash));
});

test('create-admin recusa passwords curtas e emails inválidos', async () => {
  await assert.rejects(createAdmin(pool, 'a@b.pt', 'X', 'curta'), /12 caracteres/);
  await assert.rejects(createAdmin(pool, 'sem-arroba', 'X', 'uma-password-longa'), /Email inválido/);
});

test('conteúdo inicial: não mexe num CMS com conteúdo e preenche um CMS vazio', async () => {
  const before = (await pool.query('select count(*)::int as n from cms_news')).rows[0].n;
  assert.equal(await seedPublicContent(pool, () => {}), false);
  assert.equal((await pool.query('select count(*)::int as n from cms_news')).rows[0].n, before);

  await pool.query('truncate cms_news, cms_events, cms_pages, cms_partners, cms_revisions restart identity cascade');
  assert.equal(await seedPublicContent(pool, () => {}), true);
  const news = await pool.query(`select count(*) filter (where status = 'published')::int as pub, count(*)::int as total from cms_news`);
  assert.ok(news.rows[0].total > 0);
  assert.equal(news.rows[0].pub, news.rows[0].total); // sem rascunhos de exemplo
  assert.equal((await pool.query(`select count(*)::int as n from cms_pages`)).rows[0].n, 2);
});
