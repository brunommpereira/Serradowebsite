/**
 * Conteúdo público inicial do site: notícias, eventos, parceiros e páginas legais.
 * Não cria contas nem dados pessoais e só corre com o CMS vazio, por isso é seguro em produção.
 *   node db/seed/content.ts
 */
import { createPool, tx, type Pool } from '../../shared/db.ts';
import { loadContent, seedCms } from './seed.ts';

export async function seedPublicContent(pool: Pool, log = console.log): Promise<boolean> {
  const { rows } = await pool.query(
    `select (select count(*) from cms_news) + (select count(*) from cms_events) + (select count(*) from cms_pages) + (select count(*) from cms_partners) as n`,
  );
  if (Number(rows[0].n) > 0) {
    log('O CMS já tem conteúdo: nada a fazer.');
    return false;
  }
  const content = await loadContent();
  await tx(pool, (c) => seedCms(c, content, null, { draft: false }));
  log(`✔ conteúdo inicial: ${content.news.length} notícias, ${content.events.length} eventos, ${content.sponsors.length} parceiros, 2 páginas`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool();
  await seedPublicContent(pool);
  await pool.end();
}
