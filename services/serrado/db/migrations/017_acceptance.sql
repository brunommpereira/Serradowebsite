-- As propostas passam a ser aceites com uma declaração (caixa «aceito») e confirmadas por email,
-- em vez da assinatura desenhada. As propostas antigas mantêm a assinatura que têm.
alter table registrations
  alter column signature_png drop not null,
  alter column signature_sha256 drop not null,
  add column declaration        text,
  add column confirm_token_hash text unique,
  add column confirm_expires_at timestamptz,
  add column confirmed_at       timestamptz,
  add column confirm_ip         text;
alter table registrations drop constraint registrations_status_check;
alter table registrations
  add constraint registrations_status_check check (status in ('por_confirmar', 'pendente', 'aceite', 'recusada')),
  add constraint registrations_proof_check check (signature_png is not null or declaration is not null);
