import { mapColumns, toRows } from '../features/admin/data/registry';
import { excelDate, headerKey, parseCsv, readXlsx, toCsv } from './tabular';

/** Zip mínimo sem compressão (método 0), para testar o leitor de XLSX sem bibliotecas. */
function zip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name);
    const data = enc.encode(text);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out.buffer;
}

describe('leitura de folhas de cálculo', () => {
  it('CSV com ponto e vírgula, aspas e BOM', () => {
    const t = parseCsv('﻿N.º Sócio;Nome;Notas\r\n482;"Silva; Ana";"diz ""olá"""\r\n\r\n');
    expect(t).toEqual([
      ['N.º Sócio', 'Nome', 'Notas'],
      ['482', 'Silva; Ana', 'diz "olá"'],
    ]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(toCsv([['a;b', 'c']])).toBe('﻿"a;b";c\r\n');
  });

  it('XLSX: primeira folha, textos partilhados e datas do Excel', async () => {
    const buf = zip({
      'xl/workbook.xml': '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sócios" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Nome</t></si><si><t>Data de nascimento</t></si><si><r><t>Maria </t></r><r><t>Exemplo</t></r></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>31157</v></c></row></sheetData></worksheet>',
    });
    const t = await readXlsx(buf);
    expect(t).toEqual([
      ['Nome', '', 'Data de nascimento'],
      ['Maria Exemplo', '', '31157'],
    ]);
    const cols = mapColumns('members', t[0]);
    expect(cols.map((c) => c?.key ?? null)).toEqual(['name', null, 'birthDate']);
    expect(toRows(t, cols)).toEqual([{ name: 'Maria Exemplo', birthDate: '1985-04-20' }]);
  });

  it('cabeçalhos com acentos e pontuação', () => {
    expect(headerKey('N.º Sócio')).toBe('nosocio');
    expect(mapColumns('members', ['N.º Sócio', 'Nº sócio']).map((c) => c?.key ?? null)).toEqual(['memberNumber', null]);
    expect(mapColumns('athletes', ['Escalão', 'Sexo', 'Email do encarregado', 'Cor']).map((c) => c?.key ?? null)).toEqual([
      'category',
      'gender',
      'guardianEmail',
      null,
    ]);
    expect(excelDate('2026-01-05')).toBe('2026-01-05');
    expect(excelDate('45000')).toBe('2023-03-15');
  });
});
