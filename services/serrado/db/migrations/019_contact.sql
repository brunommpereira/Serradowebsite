-- Mensagens do formulário de contacto do site (o aviso vai por email para o clube).
create table contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null,
  email       text not null,
  subject     text not null,
  message     text not null,
  consent_at  timestamptz not null,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index contact_messages_created_idx on contact_messages (created_at desc);
