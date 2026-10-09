/**
 * Leitura de folhas de cálculo no browser (sem bibliotecas externas e sem enviar o ficheiro a ninguém):
 * CSV (vírgula ou ponto e vírgula, com aspas) e XLSX (primeira folha). O resultado é uma tabela de texto.
 */

const MAX_UNZIPPED = 40 * 1024 * 1024; // proteção contra ficheiros «zip bomb»

/** CSV com aspas («"»). O separador (vírgula ou ponto e vírgula) é detetado na primeira linha. */
export function parseCsv(text: string, separator?: ',' | ';'): string[][] {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = separator ?? ((firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) out.push(row);
  return out;
}

/** CSV para descarregar (ponto e vírgula e BOM: o Excel em português abre-o bem). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}

// ------------------------------------------------------------------ XLSX (zip + XML)
interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
}

function zipEntries(buf: ArrayBuffer): Map<string, ZipEntry> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('O ficheiro não é um XLSX válido.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, ZipEntry>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('O ficheiro XLSX está danificado.');
    const method = v.getUint16(p + 10, true);
    const compressedSize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.set(name, { name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function unzip(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  if (e.size > MAX_UNZIPPED) throw new Error('O ficheiro é demasiado grande.');
  const v = new DataView(buf);
  if (v.getUint32(e.offset, true) !== 0x04034b50) throw new Error('O ficheiro XLSX está danificado.');
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const data = new Uint8Array(buf, start, e.compressedSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error('Compressão do XLSX não suportada.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_UNZIPPED) {
      await reader.cancel();
      throw new Error('O ficheiro é demasiado grande.');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return new TextDecoder().decode(all);
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('O ficheiro XLSX está danificado.');
  return doc;
}

/** Elementos pelo nome local (ignora os prefixos de namespace). */
function byName(parent: Document | Element, local: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', local));
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Primeira folha de um XLSX como tabela de texto. Datas ficam como número de série do Excel (ver excelDate). */
export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const entries = zipEntries(buf);
  const get = async (name: string) => {
    const e = entries.get(name);
    return e ? unzip(buf, e) : null;
  };
  const workbook = await get('xl/workbook.xml');
  if (!workbook) throw new Error('O ficheiro não é um XLSX válido.');
  const firstSheet = byName(xml(workbook), 'sheet')[0];
  const rid = firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? firstSheet?.getAttribute('r:id');
  let path = 'xl/worksheets/sheet1.xml';
  const rels = await get('xl/_rels/workbook.xml.rels');
  if (rels && rid) {
    const target = byName(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
    if (target) path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const shared: string[] = [];
  const sst = await get('xl/sharedStrings.xml');
  if (sst) {
    for (const si of byName(xml(sst), 'si')) shared.push(byName(si, 't').map((t) => t.textContent ?? '').join(''));
  }
  const sheet = await get(path);
  if (!sheet) throw new Error('Não encontrei a primeira folha do XLSX.');
  const out: string[][] = [];
  for (const row of byName(xml(sheet), 'row')) {
    const cells: string[] = [];
    let next = 0;
    for (const c of byName(row, 'c')) {
      const ref = c.getAttribute('r');
      const idx = ref ? colIndex(ref) : next;
      next = idx + 1;
      const type = c.getAttribute('t');
      const v = byName(c, 'v')[0]?.textContent ?? '';
      let value: string;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = byName(c, 't').map((t) => t.textContent ?? '').join('');
      else if (type === 'b') value = v === '1' ? 'Sim' : 'Não';
      else value = v;
      while (cells.length < idx) cells.push('');
      cells[idx] = value.trim();
    }
    if (cells.some((x) => x !== '')) out.push(cells);
  }
  return out;
}

/** Número de série do Excel (1900) → AAAA-MM-DD; texto que já é data fica igual. */
export function excelDate(value: string): string {
  if (/^\d{4,5}(\.\d+)?$/.test(value)) {
    const n = Math.floor(Number(value));
    if (n > 0 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
  }
  return value;
}

/** Lê um ficheiro .csv ou .xlsx escolhido pela pessoa. */
export async function readTable(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) throw new Error('Ficheiros .xls antigos não são suportados: grava como .xlsx ou .csv no Excel.');
  return parseCsv(await file.text());
}

/** Cabeçalho normalizado para comparar («N.º Sócio» → «nsocio»). */
export function headerKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
