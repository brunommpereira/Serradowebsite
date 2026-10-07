-- Identidade: uma conta por pessoa (sócio, atleta, encarregado, staff — ou várias coisas).
create extension if not exists pgcrypto;

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique check (email = lower(email)),
  name          text not null,
  password_hash text not null,                 -- scrypt$N$r$p$salt$hash
  disabled      boolean not null default false,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Papéis do backoffice (quem não tem papel é utilizador normal do site)
create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role    text not null check (role in ('admin', 'editor', 'secretaria', 'treinador')),
  primary key (user_id, role)
);

-- Registo de todas as escritas (quem, o quê, quando)
create table audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor_id   uuid references users (id) on delete set null,
  action     text not null,                    -- ex.: cms.news.publish
  entity     text not null,                    -- ex.: cms_news
  entity_id  text,
  details    jsonb not null default '{}'
);
create index audit_log_at_idx on audit_log (at desc);
