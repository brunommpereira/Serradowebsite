-- Papéis e permissões configuráveis no backoffice, emails (fila) e reposição de password.

create table roles (
  key         text primary key check (key ~ '^[a-z][a-z0-9-]{1,30}$'),
  name        text not null check (length(name) between 2 and 60),
  description text not null default '',
  builtin     boolean not null default false,   -- os de origem não se apagam (admin tem sempre tudo)
  created_at  timestamptz not null default now()
);

create table role_permissions (
  role        text not null references roles (key) on delete cascade,
  permission  text not null check (permission ~ '^[a-z]+\.[a-z]+$'),
  primary key (role, permission)
);

insert into roles (key, name, description, builtin) values
  ('admin', 'Administração', 'Acesso total, incluindo utilizadores, papéis e permissões', true),
  ('secretaria', 'Secretaria', 'Sócios, atletas, validações, resultados e registos', true),
  ('tesouraria', 'Tesouraria', 'Quotas, mensalidades, pagamentos e recibos', true),
  ('editor', 'Comunicação', 'Conteúdos do site e imagens', true),
  ('treinador', 'Treinador', 'Consulta dos atletas, sem dados sensíveis', true);

insert into role_permissions (role, permission) values
  ('secretaria', 'athletes.view'), ('secretaria', 'athletes.sensitive'), ('secretaria', 'athletes.manage'),
  ('secretaria', 'members.view'), ('secretaria', 'members.manage'), ('secretaria', 'payments.view'),
  ('secretaria', 'results.import'), ('secretaria', 'registrations.manage'),
  ('tesouraria', 'members.view'), ('tesouraria', 'payments.view'), ('tesouraria', 'payments.manage'),
  ('editor', 'cms.edit'),
  ('treinador', 'athletes.view');

-- Os papéis dos utilizadores passam a ser os da tabela roles (deixa de haver lista fixa)
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles add constraint user_roles_role_fkey foreign key (role) references roles (key) on delete cascade;

-- Sessões abertas antes desta data deixam de valer (password reposta ou alterada)
alter table users add column password_changed_at timestamptz;

-- Ligações de uso único enviadas por email: repor a password ou definir a primeira (convite)
create table password_tokens (
  token_hash  text primary key,                   -- sha256 do token (o token em si só vai no email)
  user_id     uuid not null references users (id) on delete cascade,
  purpose     text not null check (purpose in ('reset', 'invite')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index password_tokens_user_idx on password_tokens (user_id);

-- Emails a enviar (Brevo), com novas tentativas
create table email_outbox (
  id           bigint generated always as identity primary key,
  to_email     text not null,
  to_name      text not null default '',
  subject      text not null,
  html         text not null,
  attachments  jsonb not null default '[]',      -- [{name, content (base64)}]
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts     int not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  tried_at     timestamptz,
  sent_at      timestamptz
);
create index email_outbox_todo_idx on email_outbox (created_at) where status <> 'sent';
