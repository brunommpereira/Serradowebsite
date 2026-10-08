-- Contas externas (Google, Microsoft…) ligadas a um utilizador do clube.
-- Só se liga a uma conta que já existe (criada pela secretaria): não há registo livre.
create table user_identities (
  provider     text not null check (provider ~ '^[a-z0-9-]{1,32}$'),
  subject      text not null check (length(subject) between 1 and 255), -- identificador estável no fornecedor («sub»)
  user_id      uuid not null references users (id) on delete cascade,
  email        text,                                                    -- email verificado no momento da ligação
  linked_at    timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (provider, subject),
  unique (user_id, provider)
);
