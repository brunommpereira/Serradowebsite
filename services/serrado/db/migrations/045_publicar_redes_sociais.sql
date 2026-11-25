-- Publicar no Facebook e no Instagram a partir do backoffice (serrado.social_publish).
-- Cada linha é uma publicação numa rede; «Agora» publica logo, o resto sai à hora marcada
-- (a sincronização com o Facebook, de 15 em 15 minutos, publica as que já chegaram à hora).
create table social_posts (
  id            bigint generated always as identity primary key,
  network       text not null check (network in ('facebook', 'instagram')),
  news_id       bigint references cms_news (id) on delete set null,
  caption       text not null check (length(caption) between 1 and 2200),
  link          text check (link is null or link ~ '^https://'),
  image_url     text check (image_url is null or image_url ~ '^(https://|/)'),
  scheduled_at  timestamptz not null default now(),
  status        text not null default 'scheduled'
                check (status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  attempts      int not null default 0,
  error         text,
  external_id   text,                      -- id da publicação na Meta
  permalink     text,
  created_by    uuid references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  check (network = 'facebook' or image_url is not null)   -- o Instagram exige imagem
);
create index social_posts_due_idx on social_posts (scheduled_at) where status = 'scheduled';
create index social_posts_recent_idx on social_posts (created_at desc);
