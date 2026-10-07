/**
 * Dados de DEMONSTRAÇÃO (todos fictícios). Apaga e volta a criar o conteúdo —
 * usar só em desenvolvimento/testes, nunca na base de dados de produção.
 */
import { readFile } from 'node:fs/promises';
import { createPool, tx, type Client, type Pool } from '../../shared/db.ts';
import { hashPassword } from '../../shared/password.ts';

interface Content {
  news: { slug: string; title: string; category: string; summary: string; content: string[]; author: string; publicationDate: string }[];
  events: {
    slug: string; title: string; kind: string; sportSlug?: string; summary: string; description: string[]; date: string; endTime?: string;
    location: string; capacity: number; price: number; memberPrice?: number; registrationRequired: boolean; askShirtSize: boolean;
  }[];
  sponsors: { name: string; category: string; website: string; description: string; active: boolean }[];
}

export const DEMO_USERS = [
  { email: 'socio@exemplo.pt', name: 'Sócio Demonstração', password: 'serrado1978', member: ['00482', 'Familiar'], roles: [] },
  { email: 'atleta@exemplo.pt', name: 'Rita Exemplo', password: 'atleta2026', member: ['00731', 'Efetivo'], roles: [] },
  { email: 'joao@exemplo.pt', name: 'João Exemplo', password: 'atleta2026', member: null, roles: [] },
  { email: 'admin@serradofc.pt', name: 'Administração', password: 'admin2026', member: null, roles: ['admin'] },
  { email: 'editor@serradofc.pt', name: 'Equipa de Comunicação', password: 'editor2026', member: null, roles: ['editor'] },
  { email: 'secretaria@serradofc.pt', name: 'Secretaria', password: 'secretaria2026', member: null, roles: ['secretaria'] },
  { email: 'treinador@serradofc.pt', name: 'Treinador Exemplo', password: 'treinador2026', member: null, roles: ['treinador'] },
] as const;

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function seed(pool: Pool, log = console.log) {
  const content: Content = JSON.parse(await readFile(new URL('./content.json', import.meta.url), 'utf8'));
  await tx(pool, async (c) => {
    await c.query(`truncate users, user_roles, audit_log, members, quotas, athletes, athlete_access, athlete_documents,
      athlete_change_requests, races, results, cms_news, cms_events, cms_pages, cms_partners, cms_revisions restart identity cascade`);
    const ids: Record<string, string> = {};
    for (const u of DEMO_USERS) {
      const { rows } = await c.query('insert into users (email, name, password_hash) values ($1, $2, $3) returning id', [u.email, u.name, await hashPassword(u.password)]);
      ids[u.email] = rows[0].id;
      for (const r of u.roles) await c.query('insert into user_roles values ($1, $2)', [rows[0].id, r]);
      if (u.member) await c.query('insert into members (member_number, user_id, category, joined_on) values ($1, $2, $3, $4)', [u.member[0], rows[0].id, u.member[1], '2019-03-01']);
    }
    await seedQuotas(c);
    await seedAthletes(c, ids);
    await seedResults(c);
    await seedCms(c, content, ids['editor@serradofc.pt']);
  });
  log(`✔ seed: ${DEMO_USERS.length} contas, 4 atletas, ${content.news.length + 1} notícias, ${content.events.length} eventos`);
}

async function seedQuotas(c: Client) {
  const rows: [string, number, string, string | null, string | null, string | null][] = [
    ['Novembro 2026', 20, '2026-11-08', null, null, null],
    ['Outubro 2026', 20, '2026-10-08', '2026-10-02', 'MB WAY', 'R2026/0412'],
    ['Setembro 2026', 20, '2026-09-08', '2026-09-05', 'MB WAY', 'R2026/0377'],
  ];
  for (const [period, amount, due, paid, method, receipt] of rows) {
    await c.query('insert into quotas (member_number, period, amount, due_date, paid_at, payment_method, receipt_number) values ($1,$2,$3,$4,$5,$6,$7)', ['00482', period, amount, due, paid, method, receipt]);
  }
}

