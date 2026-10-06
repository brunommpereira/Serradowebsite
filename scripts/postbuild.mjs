// Pós-build para alojamento estático (GitHub Pages, Azure Static Web Apps, Netlify…):
//  - 404.html: fallback SPA para rotas renderizadas no browser (Área de Sócio) e página 404;
//  - sitemap.xml gerado a partir das rotas pré-renderizadas (secção 38 — SEO).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE_URL = process.env.SITE_URL ?? 'https://serradofc.pt';
const dist = 'dist/serrado-fc';
const browser = join(dist, 'browser');

const csr = join(browser, 'index.csr.html');
if (existsSync(csr)) copyFileSync(csr, join(browser, '404.html'));

const { routes } = JSON.parse(readFileSync(join(dist, 'prerendered-routes.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const urls = Object.keys(routes)
  .map((r) => `  <url><loc>${SITE_URL}${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
writeFileSync(
  join(browser, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(`postbuild: 404.html + sitemap.xml (${Object.keys(routes).length} URLs)`);
