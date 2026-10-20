-- Notícia do evento de abertura da época no Fresh (7 de novembro de 2026), publicada pela migração.
-- Se já existir uma notícia com o mesmo endereço, não faz nada.

with nova as (
  insert into cms_news (slug, title, category, summary, body, cover_url, author, status, published_at)
  values (
    'abertura-da-epoca-no-fresh',
    'Abertura da época: treino, corrida e churrasco no Fresh a 7 de novembro',
    'Eventos',
    'No sábado, 7 de novembro, damos início à época do Serrado FC com todas as modalidades: treino e corridas às 10h30 e, a partir das 12h, churrasco com bebidas incluídas no Fresh Bar.',
    $body$<p>Está na hora de arrancar a nova época! No <strong>sábado, 7 de novembro</strong>, o Serrado FC junta atletas, sócios, famílias e amigos de <strong>todas as modalidades</strong> (atletismo, futsal e rugby) para um dia de desporto e convívio no <strong>Fresh</strong>, em parceria com a FRSH The Run Club.</p>
<img src="https://www.serradofc.pt/media/eventos/fresh-abertura-epoca.webp" alt="Logótipo FRSH The Run Club, Est. 2025">
<h2>Programa</h2>
<ul>
<li><strong>10h30</strong>: treino e corridas para todos, ao ritmo de cada um</li>
<li><strong>12h00</strong>: churrasco com bebidas incluídas no <strong>Fresh Bar</strong></li>
</ul>
<h2>Quem pode vir</h2>
<p>Atletas, treinadores, sócios, famílias e amigos do clube. Não é preciso ser corredor: o treino é aberto a todos os níveis e quem preferir pode juntar-se só para o almoço.</p>
<p>Traz roupa e calçado confortáveis para o treino e muita vontade de começar bem a época. Vemo-nos no Fresh!</p>
<img src="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca.webp" alt="Cartaz da abertura da época do Serrado FC: sábado, 7 de novembro, no Fresh Bar. 10h30 treino e corridas, 12h00 churrasco com bebidas incluídas">
<p><a href="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-a4.pdf" rel="noopener noreferrer">Descarrega o cartaz em A4 para imprimir (PDF)</a></p>
<blockquote>Mais informações junto dos treinadores e da direção, ou através da página de contactos.</blockquote>$body$,
    'https://www.serradofc.pt/media/eventos/fresh-abertura-epoca.webp',
    'Comunicação Serrado FC',
    'published',
    now()
  )
  on conflict (slug) do nothing
  returning id, slug, title
),
marca as (
  insert into push_sent (key) select 'cms:news:' || id from nova on conflict do nothing returning key
)
-- Notificação a quem segue «Notícias» na app (como numa publicação feita no backoffice)
insert into push_outbox (subscription_id, payload)
select s.id, jsonb_build_object('notification', jsonb_build_object(
         'title', 'Notícia · Serrado FC',
         'body', n.title,
         'icon', '/brand/icon-192.png',
         'badge', '/brand/badge-96.png',
         'lang', 'pt-PT',
         'tag', 'news-' || n.id,
         'renotify', true,
         'data', jsonb_build_object('url', '/noticias/' || n.slug,
           'onActionClick', jsonb_build_object('default', jsonb_build_object('operation', 'navigateLastFocusedOrOpen', 'url', '/noticias/' || n.slug)))))
  from nova n cross join push_subscriptions s
 where 'noticias' = any(s.topics);
