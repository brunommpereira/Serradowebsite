-- Os registos online passam a ser propostas: a secretaria aceita (cria o sócio ou o atleta) ou recusa.
-- Os registos anteriores já tinham criado o sócio/atleta: ficam como aceites.
alter table registrations
  add column status          text not null default 'aceite' check (status in ('pendente', 'aceite', 'recusada')),
  add column proposer_number text,          -- sócio proponente (Regulamento Interno, art.º 9.º), opcional
  add column reviewed_by     uuid references users (id) on delete set null,
  add column reviewed_at     timestamptz,
  add column review_note     text not null default '' check (length(review_note) <= 2000);
alter table registrations alter column status set default 'pendente';
create index registrations_status_idx on registrations (status, signed_at desc);