async function seedAthletes(c: Client, users: Record<string, string>) {
  const athletes = [
    {
      code: 'SFC-0001', name: 'Tomás Exemplo', birth: '2016-03-12', gender: 'Masculino', sport: 'futsal', category: 'Sub-11',
      id_number: '31234567', tax: '258369140', email: 'socio@exemplo.pt', phone: '910000000', shirt: '10A', emergency: [null, null], confirmed: null,
      access: [['socio@exemplo.pt', 'encarregado']],
      docs: { 'cc-frente': 'Aprovado', 'cc-verso': ['Rejeitado', 'Imagem desfocada'], foto: 'Aprovado', rgpd: 'Em falta', exame: ['Rejeitado', 'Falta a assinatura do médico'], ficha: 'Em análise' },
    },
    {
      code: 'SFC-0002', name: 'Inês Exemplo', birth: '2013-07-02', gender: 'Feminino', sport: 'atletismo', category: 'Infantis',
      id_number: '30987654', tax: '246813571', email: 'socio@exemplo.pt', phone: '910000000', shirt: 'XS', emergency: ['Avó Exemplo', '920000000'], confirmed: '2026-09-10',
      access: [['socio@exemplo.pt', 'encarregado']],
      docs: { 'cc-frente': 'Aprovado', 'cc-verso': 'Aprovado', foto: 'Aprovado', rgpd: 'Aprovado', exame: 'Aprovado', ficha: 'Aprovado' },
    },
    {
      code: 'SFC-0003', name: 'Rita Exemplo', birth: '1985-04-21', gender: 'Feminino', sport: 'atletismo', category: 'Veteranas I',
      id_number: '12345678', tax: '123456789', email: 'atleta@exemplo.pt', phone: '910000001', shirt: 'S', emergency: ['Pedro Exemplo', '930000000'], confirmed: '2025-10-02',
      access: [['atleta@exemplo.pt', 'atleta']],
      docs: { 'cc-frente': 'Aprovado', 'cc-verso': 'Aprovado', foto: 'Aprovado', exame: 'Em análise', ficha: 'Aprovado' },
    },
    {
      code: 'SFC-0004', name: 'João Exemplo', birth: '1996-08-09', gender: 'Masculino', sport: 'atletismo', category: 'Seniores',
      id_number: '14567890', tax: '214365875', email: 'joao@exemplo.pt', phone: '960000000', shirt: 'M', emergency: ['Ana Exemplo', '910000002'], confirmed: '2026-09-20',
      access: [['joao@exemplo.pt', 'atleta']],
      docs: { 'cc-frente': 'Aprovado', 'cc-verso': 'Aprovado', foto: 'Aprovado', rgpd: 'Aprovado', exame: 'Aprovado' },
    },
  ] as const;
  for (const a of athletes) {
    const { rows } = await c.query(
      `insert into athletes (code, name, birth_date, gender, sport_slug, category, id_number, id_expiry, tax_number, email, phone, address, postal_code, city,
         shirt_size, shirt_type, emergency_name, emergency_phone, consent_rgpd, consent_image, confirmed_at)
       values ($1,$2,$3,$4,$5,$6,$7,'2029-05-30',$8,$9,$10,'Rua do Exemplo, 10','2825-000','Caparica',$11,'Normal',$12,$13,true,true,$14) returning id`,
      [a.code, a.name, a.birth, a.gender, a.sport, a.category, a.id_number, a.tax, a.email, a.phone, a.shirt, a.emergency[0], a.emergency[1], a.confirmed],
    );
    for (const [email, role] of a.access) await c.query('insert into athlete_access values ($1, $2, $3)', [users[email], rows[0].id, role]);
    for (const [kind, v] of Object.entries(a.docs)) {
      const [status, note] = Array.isArray(v) ? v : [v, null];
      await c.query('insert into athlete_documents (athlete_id, kind, status, note, file_key) values ($1,$2,$3,$4,$5)', [rows[0].id, kind, status, note, status === 'Em falta' ? null : `athletes/${a.code}/${kind}.pdf`]);
    }
    if (a.code === 'SFC-0002') {
      await c.query(`insert into athlete_change_requests (athlete_id, requested_by, changes) values ($1, $2, $3)`, [rows[0].id, users['socio@exemplo.pt'], { name: 'Inês Maria Exemplo' }]);
    }
  }
}

