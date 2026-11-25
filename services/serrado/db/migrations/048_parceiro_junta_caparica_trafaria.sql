-- Parceiro institucional: União das Freguesias de Caparica e Trafaria (a junta de freguesia do clube).
-- Sem logótipo por agora: o cartão mostra as iniciais até a Direção o carregar no backoffice
-- (Parceiros → Logótipo). A notícia fica em rascunho.

insert into cms_partners (slug, name, category, website, description, status, published_at)
values ('junta-freguesia-caparica-trafaria', 'Junta de Freguesia da Caparica e Trafaria', 'Parceiro Institucional', null,
        'União das Freguesias de Caparica e Trafaria: parceiro institucional do Serrado FC, no apoio ao desporto e à comunidade da freguesia.',
        'published', now())
on conflict (slug) do nothing;

insert into cms_news (slug, title, category, summary, body, author, status)
values (
  'obrigado-junta-freguesia-caparica-trafaria',
  'Obrigado, Junta de Freguesia da Caparica e Trafaria',
  'Clube',
  'A União das Freguesias de Caparica e Trafaria é parceira institucional do Serrado FC. Um agradecimento pelo apoio ao clube e ao desporto na freguesia.',
  $body$<p>O <strong>Serrado FC</strong> agradece à <strong>Junta de Freguesia da Caparica e Trafaria</strong> (União das Freguesias de Caparica e Trafaria) o apoio institucional ao clube.</p>
<h2>Porque este apoio é importante</h2>
<p>É na freguesia que o Serrado FC nasce e cresce: é aqui que treinamos, que juntamos famílias e que formamos atletas de todas as idades. Ter a Junta ao nosso lado ajuda-nos a continuar a levar o desporto a mais pessoas da Caparica e da Trafaria, em todas as modalidades.</p>
<p>Obrigado, Junta de Freguesia da Caparica e Trafaria! 💙💛</p>$body$,
  'Comunicação Serrado FC',
  'draft'
)
on conflict (slug) do nothing;
