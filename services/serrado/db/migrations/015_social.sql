-- Reels e histórias da página de Facebook do clube (serrado.facebook), mostrados no site.
-- Guarda-se só a miniatura (em cms_media); o vídeo continua no Facebook e só carrega quando
-- o visitante carrega em «ver». As histórias desaparecem do site 24 horas depois de publicadas.
create table social_items (
  id                bigint generated always as identity primary key,
  source            text not null default 'facebook' check (source ~ '^[a-z0-9-]{1,32}$'),
  kind              text not null check (kind in ('reel', 'story')),
  external_id       text not null check (length(external_id) between 1 and 200),
  caption           text not null default '' check (length(caption) <= 2000),
  permalink         text check (permalink ~ '^https://'),
  media_type        text not null default 'video' check (media_type in ('photo', 'video')),
  thumb_url         text,
  thumb_media_id    bigint references cms_media (id) on delete set null,
  duration_seconds  numeric(8, 2),
  posted_at         timestamptz not null,
  expires_at        timestamptz,
  hidden            boolean not null default false,
  remote_updated_at text,
  updated_by        uuid references users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source, external_id)
);
create index social_items_visible_idx on social_items (kind, posted_at desc) where not hidden;
