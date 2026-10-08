-- Pagamentos online (Stripe) de quotas de sócio e mensalidades das escolas, com fatura-recibo no Moloni ON.

-- Valor mensal por modalidade (definido pela secretaria no backoffice)
create table fee_plans (
  sport_slug  text primary key check (sport_slug ~ '^[a-z0-9-]{1,40}$'),
  amount      numeric(8, 2) not null check (amount > 0 and amount < 1000),
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Mensalidades das escolas: uma por atleta, modalidade e mês
create table athlete_fees (
  id             bigint generated always as identity primary key,
  athlete_id     uuid not null references athletes (id) on delete cascade,
  sport_slug     text not null,
  month          date not null check (extract(day from month) = 1),   -- 1.º dia do mês
  period         text not null,                                         -- «Novembro 2026»
  amount         numeric(8, 2) not null check (amount > 0),
  due_date       date not null,
  paid_at        date,
  payment_method text,
  receipt_number text,
  unique (athlete_id, sport_slug, month)
);
create index athlete_fees_pending_idx on athlete_fees (athlete_id) where paid_at is null;

-- Uma fatura-recibo pode cobrir várias quotas do mesmo pagamento
alter table quotas drop constraint if exists quotas_receipt_number_key;

-- Um pagamento (sessão do Stripe Checkout) e o recibo emitido no Moloni ON
create table payments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references users (id) on delete set null,
  amount                numeric(8, 2) not null check (amount > 0),
  status                text not null default 'open' check (status in ('open', 'paid', 'failed', 'expired')),
  payer_name            text not null,
  payer_email           text not null,
  payer_nif             text not null check (payer_nif ~ '^\d{9}$'),
  stripe_session_id     text unique,
  stripe_payment_intent text,
  method                text,                         -- card, mb_way, multibanco (do Stripe)
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  -- Recibo (Moloni ON): cada passo fica registado para nunca emitir duas vezes
  receipt_status        text not null default 'none' check (receipt_status in ('none', 'pending', 'issued', 'failed')),
  receipt_attempts      int not null default 0,
  receipt_tried_at      timestamptz,
  receipt_error         text,
  moloni_customer_id    int,
  moloni_document_id    int,
  receipt_number        text,
  receipt_emailed_at    timestamptz,
  receipt_pdf           bytea
);
create index payments_user_idx on payments (user_id, created_at desc);
create index payments_receipts_todo_idx on payments (receipt_status) where receipt_status in ('pending', 'failed');

create table payment_items (
  payment_id  uuid not null references payments (id) on delete cascade,
  kind        text not null check (kind in ('quota', 'fee')),
  item_id     bigint not null,
  amount      numeric(8, 2) not null check (amount > 0),
  description text not null,
  sport_slug  text,                                 -- mensalidades: escolhe o artigo no Moloni
  primary key (payment_id, kind, item_id)
);
create index payment_items_item_idx on payment_items (kind, item_id);
