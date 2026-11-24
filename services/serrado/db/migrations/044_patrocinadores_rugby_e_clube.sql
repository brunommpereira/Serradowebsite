-- Mais patrocinadores e parceiros: os do rugby (Proeonn, PUBL Outdoors, The Inventors) e os de todo o clube
-- (Alberto Chaiça, Gabinete de Fisioterapia; Câmara Municipal de Almada). Estes dois ainda sem logótipo: o cartão
-- mostra as iniciais até a Direção carregar a imagem no backoffice (Parceiros → Logótipo).
-- As notícias ficam em rascunho, para publicar no backoffice.

insert into cms_partners (slug, name, category, website, logo_url, description, status, published_at)
values
  ('proeonn', 'Proeonn', 'Patrocinador', null, 'https://www.serradofc.pt/media/parceiros/proeonn.webp',
   'Patrocinador da secção de rugby do Serrado FC.', 'published', now()),
  ('publ-outdoors', 'PUBL Outdoors', 'Patrocinador', 'https://publioutdoors.pt/', 'https://www.serradofc.pt/media/parceiros/publ-outdoors.webp',
   'Patrocinador da secção de rugby do Serrado FC.', 'published', now()),
  ('the-inventors', 'The Inventors', 'Patrocinador', 'https://theinventors.io/', 'https://www.serradofc.pt/media/parceiros/the-inventors.webp',
   'Empresa da Caparica que cria experiências educativas de engenharia, arte e criatividade. Patrocinador da secção de rugby.', 'published', now()),
  ('alberto-chaica-fisioterapia', 'Alberto Chaiça, Gabinete de Fisioterapia', 'Parceiro', 'https://fisioterapia-alberto-chaica.pt/', null,
   'Fisioterapia, osteopatia e pilates clínico na Charneca da Caparica. Parceiro de todo o Serrado FC.', 'published', now()),
  ('camara-municipal-de-almada', 'Câmara Municipal de Almada', 'Parceiro Institucional', 'https://www.cm-almada.pt/', null,
   'Parceiro institucional do Serrado FC, no apoio ao desporto e à comunidade do concelho.', 'published', now())
on conflict (slug) do nothing;

insert into cms_news (slug, title, category, summary, body, author, status)
values
  (
    'obrigado-patrocinadores-do-rugby',
    'Rugby: obrigado à Proeonn, à PUBL Outdoors e à The Inventors',
    'Rugby',
    'A secção de rugby do Serrado FC conta com o apoio da Proeonn, da PUBL Outdoors e da The Inventors. Um agradecimento especial de toda a família do rugby.',
    $body$<p>O rugby do <strong>Serrado FC</strong> não se faz só dentro de campo. Faz-se também com quem acredita no nosso projeto e nos ajuda a crescer. Hoje queremos agradecer aos patrocinadores da secção de rugby:</p>
<ul>
<li><strong>Proeonn</strong></li>
<li><strong>PUBL Outdoors</strong> (<a href="https://publioutdoors.pt/" rel="noopener noreferrer">publioutdoors.pt</a>)</li>
<li><strong>The Inventors</strong>, empresa da Caparica que desde 2016 cria experiências educativas de engenharia, arte e criatividade para escolas, campos de férias e ateliers (<a href="https://theinventors.io/" rel="noopener noreferrer">theinventors.io</a>)</li>
</ul>
<img src="https://www.serradofc.pt/media/parceiros/proeonn.webp" alt="Logótipo Proeonn">
<img src="https://www.serradofc.pt/media/parceiros/publ-outdoors.webp" alt="Logótipo PUBL Outdoors">
<img src="https://www.serradofc.pt/media/parceiros/the-inventors.webp" alt="Logótipo The Inventors">
<h2>Porque este apoio é importante</h2>
<p>Com o vosso apoio, os nossos atletas treinam e competem com melhores condições, e o rugby chega a mais crianças, jovens e adultos de Almada. Obrigado por fazerem parte da nossa equipa! 🏉💙💛</p>$body$,
    'Comunicação Serrado FC',
    'draft'
  ),
  (
    'obrigado-alberto-chaica-fisioterapia',
    'Obrigado, Alberto Chaiça, Gabinete de Fisioterapia',
    'Clube',
    'A Fisioterapia Alberto Chaiça, na Charneca da Caparica (fisioterapia, osteopatia e pilates clínico), é parceira de todo o Serrado FC. Um agradecimento especial dos nossos atletas.',
    $body$<p>No desporto, cuidar do corpo é tão importante como treinar. É por isso que o <strong>Serrado FC</strong> tem muito orgulho na parceria com a <strong>Fisioterapia Alberto Chaiça</strong>, parceira de todo o clube.</p>
<h2>Quem é a Fisioterapia Alberto Chaiça</h2>
<p>Um gabinete na <strong>Charneca da Caparica</strong>, com uma equipa de fisioterapeutas, osteopatas e massagistas, liderada pelo diretor clínico Dr. Paulo Borrego. Os serviços:</p>
<ul>
<li><strong>Fisioterapia</strong>;</li>
<li><strong>Osteopatia</strong>, para várias patologias e todas as idades;</li>
<li><strong>Pilates clínico</strong>, para reabilitação e prevenção de lesões.</li>
</ul>
<h2>Porque este apoio é importante</h2>
<p>Ter um parceiro na área da saúde ajuda os nossos atletas, de todas as modalidades, a prevenir lesões, a recuperar melhor e a voltar mais depressa ao que mais gostam de fazer.</p>
<h2>Contactos</h2>
<ul>
<li><strong>Morada:</strong> Rua das Quintinhas, 31, 2820-514 Charneca da Caparica</li>
<li><strong>Telefone:</strong> 212 976 222 · <strong>Telemóvel:</strong> 914 030 994</li>
<li><strong>Email:</strong> geral@fisioterapia-alberto-chaica.pt</li>
<li><strong>Site:</strong> <a href="https://fisioterapia-alberto-chaica.pt/" rel="noopener noreferrer">fisioterapia-alberto-chaica.pt</a></li>
</ul>
<p>Obrigado, Alberto Chaiça! 💙💛</p>$body$,
    'Comunicação Serrado FC',
    'draft'
  ),
  (
    'obrigado-camara-municipal-de-almada',
    'Obrigado, Câmara Municipal de Almada',
    'Clube',
    'A Câmara Municipal de Almada é parceira institucional do Serrado FC. Um agradecimento pelo apoio ao desporto e à comunidade.',
    $body$<p>O <strong>Serrado FC</strong> agradece à <strong>Câmara Municipal de Almada</strong> o apoio institucional ao clube e ao desporto no concelho.</p>
<h2>Porque este apoio é importante</h2>
<p>Os clubes de bairro são uma parte essencial da vida de Almada: juntam famílias, formam atletas e criam comunidade. O apoio da autarquia ajuda-nos a continuar a fazê-lo, em todas as modalidades.</p>
<p>Obrigado, Câmara Municipal de Almada! 💙💛</p>$body$,
    'Comunicação Serrado FC',
    'draft'
  )
on conflict (slug) do nothing;
