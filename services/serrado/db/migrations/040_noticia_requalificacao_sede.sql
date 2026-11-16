-- Notícia: pedido de ajuda para a requalificação da sede do Serrado FC. Se já existir uma notícia com o mesmo endereço, não faz nada.
-- As fotografias do telhado juntam-se depois no backoffice (Notícias).
insert into cms_news (slug, title, category, summary, body, author, status, published_at)
values (
  'requalificacao-da-sede-do-serrado-fc',
  'Precisamos de ti: ajuda-nos a requalificar a sede do Serrado FC',
  'Clube',
  'Depois de anos sem obras, a sede do Serrado FC tem graves problemas de infiltrações e precisa de intervenção. Pedimos a empresas e a todos os que gostam do clube que nos ajudem a requalificá-la.',
  $body$<p>A sede do Serrado FC é a casa de todos nós: dos atletas, dos treinadores, dos sócios e das famílias que, todas as semanas, passam por aqui. Hoje, essa casa precisa de ajuda.</p>
<p>Depois de muitos anos sem qualquer intervenção, o edifício ficou com <strong>graves problemas de infiltrações</strong>, sobretudo no telhado. Se nada for feito, o problema só vai piorar, e o clube corre o risco de perder espaços que usa todos os dias.</p>
<h2>O que precisamos</h2>
<p>O caminho é claro: uma <strong>avaliação técnica</strong> do estado do edifício, a definição da <strong>solução</strong>, a aquisição dos <strong>materiais</strong> e a <strong>execução</strong> da obra. Em cada uma destas fases, a ajuda de quem sabe e de quem pode faz toda a diferença.</p>
<h2>Quem beneficia</h2>
<p>A requalificação serve <strong>376 atletas</strong>, os sócios, as suas famílias e toda a comunidade que se reúne à volta do Serrado FC.</p>
<h2>Como a tua empresa pode ajudar</h2>
<ul>
<li><strong>Financiamento:</strong> um donativo ou patrocínio para a obra</li>
<li><strong>Execução:</strong> mão de obra para os trabalhos de requalificação</li>
<li><strong>Materiais:</strong> fornecimento de materiais de construção e isolamento</li>
<li><strong>Serviços técnicos:</strong> avaliação, projeto e acompanhamento da obra</li>
<li><strong>Condições especiais:</strong> preços e prazos mais favoráveis para o clube</li>
</ul>
<h2>O que oferecemos</h2>
<p>As empresas que nos ajudarem serão <strong>Parceiros Oficiais da Requalificação da Sede</strong>, com comunicação dedicada nas nossas redes e no site, presença da marca e reconhecimento público junto de uma comunidade ativa em Almada e na Costa da Caparica.</p>
<h2>Fala connosco</h2>
<p>Se a tua empresa quer ajudar, ou se conheces quem possa ajudar, contacta a Direção do Serrado FC através da <a href="https://www.serradofc.pt/contactos" rel="noopener noreferrer">página de contactos</a>. Todos os contributos contam. Obrigado!</p>$body$,
  'Comunicação Serrado FC',
  'published',
  now()
)
on conflict (slug) do nothing;
