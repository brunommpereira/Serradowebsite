-- A abertura da época passa de sábado, 7 de novembro, para domingo, 22 de novembro (mesmo horário e local).
-- Cartaz com a nova data em ficheiros novos (os antigos ficam em cache). Só mexe se ainda estiver no dia 7.
update cms_events
   set starts_at = starts_at + interval '15 days',
       summary = replace(summary, 'Sábado, 7 de novembro', 'Domingo, 22 de novembro'),
       body = replace(replace(replace(replace(replace(body,
                'sábado, 7 de novembro', 'domingo, 22 de novembro'),
                'Sábado, 7 de novembro', 'Domingo, 22 de novembro'),
                'cartaz-abertura-epoca-pagamento-a4.pdf', 'cartaz-abertura-epoca-22nov-a4.pdf'),
                'cartaz-abertura-epoca-pagamento.webp', 'cartaz-abertura-epoca-22nov.webp'),
                'cartaz-abertura-epoca-20eur', 'cartaz-abertura-epoca-22nov'),
       updated_at = now()
 where slug = 'abertura-da-epoca'
   and starts_at::date = date '2026-11-07';

update cms_news
   set title = replace(title, 'a 7 de novembro', 'a 22 de novembro'),
       summary = replace(replace(summary, 'No sábado, 7 de novembro', 'No domingo, 22 de novembro'),
                         'sábado, 7 de novembro', 'domingo, 22 de novembro'),
       body = replace(replace(replace(replace(replace(body,
                'sábado, 7 de novembro', 'domingo, 22 de novembro'),
                'Sábado, 7 de novembro', 'Domingo, 22 de novembro'),
                'cartaz-abertura-epoca-pagamento-a4.pdf', 'cartaz-abertura-epoca-22nov-a4.pdf'),
                'cartaz-abertura-epoca-pagamento.webp', 'cartaz-abertura-epoca-22nov.webp'),
                'cartaz-abertura-epoca-20eur', 'cartaz-abertura-epoca-22nov'),
       updated_at = now()
 where slug = 'abertura-da-epoca-no-fresh'
   and (title like '%7 de novembro%' or body like '%7 de novembro%');
