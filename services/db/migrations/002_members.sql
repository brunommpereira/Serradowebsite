-- Sócios: perfil opcional de um utilizador.
create table members (
  member_number text primary key,
  user_id       uuid unique references users (id) on delete set null,
  category      text not null,                 -- Efetivo, Familiar, Jovem, …
  status        text not null default 'Ativo' check (status in ('Ativo', 'Pendente', 'Suspenso')),
  joined_on     date not null default current_date
);

create table quotas (
  id             bigint generated always as identity primary key,
  member_number  text not null references members (member_number) on delete cascade,
  period         text not null,                -- «Outubro 2026»
  amount         numeric(8, 2) not null,
  due_date       date not null,
  paid_at        date,
  payment_method text,
  receipt_number text unique,
  unique (member_number, period)
);
