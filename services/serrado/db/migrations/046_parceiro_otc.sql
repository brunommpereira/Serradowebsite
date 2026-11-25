-- Parceiro do atletismo: OTC – Outdoor Training Camp, que corre connosco no Troféu de Almada
-- (equipa «Serrado FC | Outdoor Training Camp»). Sem logótipo por agora: o cartão mostra as iniciais
-- até a Direção o carregar no backoffice (Parceiros → Logótipo). A notícia fica em rascunho.

insert into cms_partners (slug, name, category, website, description, status, published_at)
values ('otc-outdoor-training-camp', 'OTC – Outdoor Training Camp', 'Parceiro', null,
        'Treino funcional ao ar livre no Parque Urbano da Costa da Caparica. Parceiro do atletismo: corremos juntos no Troféu de Almada.',
        'published', now())
on conflict (slug) do nothing;

insert into cms_news (slug, title, category, summary, body, author, status)
values (
  'obrigado-otc-outdoor-training-camp',
  'Atletismo: obrigado, OTC – Outdoor Training Camp',
  'Atletismo',
  'O OTC – Outdoor Training Camp é parceiro do atletismo do Serrado FC. Juntos formamos a equipa Serrado FC | Outdoor Training Camp no Troféu de Almada.',
  $body$<p>No atletismo, o <strong>Serrado FC</strong> não corre sozinho. Com o <strong>OTC – Outdoor Training Camp</strong> formamos a equipa <strong>Serrado FC | Outdoor Training Camp</strong>, que representa as duas casas nas provas do <strong>Troféu de Almada</strong>.</p>
<h2>Quem é o OTC – Outdoor Training Camp</h2>
<p>O OTC faz <strong>treino funcional ao ar livre</strong>, com corrida, exercícios com material e atividades desportivas, no <strong>Parque Urbano da Costa da Caparica</strong>. Um projeto de Almada que leva o exercício para fora do ginásio, para quem quer ganhar forma e bem-estar em grupo.</p>
<h2>Juntos no Troféu de Almada</h2>
<p>Lado a lado nas provas do Troféu, os atletas do Serrado FC e do OTC somam pontos para a mesma equipa. Já conquistámos o <strong>2.º lugar coletivo</strong> na primeira prova da época. E isto é só o começo!</p>
<p>Obrigado, OTC, por correrem connosco! 🏃‍♀️💙💛</p>$body$,
  'Comunicação Serrado FC',
  'draft'
)
on conflict (slug) do nothing;
