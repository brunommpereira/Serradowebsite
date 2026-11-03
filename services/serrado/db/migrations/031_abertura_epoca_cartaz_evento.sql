-- O evento da abertura da época já tinha sido mudado para 22 de novembro no backoffice, por isso a 030 não lhe
-- tocou: o texto continuava com o cartaz do dia 7. Aqui só se troca o texto do cartaz, seja qual for a data.
update cms_events
   set body = replace(replace(replace(replace(replace(body,
                'sábado, 7 de novembro', 'domingo, 22 de novembro'),
                'Sábado, 7 de novembro', 'Domingo, 22 de novembro'),
                'cartaz-abertura-epoca-pagamento-a4.pdf', 'cartaz-abertura-epoca-22nov-a4.pdf'),
                'cartaz-abertura-epoca-pagamento.webp', 'cartaz-abertura-epoca-22nov.webp'),
                'cartaz-abertura-epoca-20eur', 'cartaz-abertura-epoca-22nov'),
       updated_at = now()
 where slug = 'abertura-da-epoca'
   and (body like '%7 de novembro%' or body like '%cartaz-abertura-epoca-pagamento%' or body like '%cartaz-abertura-epoca-20eur%');
