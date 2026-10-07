// Extrai os resultados de todas as provas do Troféu Almada em Atletismo
// "Mário Pinto Claro" (tatletismo-almada.pt) para os atletas do Serrado FC.
// Uso: node extract.js out/resultados-brutos.csv
const { chromium } = require('playwright');
const fs = require('fs');
const SITE = 'https://tatletismo-almada.pt';
const OUT = process.argv[2] || 'out/resultados-brutos.csv';
const isSerrado = (team) => /serrado/i.test(team || '');

// Calendários lidos das páginas "PROVAS" de cada época
const CAL = {
  '2023/2024': [
    ['1a-prova-23-24', 'Troféu da Caparica 2023', '2023-11-19'],
    ['2a-prova-23-24', '29º GPA Charneca da Caparica', '2024-03-24'],
    ['3a-prova-23-24', 'PT 50º Aniversário do 25 de Abril', '2024-04-27'],
    ['4a-prova-23-24', '5º Corta-Mato Rui Duarte Silva', '2024-05-12'],
    ['5a-prova-23-24', '7ª Milha Urbana Alberto Chaíça', '2024-05-18'],
    ['6a-prova-23-24', 'Corrida da Egas Moniz', '2024-05-26'],
    ['7a-prova-23-24', '6º GPA do CS Armada', '2024-06-02'],
    ['8a-prova-23-24', '8º Meeting Artemisa Sá', '2024-06-10'],
  ],
  '2024/2025': [
    ['1a-prova-24-25', 'Troféu da Caparica 2024', '2024-11-17'],
    ['2a-prova-24-25', '5º GP São Martinho de Almada', '2024-11-24'],
    ['3a-prova-24-25', '1º Corta-Mato dos Reis', '2025-01-18'],
    ['4a-prova-24-25', '30º GPA Charneca da Caparica', '2025-03-16'],
    ['5a-prova-24-25', '7º GP Atletismo do CS Armada', '2025-03-30'],
    ['6a-prova-24-25', '51º Aniversário do 25 de Abril', '2025-05-01'],
    ['7a-prova-24-25', '8ª Milha Urbana Alberto Chaíça', '2025-05-03'],
    ['8a-prova-24-25', '6º Corta-Mato Rui Duarte Silva', '2025-05-11'],
    ['9a-prova-24-25', 'Corrida Egas Moniz 2025', '2025-06-08'],
    ['10a-prova-24-25', '9º Meeting Artemisa Sá', '2025-06-10'],
  ],
};
// 2025/26: resultados publicados em CSV (TAA-N-site-ind = N-ésima corrida;
// Tecnicas1/2 = provas técnicas). A ordem corresponde às colunas da
// classificação do troféu e às datas de publicação.
const CSV_2526 = [
  ['TAA-1-site-ind', 1, '6º GP São Martinho de Almada', '2025-11-09'],
  ['TAA-2-site-ind', 2, 'Troféu da Caparica 2025', '2025-11-16'],
  ['TAA-3-site-ind', 3, '1ª Corrida Noturna dos Reis', '2026-01-17'],
  ['TAA-4-site-ind', 4, '31º GPA Charneca da Caparica', '2026-03-15'],
  ['TAA-Tecnicas1-25-26-site-ind', 5, '52º PT Aniversário do 25 de Abril', '2026-05-01'],
  ['TAA-5-site-ind', 6, '9ª Milha Urbana Alberto Chaíça', '2026-05-03'],
  ['TAA-6-site-ind', 7, '7º Corta-Mato Rui Duarte Silva', '2026-05-17'],
  ['TAA-7-site-ind', 8, '3ª Corrida Egas Moniz', '2026-05-24'],
  ['TAA-Tecnicas2-25-26-site-ind', 10, '10º PT Meeting Artemisa Sá', '2026-06-10'],
];

const HEADER = ['Época', 'N.º prova', 'Prova', 'Data', 'Tipo', 'Escalão', 'Classificação no escalão', 'Dorsal', 'Nome', 'Ano nascimento', 'Equipa', 'Tempo / Marca', 'Pontos equipas', 'Pontos troféu', 'Fonte'];
const rows = [];
const log = [];

function pick(obj, ...names) {
  for (const n of names) {
    const k = Object.keys(obj).find((k) => k.toLowerCase() === n.toLowerCase());
    if (k !== undefined && obj[k] !== '') return obj[k];
  }
  return '';
}

function add(season, n, name, date, src, r) {
  const marca = pick(r, 'Tempo', 'Marca');
  rows.push([
    season, n, name, date,
    pick(r, 'Marca') && !pick(r, 'Tempo') ? 'Técnica' : 'Corrida',
    pick(r, 'Escalão'),
    pick(r, 'Classificação no Escalão', 'Classificação'),
    pick(r, 'Dorsal'),
    pick(r, 'Nome', 'Nome_atleta'),
    pick(r, 'Ano Nascimento', 'Idade'),
    pick(r, 'Equipa'),
    marca,
    pick(r, 'Pontos para Class Equipas'),
    pick(r, 'Pontos Troféu', 'Pontos Circuito'),
    src,
  ]);
}

