-- =============================================================================
-- Serrado FC — Área de Atletas: esquema do backend privado (Supabase / Postgres)
--
-- O site continua estático (GitHub Pages). Os dados pessoais ficam APENAS aqui,
-- protegidos por Row Level Security: cada conta só lê os atletas a que tem
-- acesso (os seus educandos e/ou o seu próprio registo de atleta).
-- Executar no SQL Editor do projeto Supabase (região UE).
-- =============================================================================

-- ---------------------------------------------------------------- contas
-- Uma conta (auth.users) por PESSOA. Ser sócio é opcional: atletas e
-- encarregados entram na Área de Atletas sem n.º de sócio. Quem é sócio e
-- atleta/encarregado usa a mesma conta nas duas áreas (ponto de acesso único).
create table public.accounts (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null,
  member_number text unique,                   -- null = não é sócio
  created_at    timestamptz not null default now()
);

-- Equipa do clube com acesso alargado (backoffice «Administração»)
create table public.staff (
  member_id uuid primary key references public.accounts (id) on delete cascade,
  role      text not null check (role in ('admin', 'secretaria', 'treinador'))
);

-- ---------------------------------------------------------------- atletas
create table public.athletes (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,            -- SFC-0001 (gerado por tools/trofeu-almada/consolidate.py)
  name        text not null,
  gender      text,
  birth_date  date,
  id_number   text,                            -- n.º CC/BI (dado sensível)
  tax_number  text,                            -- NIF (dado sensível)
  email       text,
  phone       text,
  address     text,
  id_expiry   date,
  postal_code text,
  city        text,
  sport_slug  text not null default 'atletismo',
  category    text,                            -- escalão
  shirt_size  text,
  shirt_type  text check (shirt_type in ('Normal', 'Alças')),
  emergency_name  text,
  emergency_phone text,
  consent_rgpd    boolean not null default false,
  consent_image   boolean not null default false,
  confirmed_at    date,                         -- última confirmação dos dados (por época)
  created_at  timestamptz not null default now()
);

-- Alterações a dados de identificação (nome, nascimento, género, CC, NIF)
-- pedidas pelo encarregado/atleta: a secretaria valida antes de aplicar.
create table public.athlete_change_requests (
  id           bigint generated always as identity primary key,
  athlete_id   uuid not null references public.athletes (id) on delete cascade,
  requested_by uuid not null references public.accounts (id) on delete cascade,
  changes      jsonb not null,                 -- {"name": "…", "tax_number": "…"}
  status       text not null default 'pendente' check (status in ('pendente', 'aprovado', 'rejeitado')),
  requested_at timestamptz not null default now(),
  reviewed_at  timestamptz
);

-- Quem vê cada atleta e com que perfil
create type public.access_role as enum ('encarregado', 'co-encarregado', 'atleta');

