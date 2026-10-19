-- Notificações push (app instalável / PWA): subscrições dos browsers, fila de envio e chaves VAPID.

-- Chaves VAPID do servidor (criadas no primeiro uso; a pública vai para o browser)
create table push_keys (
  id           smallint primary key default 1 check (id = 1),
  private_pem  text not null,
  public_key   text not null,                       -- base64url, ponto não comprimido (65 bytes)
  created_at   timestamptz not null default now()
);

-- Uma por browser/dispositivo. Os temas públicos não precisam de conta; os pessoais ficam ligados à conta.
create table push_subscriptions (
  id           bigint generated always as identity primary key,
  endpoint     text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh       text not null check (length(p256dh) between 80 and 100),
  auth         text not null check (length(auth) between 16 and 30),
  user_id      uuid references users (id) on delete set null,
  topics       text[] not null default '{}',        -- noticias, eventos, jogos, pagamentos, gastos
  sports       text[] not null default '{}',        -- jogos só destas modalidades (vazio = todas)
  user_agent   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_ok_at   timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id) where user_id is not null;
create index push_subscriptions_topics_idx on push_subscriptions using gin (topics);

-- Fila: uma linha por notificação e dispositivo (apagada depois de entregue)
create table push_outbox (
  id               bigint generated always as identity primary key,
  subscription_id  bigint not null references push_subscriptions (id) on delete cascade,
  payload          jsonb not null,
  urgency          text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  created_at       timestamptz not null default now(),
  next_at          timestamptz not null default now(),
  attempts         int not null default 0,
  error            text
);
create index push_outbox_next_idx on push_outbox (next_at) where attempts < 6;

-- O que já foi avisado (ex.: lembrete de um jogo, resultado), para não repetir
create table push_sent (
  key   text primary key,
  at    timestamptz not null default now()
);