function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) out.push(row); row = []; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  const [h, ...data] = out;
  return data.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // ---- 2023/24 e 2024/25: tabelas wpDataTables (lidas pela API DataTables no browser)
  for (const [season, list] of Object.entries(CAL)) {
    for (const [slug, name, date] of list) {
      const url = `${SITE}/index.php/${slug}/`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
      const tables = await page.evaluate(() =>
        [...document.querySelectorAll('table.wpDataTable')].map((t) => {
          const dt = jQuery(t).DataTable();
          const cols = dt.settings()[0].aoColumns.map((c) => c.sTitle.trim());
          return { cols, data: dt.rows().data().toArray() };
        }),
      );
      // Tabelas individuais têm a coluna "Nome"; as de equipas não
      const ind = tables.filter((t) => t.cols.includes('Nome'));
      let all = 0, mine = 0;
      for (const t of ind) {
        for (const d of t.data) {
          const r = Object.fromEntries(t.cols.map((c, i) => [c, String(d[i] ?? '').trim()]));
          all++;
          if (isSerrado(r.Equipa)) { mine++; add(season, Number(slug.split('a-')[0]), name, date, url, r); }
        }
      }
      log.push(`${season} ${slug.padEnd(16)} ${String(ind.length).padStart(2)} tabela(s) ${String(all).padStart(4)} atletas  ${String(mine).padStart(3)} Serrado  ${name}`);
    }
  }

  // ---- 2025/26: CSV publicados (a versão mais recente de cada ficheiro)
  // Pedidos feitos dentro da página (mesma origem), como faria o browser do utilizador
  const get = (url) => page.evaluate(async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.text(); }, url);
  await page.goto(`${SITE}/index.php/provas-25-26/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const media = [];
  for (let pg = 1; ; pg++) {
    const items = JSON.parse((await get(`${SITE}/index.php/wp-json/wp/v2/media?per_page=100&page=${pg}&_fields=date,source_url`)).replace(/^﻿/, ''));
    media.push(...items);
    if (items.length < 100) break;
  }
  for (const [base, n, name, date] of CSV_2526) {
    const re = new RegExp(`/${base}(-\\d+)?\\.csv$`);
    const latest = media.filter((m) => re.test(m.source_url)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) { log.push(`2025/2026 ${base}: CSV não encontrado`); continue; }
    const text = await get(latest.source_url);
    const data = parseCsv(text);
    const mine = data.filter((r) => isSerrado(r.Equipa));
    mine.forEach((r) => add('2025/2026', n, name, date, latest.source_url, r));
    log.push(`2025/2026 ${base.padEnd(30)} ${String(data.length).padStart(4)} atletas  ${String(mine.length).padStart(3)} Serrado  ${name}`);
  }

  // ---- Verificação 25/26: pontos por prova vs classificação geral do troféu
  await page.goto(`${SITE}/index.php/trofeu-25-26/`, { waitUntil: 'networkidle', timeout: 120000 });
  const standing = await page.evaluate(() => {
    const t = [...document.querySelectorAll('table.wpDataTable')][0];
    const dt = jQuery(t).DataTable();
    const cols = dt.settings()[0].aoColumns.map((c) => c.sTitle.trim());
    return { cols, data: dt.rows().data().toArray() };
  });
  const races = [['6 GP S MARTINHO ALMADA', 1], ['TROFÉU DA CAPARICA 2025', 2], ['CORRIDA NOTURNA DOS REIS', 3], ['GPA CHARNECA DE CAPARICA', 4], ['MILHA URBANA ALBERTO CHAÍÇA', 6], ['CORTA MATO RUI SILVA', 7], ['CORRIDA EGAS MONIZ', 8]];
  let checked = 0, mismatch = 0;
  for (const d of standing.data) {
    const r = Object.fromEntries(standing.cols.map((c, i) => [c, String(d[i] ?? '').trim()]));
    if (!isSerrado(r.Equipa)) continue;
    for (const [col, n] of races) {
      const pts = r[col];
      if (!pts) continue;
      const mine = rows.find((x) => x[0] === '2025/2026' && x[1] === n && x[7] === r.Dorsal);
      checked++;
      if (!mine || mine[13] !== pts) { mismatch++; if (mismatch <= 5) log.push(`  ! dorsal ${r.Dorsal} ${col}: troféu=${pts} prova=${mine ? mine[13] : 'ausente'}`); }
    }
  }
  log.push(`Verificação 25/26: ${checked} pontuações comparadas com a classificação do troféu, ${mismatch} diferenças`);

  await browser.close();

  rows.sort((a, b) => a[3].localeCompare(b[3]) || a[5].localeCompare(b[5]) || (Number(a[6]) || 999) - (Number(b[6]) || 999));
  const esc = (v) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  fs.writeFileSync(OUT, '﻿' + [HEADER, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n');
  console.log(log.join('\n'));
  console.log(`\n${rows.length} resultados de ${new Set(rows.map((r) => r[8])).size} atletas → ${OUT}`);
})();
