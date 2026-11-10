-- APIs técnicas (antes «API de parceiros»): o pedido passa a dizer o email de quem pede, e cada credencial tem
-- permissões próprias: registar pedidos e/ou decidir como tesoureiro do núcleo (indicando o email de quem decide).
-- A conta associada ao cliente passa a ser só o responsável pela integração (contacto), não quem pede.
alter table api_clients
  add column scopes text[] not null default '{expenses.create}'
    check (scopes <@ array['expenses.create', 'expenses.approve_nucleo']::text[] and cardinality(scopes) > 0);
comment on column api_clients.user_id is 'Responsável pela integração (contacto no clube)';