async function seedResults(c: Client) {
  const races: [string, number, string, string, string][] = [
    ['2025/2026', 1, '6º GP São Martinho de Almada', 'GP São Martinho de Almada', '2025-11-09'],
    ['2025/2026', 2, 'Troféu da Caparica 2025', 'Troféu da Caparica', '2025-11-16'],
    ['2025/2026', 8, '3ª Corrida Egas Moniz', 'Corrida Egas Moniz', '2026-05-24'],
  ];
  for (const r of races) await c.query('insert into races (season, round, name, base_name, race_date) values ($1,$2,$3,$4,$5)', r);
  const rows: [number, string, string, number, string, number, number, number][] = [
    [1, 'SFC-0002', 'Infantis', 4, '3:44.25', 224.25, 1000, 7],
    [2, 'SFC-0002', 'Infantis', 3, '3:47.61', 227.61, 1000, 8],
    [1, 'SFC-0003', 'Veteranas I', 5, '29:05.31', 1745.31, 5850, 6],
    [8, 'SFC-0003', 'Veteranas I', 3, '35:40.17', 2140.17, 7000, 8],
    [8, 'SFC-0004', 'Seniores', 12, '28:41.06', 1721.06, 7000, 1],
  ];
  for (const [round, code, category, place, time, s, dist, pts] of rows) {
    await c.query(
      `insert into results (race_id, athlete_id, athlete_name, birth_year, category, place, time, time_s, distance_m, trophy_points)
       select r.id, a.id, upper(a.name), extract(year from a.birth_date), $3, $4, $5, $6, $7, $8 from races r, athletes a where r.round = $1 and a.code = $2`,
      [round, code, category, place, time, s, dist, pts],
    );
  }
}

async function seedCms(c: Client, content: Content, editor: string) {
  for (const n of content.news) {
    await c.query(
      `insert into cms_news (slug, title, category, summary, body, author, status, published_at, updated_by) values ($1,$2,$3,$4,$5,$6,'published',$7,$8)`,
      [n.slug, n.title, n.category, n.summary, n.content.join('\n\n'), n.author, n.publicationDate + 'T09:00:00Z', editor],
    );
  }
  await c.query(
    `insert into cms_news (slug, title, category, summary, body, status, updated_by) values ('rascunho-gala-anual', 'Gala anual do clube: reserva a data', 'Clube', 'A gala de aniversário regressa em abril.', 'Texto em preparação.', 'draft', $1)`,
    [editor],
  );
  for (const e of content.events) {
    await c.query(
      `insert into cms_events (slug, title, kind, sport_slug, summary, body, starts_at, end_time, location, capacity, price, member_price, registration_required, ask_shirt_size, status, published_at, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'published',now(),$15)`,
      [e.slug, e.title, e.kind, e.sportSlug ?? null, e.summary, e.description.join('\n\n'), e.date, e.endTime ?? null, e.location, e.capacity, e.price, e.memberPrice ?? null, e.registrationRequired, e.askShirtSize, editor],
    );
  }
  for (const s of content.sponsors) {
    await c.query(
      `insert into cms_partners (slug, name, category, website, description, status, published_at, updated_by) values ($1,$2,$3,$4,$5,$6,now(),$7)`,
      [slugify(s.name), s.name, s.category, s.website, s.description, s.active ? 'published' : 'archived', editor],
    );
  }
  const pages: [string, string, string, string][] = [
    ['privacidade', 'Política de Privacidade', 'Como o Serrado FC trata os dados pessoais de sócios, atletas e visitantes.',
      'O Serrado Futebol Clube é o responsável pelo tratamento dos dados pessoais recolhidos neste site.\n\nOs dados são usados apenas para gerir a relação com sócios, atletas e encarregados de educação, e nunca são vendidos a terceiros.\n\nPode pedir acesso, retificação ou eliminação dos seus dados através de geral@serradofc.pt.'],
    ['cookies', 'Política de Cookies', 'Que cookies usamos e como pode geri-los.',
      'Usamos apenas cookies essenciais ao funcionamento do site e à sessão da área reservada.\n\nPode apagar ou bloquear cookies nas definições do seu browser.'],
  ];
  for (const [slug, title, summary, body] of pages) {
    await c.query(`insert into cms_pages (slug, title, summary, body, status, published_at, updated_by) values ($1,$2,$3,$4,'published',now(),$5)`, [slug, title, summary, body, editor]);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool();
  await seed(pool);
  await pool.end();
}
