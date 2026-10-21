-- Cartaz da abertura da época com «Pagamento no dia, no Fresh Bar» (ficheiros novos: os antigos ficam em cache)
update cms_events
   set body = replace(replace(body, 'cartaz-abertura-epoca-20eur-a4.pdf', 'cartaz-abertura-epoca-pagamento-a4.pdf'),
                      'cartaz-abertura-epoca-20eur.webp', 'cartaz-abertura-epoca-pagamento.webp')
 where slug = 'abertura-da-epoca';
update cms_news
   set body = replace(replace(body, 'cartaz-abertura-epoca-20eur-a4.pdf', 'cartaz-abertura-epoca-pagamento-a4.pdf'),
                      'cartaz-abertura-epoca-20eur.webp', 'cartaz-abertura-epoca-pagamento.webp')
 where slug = 'abertura-da-epoca-no-fresh';
