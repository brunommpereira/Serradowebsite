-- Pré-inscrições: pais (ou o próprio) deixam os contactos para o clube ligar. Ainda não são atletas:
-- quando o clube os inscreve, a ficha de atleta é criada à parte (e esta fica «inscrito»).
create table interest_signups (
  id             bigint generated always as identity primary key,
  sport          text not null check (sport in ('atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto')),
  child_name     text not null,
  birth_date     date,
  guardian_name  text not null,
  email          text not null,
  phone          text not null,
  notes          text not null default '',
  consent_at     timestamptz not null,          -- aceitou ser contactado e a política de privacidade
  ip             text,
  user_agent     text not null default '',
  status         text not null default 'novo' check (status in ('novo', 'contactado', 'inscrito', 'desistiu')),
  staff_note     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references users (id) on delete set null
);
create index interest_signups_created_idx on interest_signups (created_at desc);