create table public.athlete_access (
  member_id  uuid not null references public.accounts (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  role       public.access_role not null,
  primary key (member_id, athlete_id)
);

-- Convites de co-encarregado: link pessoal, de uso único, expira em 7 dias
create table public.guardian_invites (
  token       uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.athletes (id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references public.accounts (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '7 days',
  used_at     timestamptz
);

-- ---------------------------------------------------------------- troféu de almada
create table public.races (
  id             bigint generated always as identity primary key,
  season         text not null,                -- 2025/2026
  round          int  not null,                -- n.º da prova na época
  name           text not null,                -- nome publicado (muda com a edição)
  base_name      text not null,                -- nome comparável entre épocas
  race_date      date not null,
  regulation_url text,
  unique (season, round)
);

create table public.results (
  id            bigint generated always as identity primary key,
  race_id       bigint not null references public.races (id) on delete cascade,
  athlete_id    uuid references public.athletes (id) on delete set null,  -- null = atleta não identificado na BD
  athlete_name  text not null,                 -- como publicado pela organização
  birth_year    int,
  category      text not null,
  place         int,
  bib           text,
  time          text,
  time_s        numeric(10, 2),
  distance_m    int,                           -- distância do regulamento
  trophy_points int,
  team_points   int,
  source_url    text,
  unique (race_id, athlete_name, birth_year)
);
create index results_athlete_idx on public.results (athlete_id);

-- ---------------------------------------------------------------- regras de acesso (RLS)
create function public.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where member_id = auth.uid())
$$;

create function public.can_see_athlete(a uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select is_staff() or exists (select 1 from athlete_access where athlete_id = a and member_id = auth.uid())
$$;

alter table public.accounts         enable row level security;
alter table public.athlete_change_requests enable row level security;
alter table public.staff            enable row level security;
alter table public.athletes         enable row level security;
alter table public.athlete_access   enable row level security;
alter table public.guardian_invites enable row level security;
alter table public.races            enable row level security;
alter table public.results          enable row level security;

create policy "o próprio ou staff" on public.accounts for select using (id = auth.uid() or public.is_staff());
create policy "staff vê staff" on public.staff for select using (public.is_staff());

create policy "atletas visíveis" on public.athletes for select using (public.can_see_athlete(id));
-- Encarregados e o próprio atleta podem corrigir contactos, equipamento, emergência,
-- consentimentos e confirmar a ficha. Os dados de identificação só mudam via
-- athlete_change_requests (validação da secretaria) — garantido pelo trigger abaixo.
create policy "editar dados" on public.athletes for update
  using (public.can_see_athlete(id)) with check (public.can_see_athlete(id));

create function public.protect_identity() returns trigger
  language plpgsql set search_path = public as $$
begin
  -- auth.uid() nulo = service role / SQL editor (importação)
  if auth.uid() is not null and not is_staff() and (new.name, new.birth_date, new.gender, new.id_number, new.tax_number, new.code)
       is distinct from (old.name, old.birth_date, old.gender, old.id_number, old.tax_number, old.code) then
    raise exception 'Dados de identificação só podem ser alterados pela secretaria (usar athlete_change_requests)';
  end if;
  return new;
end $$;
create trigger athletes_protect_identity before update on public.athletes
  for each row execute function public.protect_identity();

create policy "ver pedidos de alteração" on public.athlete_change_requests for select
  using (public.can_see_athlete(athlete_id));
create policy "pedir alteração" on public.athlete_change_requests for insert
  with check (requested_by = auth.uid() and public.can_see_athlete(athlete_id) and status = 'pendente');
create policy "staff valida pedidos" on public.athlete_change_requests for update
  using (public.is_staff()) with check (public.is_staff());

create policy "os meus acessos" on public.athlete_access for select using (member_id = auth.uid() or public.is_staff());

create policy "convites dos meus atletas" on public.guardian_invites for select
  using (invited_by = auth.uid() or public.is_staff());
create policy "convidar co-encarregado" on public.guardian_invites for insert
  with check (
    invited_by = auth.uid()
    and exists (select 1 from public.athlete_access
                where athlete_id = guardian_invites.athlete_id and member_id = auth.uid() and role = 'encarregado')
    -- máximo de 2 co-encarregados por atleta
    and (select count(*) from public.athlete_access
         where athlete_id = guardian_invites.athlete_id and role = 'co-encarregado') < 2
  );

create policy "provas públicas" on public.races for select to authenticated using (true);
create policy "resultados dos meus atletas" on public.results for select
  using (athlete_id is not null and public.can_see_athlete(athlete_id));

-- Escrita de atletas, provas e resultados: só staff (ou importação com a service role key).
create policy "staff escreve atletas"    on public.athletes for insert with check (public.is_staff());
create policy "staff escreve provas"     on public.races    for all using (public.is_staff()) with check (public.is_staff());
create policy "staff escreve resultados" on public.results  for all using (public.is_staff()) with check (public.is_staff());

-- =============================================================================
-- Importação dos CSV gerados por tools/trofeu-almada/consolidate.py --import-dir
--   1) Table Editor → athletes → Import data from CSV  (athletes.csv)
--   2) Importar results.csv para a tabela de passagem abaixo e correr o INSERT.
-- =============================================================================
create table if not exists public.import_results (
  athlete_code text, athlete_name text, birth_year int, season text, round int, race text, race_base text,
  race_date date, category text, place int, bib text, time text, time_s numeric, distance_m int,
  trophy_points int, team_points int, source_url text
);
alter table public.import_results enable row level security; -- sem políticas: só a service role acede

-- Depois de importar results.csv para import_results:
--
-- insert into public.races (season, round, name, base_name, race_date, regulation_url)
-- select distinct on (season, round) season, round, race, race_base, race_date, null
-- from public.import_results order by season, round
-- on conflict (season, round) do nothing;
--
-- insert into public.results (race_id, athlete_id, athlete_name, birth_year, category, place, bib, time, time_s,
--                             distance_m, trophy_points, team_points, source_url)
-- select r.id, a.id, i.athlete_name, i.birth_year, i.category, i.place, i.bib, i.time, i.time_s,
--        i.distance_m, i.trophy_points, i.team_points, i.source_url
-- from public.import_results i
-- join public.races r on r.season = i.season and r.round = i.round
-- left join public.athletes a on a.code = i.athlete_code
-- on conflict (race_id, athlete_name, birth_year) do update
--   set place = excluded.place, time = excluded.time, time_s = excluded.time_s,
--       trophy_points = excluded.trophy_points, team_points = excluded.team_points;
--
-- truncate public.import_results;
