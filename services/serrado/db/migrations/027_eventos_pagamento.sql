-- Eventos: como se paga a inscrição (aparece na página do evento e no email de confirmação)
alter table cms_events add column payment_info text not null default '';

update cms_events set payment_info = 'O pagamento faz-se no dia, no Fresh.' where slug = 'abertura-da-epoca' and payment_info = '';

-- O texto do evento e da notícia passa a dizer como se paga
update cms_events
   set body = replace(body, 'tudo incluído</strong> (treino, churrasco e bebidas).', 'tudo incluído</strong> (treino, churrasco e bebidas), pago no dia, no Fresh.')
 where slug = 'abertura-da-epoca';
update cms_news
   set body = replace(body, '<p><strong>20 € por pessoa, tudo incluído</strong>: treino, churrasco e bebidas.</p>',
                      '<p><strong>20 € por pessoa, tudo incluído</strong>: treino, churrasco e bebidas. O pagamento faz-se no dia, no Fresh.</p>')
 where slug = 'abertura-da-epoca-no-fresh';
