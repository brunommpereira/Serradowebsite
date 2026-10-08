-- CMS: conteúdos editados no backoffice. Todos têm estado editorial e histórico.
create table cms_news (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null,
  category     text not null,
  summary      text not null default '',
  body         text not null default '',        -- Markdown simples (parágrafos)
  cover_url    text,
  author       text not null default 'Comunicação Serrado FC',
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references users (id) on delete set null
);

create table cms_events (
  id                    bigint generated always as identity primary key,
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title                 text not null,
  kind                  text not null,         -- Torneio, Caminhada, Corrida, Solidário, Convívio, Crianças
  sport_slug            text,
  summary               text not null default '',
  body                  text not null default '',
  starts_at             timestamp not null,     -- hora local de Portugal
  end_time              text,
  location              text not null,
  capacity              int not null default 0 check (capacity >= 0),
  price                 numeric(8, 2) not null default 0,
  member_price          numeric(8, 2),
  registration_required boolean not null default false,
  ask_shirt_size        boolean not null default false,
  status                text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at          timestamptz,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references users (id) on delete set null
);

create table cms_pages (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null,
  summary      text not null default '',       -- usado como meta description
  body         text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references users (id) on delete set null
);

create table cms_partners (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null,
  category     text not null check (category in ('Patrocinador Principal', 'Patrocinador', 'Parceiro', 'Parceiro Institucional')),
  website      text,
  description  text not null default '',
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references users (id) on delete set null
);

-- Histórico: uma linha por gravação, com o conteúdo completo (permite repor versões).
create table cms_revisions (
  id         bigint generated always as identity primary key,
  type       text not null check (type in ('news', 'events', 'pages', 'partners')),
  entry_id   bigint not null,
  data       jsonb not null,
  author_id  uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index cms_revisions_entry_idx on cms_revisions (type, entry_id, created_at desc);
