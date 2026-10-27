// Pós-build para alojamento estático (o mesmo passo do site do Serrado FC, sem as partes do backoffice):
//  - 404.html: a app sem página pré-renderizada, que mostra «Página não encontrada»;
//  - Content-Security-Policy em cada página (meta), com os hashes dos scripts embutidos;
//  - sitemap.xml a partir das rotas pré-renderizadas.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const SITE_URL = process.env.SITE_URL ?? 'https://www.asrosinhas.org';
const dist = 'dist/asrosinhas';
const browser = join(dist, 'browser');

const csr = join(browser, 'index.csr.html');
if (existsSync(csr)) copyFileSync(csr, join(browser, '404.html'));

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
let cspPages = 0;
for (const file of htmlFiles(browser)) {
  const html = readFileSync(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;
  const scripts = new Set();
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? 'text/javascript';
    if (!/src=/.test(attrs) && /^(text\/javascript|module)$/.test(type)) scripts.add(sha(body));
  }
  const handlers = new Set([...html.matchAll(/ on[a-z]+="([^"]*)"/g)].map(([, js]) => sha(js)));
  const policy = [
    `script-src 'self' ${[...scripts].join(' ')}${handlers.size ? ` 'unsafe-hashes' ${[...handlers].join(' ')}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
  const out = html.replace(
    /(<meta charset="[^"]*">)/i,
    `$1<meta http-equiv="Content-Security-Policy" content="${policy}">`,
  );
  if (out === html) throw new Error(`postbuild: não encontrei <meta charset> em ${file}`);
  writeFileSync(file, out);
  cspPages++;
}

const { routes } = JSON.parse(readFileSync(join(dist, 'prerendered-routes.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const urls = Object.keys(routes)
  .map(
    (r) => `  <url><loc>${SITE_URL}${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod></url>`,
  )
  .join('\n');
writeFileSync(
  join(browser, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(
  `postbuild: 404.html + sitemap.xml (${Object.keys(routes).length} URLs) + CSP em ${cspPages} páginas`,
);

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : p.endsWith('.html') ? [p] : [];
  });
}
