-- Preço para crianças (até 14 anos) nos eventos com inscrição, e quantas crianças vão em cada inscrição.
-- O valor da inscrição passa a ser: adultos × preço (ou preço de sócio) + crianças × preço das crianças.
alter table cms_events add column child_price numeric(8, 2);
alter table event_registrations add column children int not null default 0 check (children >= 0 and children <= people);

-- Abertura da época: 7 € por criança até 14 anos (20 € os restantes), com o cartaz novo
update cms_events
   set child_price = 7,
       summary = replace(summary, '20 € por pessoa, tudo incluído', '20 € por pessoa (7 € as crianças até 14 anos), tudo incluído'),
       body = replace(replace(replace(body,
                '<strong>20 € por pessoa, tudo incluído</strong>', '<strong>20 € por pessoa, tudo incluído</strong> (<strong>7 € as crianças até 14 anos</strong>)'),
                'cartaz-abertura-epoca-22nov-a4.pdf', 'cartaz-abertura-epoca-22nov-criancas-a4.pdf'),
                'cartaz-abertura-epoca-22nov.webp', 'cartaz-abertura-epoca-22nov-criancas.webp'),
       updated_at = now()
 where slug = 'abertura-da-epoca' and child_price is null;

update cms_news
   set summary = replace(summary, '20 € por pessoa, tudo incluído', '20 € por pessoa (7 € as crianças até 14 anos), tudo incluído'),
       body = replace(replace(replace(body,
                '<strong>20 € por pessoa, tudo incluído</strong>', '<strong>20 € por pessoa, tudo incluído</strong> (<strong>7 € as crianças até 14 anos</strong>)'),
                'cartaz-abertura-epoca-22nov-a4.pdf', 'cartaz-abertura-epoca-22nov-criancas-a4.pdf'),
                'cartaz-abertura-epoca-22nov.webp', 'cartaz-abertura-epoca-22nov-criancas.webp'),
       updated_at = now()
 where slug = 'abertura-da-epoca-no-fresh' and body not like '%7 € as crianças%';
