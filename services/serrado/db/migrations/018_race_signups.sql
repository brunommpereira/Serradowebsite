-- Inscrições no Troféu de Almada pela Xistarca (serrado.xistarca).
-- Uma inscrição na 1.ª prova da época vale para todas: cada edição tem o endereço desse evento.
create table race_editions (
  id          bigint generated always as identity primary key,
  season      text not null unique,                       -- 2026/2027
  name        text not null,                              -- Troféu de Almada 2026/2027
  event_url   text not null,                              -- https://checkout.xistarca.pt/evento/...
  modality_id text not null default '',                   -- vazio = a 1.ª modalidade do evento
  team_name   text not null default 'Serrado FC',
  club_option text not null default 'Serrado FC / Outdoor Training Camp',
  opens_on    date,
  closes_on   date,
  -- test: só valida os dados na Xistarca; live: submete a inscrição
  mode        text not null default 'test' check (mode in ('test', 'live')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Calendário das provas da edição (para a área do atleta)
create table race_calendar (
  id         bigint generated always as identity primary key,
  edition_id bigint not null references race_editions (id) on delete cascade,
  round      int not null,
  name       text not null,
  race_date  date not null,
  location   text,
  info_url   text,
  unique (edition_id, round)
);

create table race_signups (
  id              bigint generated always as identity primary key,
  edition_id      bigint not null references race_editions (id) on delete cascade,
  athlete_id      uuid not null references athletes (id) on delete cascade,
  -- pedido → validado (modo test) → inscrito; erro volta a pedido quando se corrige
  status          text not null default 'pedido' check (status in ('pedido', 'validado', 'inscrito', 'erro', 'cancelado')),
  requested_by    uuid references users (id) on delete set null,
  requested_at    timestamptz not null default now(),
  consent_at      timestamptz not null,
  attempts        int not null default 0,
  last_attempt_at timestamptz,
  sent_at         timestamptz,
  message         text not null default '',
  unique (edition_id, athlete_id)
);
create index race_signups_status_idx on race_signups (edition_id, status);
