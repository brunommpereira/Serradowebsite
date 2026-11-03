-- Jantar de Natal do clube: sábado, 7 de novembro de 2026, às 20h00, no Fresh Bar. Gratuito, com inscrição no site.
-- Evento + notícia (com notificação a quem segue «Notícias» na app). Se já existirem, não faz nada.
insert into cms_events (slug, title, kind, summary, body, cover_url, starts_at, location, capacity, price,
                        registration_required, ask_shirt_size, payment_info, status, published_at)
values (
  'jantar-de-natal',
  'Jantar de Natal do Serrado FC',
  'Convívio',
  'Sábado, 7 de novembro, às 20h00, no Fresh Bar. Gratuito, com inscrição obrigatória no site para sabermos quantos somos à mesa.',
  $body$<p>O Serrado FC junta atletas, treinadores, sócios, famílias e amigos de <strong>todas as modalidades</strong> (atletismo, futsal e rugby) para o <strong>Jantar de Natal</strong> do clube.</p>
<ul>
<li><strong>Quando:</strong> sábado, 7 de novembro, às 20h00</li>
<li><strong>Onde:</strong> Fresh Bar</li>
<li><strong>Preço:</strong> gratuito</li>
</ul>
<p>A <strong>inscrição é obrigatória</strong>, para sabermos quantos somos à mesa. Podes inscrever a família toda de uma vez, aqui em baixo.</p>
<img src="https://www.serradofc.pt/media/eventos/cartaz-jantar-natal.webp" alt="Cartaz do Jantar de Natal do Serrado FC: sábado, 7 de novembro, às 20h00, no Fresh Bar. Grátis, com inscrição obrigatória em serradofc.pt/eventos/jantar-de-natal">
<p><a href="https://www.serradofc.pt/media/eventos/cartaz-jantar-natal-a4.pdf" rel="noopener noreferrer">Descarrega o cartaz em A4 para imprimir (PDF)</a></p>$body$,
  'https://www.serradofc.pt/media/eventos/cartaz-jantar-natal.webp',
  '2026-11-07 20:00',
  'Fresh Bar',
  0,
  0,
  true,
  false,
  '',
  'published',
  now()
)
on conflict (slug) do nothing;

with nova as (
  insert into cms_news (slug, title, category, summary, body, cover_url, author, status, published_at)
  values (
    'jantar-de-natal-2026',
    'Jantar de Natal do Serrado FC a 7 de novembro, no Fresh Bar',
    'Eventos',
    'Sábado, 7 de novembro, às 20h00, juntamos a família Serrado no Fresh Bar para o Jantar de Natal. É gratuito, mas a inscrição no site é obrigatória.',
    $body$<p>Este ano o Natal do Serrado FC chega mais cedo! No <strong>sábado, 7 de novembro, às 20h00</strong>, juntamos atletas, treinadores, sócios, famílias e amigos de <strong>todas as modalidades</strong> no <strong>Fresh Bar</strong> para o Jantar de Natal do clube.</p>
<h2>Gratuito, com inscrição</h2>
<p>O jantar é <strong>gratuito</strong>. A inscrição é obrigatória, para sabermos quantos somos à mesa: <a href="https://www.serradofc.pt/eventos/jantar-de-natal#inscricao">inscreve-te aqui</a>. Podes inscrever a família toda de uma vez.</p>
<img src="https://www.serradofc.pt/media/eventos/cartaz-jantar-natal.webp" alt="Cartaz do Jantar de Natal do Serrado FC: sábado, 7 de novembro, às 20h00, no Fresh Bar. Grátis, com inscrição obrigatória em serradofc.pt/eventos/jantar-de-natal">
<p><a href="https://www.serradofc.pt/media/eventos/cartaz-jantar-natal-a4.pdf" rel="noopener noreferrer">Descarrega o cartaz em A4 para imprimir (PDF)</a></p>
<blockquote>Mais informações junto dos treinadores e da direção, ou através da página de contactos.</blockquote>$body$,
    'https://www.serradofc.pt/media/eventos/cartaz-jantar-natal.webp',
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
