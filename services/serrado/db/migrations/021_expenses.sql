-- Pedidos de gasto com aprovação em 3 passos: quem pede (direção) → tesoureiro do núcleo → tesoureiro
-- da direção (aprovação final, pagamento e registo contabilístico). Ninguém aprova o próprio pedido.

-- Núcleos: as modalidades e a Direção (gastos gerais do clube)
create table expense_approvers (
  nucleo      text not null check (nucleo in ('direcao', 'atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto')),
  user_id     uuid not null references users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (nucleo, user_id)
);

create table expenses (
  id              bigint generated always as identity primary key,
  year            int not null,
  seq             int not null,                    -- n.º do pedido no ano (2026/007)
  nucleo          text not null check (nucleo in ('direcao', 'atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto')),
  category        text not null check (length(category) between 2 and 60),
  title           text not null check (length(title) between 3 and 120),
  purpose         text not null default '' check (length(purpose) <= 2000),
  supplier        text not null check (length(supplier) between 2 and 160),
  supplier_nif    text check (supplier_nif ~ '^[0-9]{9}$'),
  amount          numeric(10, 2) not null check (amount > 0 and amount < 1000000),
  due_date        date,
  payment_info    text not null default '' check (length(payment_info) <= 300),   -- IBAN, referência MB…
  status          text not null default 'pedido'
                  check (status in ('pedido', 'aprovado_nucleo', 'aprovado', 'pago', 'rejeitado', 'anulado')),
  requested_by    uuid not null references users (id),
  requested_at    timestamptz not null default now(),
  -- 2.º passo: tesoureiro do núcleo
  nucleo_by       uuid references users (id),
  nucleo_at       timestamptz,
  nucleo_amount   numeric(10, 2) check (nucleo_amount > 0),
  nucleo_note     text not null default '',
  -- 3.º passo: tesoureiro da direção (aprovação final e pagamento)
  final_by        uuid references users (id),
  final_at        timestamptz,
  final_note      text not null default '',
  paid_by         uuid references users (id),
  paid_on         date,
  paid_amount     numeric(10, 2) check (paid_amount > 0),
  paid_method     text check (paid_method in ('transferencia', 'numerario', 'cartao', 'mbway', 'cheque', 'debito')),
  -- Registo contabilístico
  account_code    text not null default '' check (length(account_code) <= 20),     -- conta SNC (ex.: 62)
  doc_number      text not null default '' check (length(doc_number) <= 60),       -- n.º da fatura do fornecedor
  rejected_by     uuid references users (id),
  rejected_at     timestamptz,
  reject_reason   text not null default '',
  invoice_received_at timestamptz,                  -- fatura/recibo final recebida
  updated_at      timestamptz not null default now(),
  unique (year, seq)
);
create index expenses_status_idx on expenses (status, nucleo);
create index expenses_requested_by_idx on expenses (requested_by);

-- Anexos: fatura/orçamento (pedido), comprovativo (pagamento), fatura/recibo final
create table expense_files (
  id          uuid primary key default gen_random_uuid(),
  expense_id  bigint not null references expenses (id) on delete cascade,
  kind        text not null check (kind in ('fatura', 'comprovativo', 'recibo', 'outro')),
  name        text not null check (length(name) between 1 and 200),
  mime        text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes  int not null check (size_bytes between 1 and 10485760),
  data        bytea not null,
  uploaded_by uuid references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index expense_files_expense_idx on expense_files (expense_id);

-- Histórico de cada pedido (quem fez o quê, quando)
create table expense_events (
  id          bigint generated always as identity primary key,
  expense_id  bigint not null references expenses (id) on delete cascade,
  at          timestamptz not null default now(),
  user_id     uuid references users (id) on delete set null,
  action      text not null,
  note        text not null default ''
);
create index expense_events_expense_idx on expense_events (expense_id);

-- Papéis de origem
insert into roles (key, name, description, builtin) values
  ('direcao', 'Direção', 'Elemento da direção: faz pedidos de gasto', true),
  ('tesoureiro-nucleo', 'Tesoureiro de núcleo', 'Aprova os pedidos de gasto do seu núcleo (definido em Pedidos de gasto → Núcleos)', true),
  ('presidente', 'Presidente', 'Vê todos os pedidos de gasto e recebe a confirmação dos pagamentos', true)
on conflict (key) do nothing;

insert into role_permissions (role, permission) values
  ('direcao', 'expenses.request'),
  ('tesoureiro-nucleo', 'expenses.request'), ('tesoureiro-nucleo', 'expenses.approve'),
  ('presidente', 'expenses.request'), ('presidente', 'expenses.view'),
  ('tesouraria', 'expenses.request'), ('tesouraria', 'expenses.view'), ('tesouraria', 'expenses.pay')
on conflict do nothing;
