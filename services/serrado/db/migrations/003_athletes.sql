-- Atletas e quem tem acesso a cada um.
create table athletes (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,         -- SFC-0001
  name            text not null,
  birth_date      date,
  gender          text check (gender in ('Feminino', 'Masculino')),
  id_number       text,                         -- CC/BI (sensível)
  id_expiry       date,
  tax_number      text,                         -- NIF (sensível)
  email           text,
  phone           text,
  address         text,
  postal_code     text,
  city            text,
  sport_slug      text not null default 'atletismo',
  category        text,                         -- escalão
  shirt_size      text,
  shirt_type      text check (shirt_type in ('Normal', 'Alças')),
  emergency_name  text,
  emergency_phone text,
  consent_rgpd    boolean not null default false,
  consent_image   boolean not null default false,
  confirmed_at    date,                          -- última confirmação da ficha
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table athlete_access (
  user_id    uuid not null references users (id) on delete cascade,
  athlete_id uuid not null references athletes (id) on delete cascade,
  role       text not null check (role in ('encarregado', 'co-encarregado', 'atleta')),
  primary key (user_id, athlete_id)
);

create table athlete_documents (
  id          bigint generated always as identity primary key,
  athlete_id  uuid not null references athletes (id) on delete cascade,
  kind        text not null,                    -- cc-frente, cc-verso, foto, rgpd, exame, ficha
  status      text not null default 'Em falta' check (status in ('Em falta', 'Em análise', 'Aprovado', 'Rejeitado')),
  file_key    text,                             -- caminho no armazenamento privado
  note        text,                             -- motivo da rejeição
  updated_at  timestamptz not null default now(),
  unique (athlete_id, kind)
);

-- Alterações a dados de identificação pedidas pelo encarregado/atleta: a secretaria valida.
create table athlete_change_requests (
  id           bigint generated always as identity primary key,
  athlete_id   uuid not null references athletes (id) on delete cascade,
  requested_by uuid references users (id) on delete set null,
  changes      jsonb not null,                  -- {"name": "…", "tax_number": "…"}
  status       text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  note         text,
  requested_at timestamptz not null default now(),
  reviewed_by  uuid references users (id) on delete set null,
  reviewed_at  timestamptz
);
create index change_requests_status_idx on athlete_change_requests (status, requested_at);

-- Os dados de identificação só mudam dentro da aprovação de um pedido
-- (o backend ativa app.identity_change na transação) ou na importação inicial.
create function protect_identity() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.identity_change', true), '') <> 'on'
     and (new.name, new.birth_date, new.gender, new.id_number, new.tax_number, new.code)
         is distinct from (old.name, old.birth_date, old.gender, old.id_number, old.tax_number, old.code) then
    raise exception 'identity_locked: dados de identificação só mudam por pedido validado pela secretaria';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger athletes_protect_identity before update on athletes
  for each row execute function protect_identity();
