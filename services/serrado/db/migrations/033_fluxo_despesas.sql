-- Fluxo de aprovação dos pedidos de gasto configurável por núcleo:
--   nucleo_direcao  tesoureiro do núcleo aprova → tesouraria da direção (aprovação final e pagamento)   [como até aqui]
--   so_nucleo       só o tesoureiro do núcleo aprova → a tesouraria paga
--   so_direcao      sem passo do núcleo: a tesouraria da direção aprova e paga
-- O modo fica gravado em cada pedido ao ser criado: mudar a configuração não altera pedidos em curso.

create table expense_flows (
  nucleo      text primary key check (nucleo in ('direcao', 'atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto')),
  mode        text not null check (mode in ('nucleo_direcao', 'so_nucleo', 'so_direcao')),
  updated_at  timestamptz not null default now()
);

alter table expenses
  add column flow text not null default 'nucleo_direcao' check (flow in ('nucleo_direcao', 'so_nucleo', 'so_direcao'));
