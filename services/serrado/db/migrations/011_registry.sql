-- Gestão de sócios e atletas no backoffice: dados de sócio sem conta obrigatória, n.º de sócio
-- dos atletas, quotas por categoria e pagamentos registados à mão (numerário, transferência…).

-- Sócios: os dados passam a viver no sócio (a conta no site é opcional e liga-se pelo email)
alter table members
  add column name        text,
  add column email       text check (email = lower(email)),
  add column phone       text,
  add column tax_number  text,
  add column birth_date  date,
  add column address     text,
  add column postal_code text,
  add column city        text,
  add column notes       text not null default '',
  add column created_at  timestamptz not null default now();
update members m set name = u.name, email = u.email from users u where u.id = m.user_id;
update members set name = 'Sócio n.º ' || member_number where name is null;
alter table members alter column name set not null;
create index members_email_idx on members (email);

-- Números novos: a seguir ao maior número já usado
create sequence member_number_seq;
select setval('member_number_seq', coalesce((select max(member_number::int) from members where member_number ~ '^\d{1,8}$'), 0) + 1, false);

-- Atletas: código automático (SFC-0001…) e n.º de sócio (o atleta pode ser sócio)
create sequence athlete_code_seq;
select setval('athlete_code_seq', coalesce((select max(substring(code from '\d+$')::int) from athletes where code ~ '\d+$'), 0) + 1, false);
alter table athletes add column member_number text references members (member_number) on update cascade on delete set null;
create index athletes_member_idx on athletes (member_number);

-- Quotas por categoria de sócio (mensal: «Outubro 2026», vence a dia 8; anual: «Quota 2026», vence a 31 de janeiro)
create table quota_plans (
  category    text primary key check (length(category) between 2 and 40),
  amount      numeric(8, 2) not null check (amount > 0 and amount < 1000),
  periodicity text not null default 'mensal' check (periodicity in ('mensal', 'anual')),
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Pagamentos registados no backoffice (numerário, transferência, MB WAY ao balcão…)
alter table payments
  add column provider    text not null default 'stripe' check (provider in ('stripe', 'manual')),
  add column recorded_by uuid references users (id) on delete set null,
  add column note        text not null default '';
