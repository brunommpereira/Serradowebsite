-- Email normalizado para ligar contas a fichas: sem espaços nem maiúsculas e, no Gmail, sem pontos nem «+etiqueta»
-- (o Gmail trata joao.silva@gmail.com, JoaoSilva@gmail.com e joaosilva+site@googlemail.com como a mesma caixa).
create or replace function norm_email(e text) returns text
language sql immutable parallel safe as $$
  select case
           when split_part(x, '@', 2) in ('gmail.com', 'googlemail.com')
             then replace(split_part(split_part(x, '@', 1), '+', 1), '.', '') || '@gmail.com'
           else x
         end
    from (select lower(btrim(coalesce(e, ''), E' \t\r\n')) as x) s
$$;

create index if not exists athletes_norm_email_idx on athletes (norm_email(email)) where email is not null;
create index if not exists members_norm_email_idx on members (norm_email(email)) where email is not null;
