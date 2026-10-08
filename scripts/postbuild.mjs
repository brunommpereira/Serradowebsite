// Pós-build para alojamento estático (GitHub Pages, Azure Static Web Apps, Netlify…):
//  - 404.html: fallback SPA para rotas renderizadas no browser (Área de Sócio) e página 404;
//  - sitemap.xml gerado a partir das rotas pré-renderizadas (secção 38 — SEO);
//  - Content-Security-Policy em cada página (meta), com os hashes dos scripts embutidos.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE_URL = process.env.SITE_URL ?? 'https://serradofc.pt';
const dist = 'dist/serrado-fc';
const browser = join(dist, 'browser');

const csr = join(browser, 'index.csr.html');
if (existsSync(csr)) copyFileSync(csr, join(browser, '404.html'));

// CSP: só correm os scripts do próprio site e os scripts embutidos que o Angular gerou neste build
// (identificados pelo hash). Um script injetado (XSS) é bloqueado pelo browser.
// O Angular não permite a opção autoCsp com páginas pré-renderizadas, por isso é feito aqui.
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
let cspPages = 0;
for (const file of htmlFiles(browser)) {
  const html = readFileSync(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const scripts = new Set();
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? 'text/javascript';
    // Só os executáveis (JSON-LD e o estado do Angular são dados, não correm)
    if (!/src=/.test(attrs) && /^(text\/javascript|module)$/.test(type)) scripts.add(sha(body));
  }
  // Atributos de evento embutidos (ex.: onload do CSS não bloqueante) precisam de 'unsafe-hashes'
  const handlers = new Set([...html.matchAll(/ on[a-z]+="([^"]*)"/g)].map(([, js]) => sha(js)));
  const policy = [
    `script-src 'self' ${[...scripts].join(' ')}${handlers.size ? ` 'unsafe-hashes' ${[...handlers].join(' ')}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const out = html.replace(/(<meta charset="[^"]*">)/i, `$1${meta}`);
  if (out === html) throw new Error(`postbuild: não encontrei <meta charset> em ${file}`);
  writeFileSync(file, out);
  cspPages++;
}

const { routes } = JSON.parse(readFileSync(join(dist, 'prerendered-routes.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const urls = Object.keys(routes)
  .map((r) => `  <url><loc>${SITE_URL}${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
writeFileSync(
  join(browser, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(`postbuild: 404.html + sitemap.xml (${Object.keys(routes).length} URLs) + CSP em ${cspPages} páginas`);

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}
