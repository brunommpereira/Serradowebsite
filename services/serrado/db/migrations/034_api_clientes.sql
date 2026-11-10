-- API para sistemas externos (pedidos de gasto): credenciais de cliente (client_id + client_secret), trocadas por
-- tokens de acesso de curta duração (OAuth2 client credentials). Do segredo e dos tokens só se guarda o SHA-256.
-- Cada cliente faz os pedidos em nome de um utilizador responsável (quem pede, para o fluxo de aprovação).
create table api_clients (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null unique check (client_id ~ '^sfc_cli_[0-9a-f]{16}$'),
  name          text not null check (length(name) between 3 and 80),
  secret_hash   text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  secret_hint   text not null default '',                          -- últimos 4 caracteres, para reconhecer
  user_id       uuid not null references users (id),               -- os pedidos ficam em nome desta pessoa
  nucleos       text[] not null default '{}',                      -- núcleos permitidos (vazio = todos)
  active        boolean not null default true,
  created_by    uuid references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  secret_rotated_at timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references users (id) on delete set null
);

create table api_tokens (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  client      uuid not null references api_clients (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index api_tokens_client_idx on api_tokens (client, expires_at);

-- De que cliente veio o pedido e a referência do sistema externo (repetir o envio não cria outro pedido)
alter table expenses
  add column api_client uuid references api_clients (id),
  add column external_ref text check (external_ref ~ '^[A-Za-z0-9._:/-]{1,64}$');
create unique index expenses_external_ref_idx on expenses (api_client, external_ref) where external_ref is not null;
