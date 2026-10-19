-- Notícia «A história do Serrado FC», publicada pela migração (com o texto do quadro da sede e as
-- fotografias do arquivo). Se já existir uma notícia com o mesmo endereço, não faz nada.

with nova as (
  insert into cms_news (slug, title, category, summary, body, cover_url, author, status, published_at)
  values (
    'a-historia-do-serrado-fc',
    'A história do Serrado FC: do Talho do Samuel ao clube multidesportivo',
    'Clube',
    'Fundado a 29 de abril de 1978 no novo bairro da Quinta do Serrado, o clube nasceu da vontade de um grupo de jovens. Recordamos as origens, os fundadores, os primeiros campos e os títulos, com fotografias do nosso arquivo.',
    $body$<p>Há quase meio século, o novo bairro da Quinta do Serrado, na Caparica, recebia cerca de 400 famílias. Com elas chegou uma forte população de jovens à procura de um sítio para jogar, aprender e ocupar os tempos livres. Foi daí que nasceu, a <strong>29 de abril de 1978</strong>, o Serrado Futebol Clube.</p>
<img src="https://www.serradofc.pt/media/historia/emblema-original.webp" alt="O emblema original do Serrado FC, pintado à mão, com a inscrição «Fundado em 29 abril 78»">
<h2>Um homem, um talho e muitos jovens</h2>
<p>À frente do movimento esteve <strong>Samuel Gomes de Andrade</strong>, um homem profundamente imbuído de espírito de servir e de espírito associativo, com largas provas dadas como membro ativo dos Bombeiros Voluntários de Almada. À sua volta juntou-se um grande grupo de jovens, muito jovens, com uma idade média a rondar os 15 anos.</p>
<p>Durante muito tempo, a sede foi o <strong>Talho do Samuel</strong>, como ficou conhecido: era ali que os assuntos se debatiam e as «decisões» se tomavam, de forma informal.</p>
<p>Entre os fundadores, além de Samuel Gomes de Andrade, contam-se Vital Correia dos Santos, Vitor Manuel Rodrigues, Domingos Garcia, Fernando Bento e José António Pinto. Dos mais jovens, recordam-se Manuel Baltazar Neto, José António e Jorge Lima Tavares, Carlos Teixeira, Artur Lopes e Miguel Garcia.</p>
<h2>Inventar uma sede e os campos</h2>
<p>Sem sede própria e sem lugares para a prática do desporto, foi preciso «inventá-los» para que o clube existisse. Em <strong>1979</strong>, a sede passou para uma antiga adega, onde ainda hoje funciona, a título precário: o prédio pertencia ao extinto Fundo de Fomento da Habitação. Os sócios fizeram dela um local pequeno, sem possibilidade de crescer, mas acolhedor.</p>
<p>Para jogar, arranjou-se um campo de terra batida com as dimensões de futebol de salão, onde se jogou futebol e se fez alguma ginástica. Em <strong>1982</strong>, ali nasceu uma vivenda e o campo desapareceu. A rua passou a ser a pista onde muitos jovens fizeram atletismo, sobretudo corridas, até surgir outro campo de terra batida, o célebre <strong>«Campo da Fossa»</strong>, que se tornou o campo «oficial» do Serrado F.C.</p>
<img src="https://www.serradofc.pt/media/historia/primeiras-equipas.webp" alt="Uma das primeiras equipas do Serrado F.C., numa fotografia antiga da sede">
<h2>Estatutos, filiações e o bairro em festa</h2>
<p>Os Estatutos e o Regulamento Interno foram aprovados em Assembleia Geral a <strong>13 de dezembro de 1980</strong> e publicados no <strong>Diário da República n.º 126, de 1 de junho de 1985</strong>. O clube filiou-se na Federação Portuguesa das Colectividades de Cultura e Recreio, na Federação Portuguesa de Futebol de Salão, na Federação Portuguesa de Cicloturismo e Utilizadores de Bicicleta e no INATEL.</p>
<p>Desde o início, o Serrado F.C. foi o animador do bairro e da freguesia da Caparica, com os festejos do aniversário, os Santos Populares e as iniciativas de verão: uma presença viva num bairro que se queria cada vez menos dormitório e mais participativo. O objetivo foi sempre o mesmo: ocupar os tempos livres dos jovens com atividades desportivas, recreativas e de convívio.</p>
<h2>Os títulos</h2>
<ul>
<li><strong>1999/2000</strong>: Campeão Distrital de Futebol de Salão</li>
<li><strong>2001/2002</strong>: Vice-Campeão Nacional de Futebol de Salão</li>
<li><strong>2002/2003</strong>: Campeão Distrital de Futsal Sénior Masculino (A.F. Setúbal)</li>
<li><strong>2025/2026</strong>: Vice-campeão do Troféu de Atletismo de Almada «Mário Pinto Claro»</li>
</ul>
<img src="https://www.serradofc.pt/media/historia/campeoes-futsal-2002-2003.webp" alt="A equipa sénior de futsal do Serrado FC, campeã distrital da A.F. Setúbal em 2002/2003">
<h2>Hoje</h2>
<p>Quase cinquenta anos depois, o Serrado FC é um clube multidesportivo, com atletismo, futsal, rugby (Almada Rugby SFC), formação e Escola de Desporto. Mudaram as modalidades e os campos, mas não aquilo que nos define desde o Talho do Samuel: a comunidade.</p>
<blockquote>Tens fotografias ou histórias dos primeiros anos do clube? Partilha-as connosco na sede ou através da página de contactos: queremos continuar a contar esta história.</blockquote>
<p><a href="https://www.serradofc.pt/clube#historia" rel="noopener noreferrer">Vê o percurso completo do clube</a></p>$body$,
    'https://www.serradofc.pt/media/historia/primeiras-equipas.webp',
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
