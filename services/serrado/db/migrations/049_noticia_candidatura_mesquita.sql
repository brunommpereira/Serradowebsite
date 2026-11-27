-- Notícia: candidatura do Mesquita à presidência do Serrado FC (eleições em janeiro de 2027).
-- Fica em rascunho: a Direção revê o texto, acrescenta a data, a lista e o programa, e publica no backoffice.
insert into cms_news (slug, title, category, summary, body, cover_url, author, status)
values (
  'mesquita-candidato-a-presidente-do-serrado-fc',
  'Mesquita é candidato a Presidente do Serrado FC',
  'Clube',
  'Mesquita apresenta a candidatura à presidência do Serrado FC nas eleições de janeiro de 2027.',
  $body$<p><strong>Mesquita</strong> é candidato a <strong>Presidente do Serrado FC</strong> nas eleições para os órgãos sociais do clube, que se realizam em <strong>janeiro de 2027</strong>.</p>
<img src="https://www.serradofc.pt/media/eleicoes/mesquita-a-presidente.webp" alt="Cartaz: Mesquita a Presidente do Serrado FC">
<h2>Eleições em janeiro de 2027</h2>
<p>A data, a hora e o local da Assembleia Geral eleitoral vão ser anunciados pela Mesa da Assembleia Geral. Fica atento ao site e aos grupos do clube.</p>
<h2>Lista e programa</h2>
<p>A lista completa e as principais ideias da candidatura vão ser apresentadas em breve, aqui no site.</p>
<p>#MesquitaAPresidente 💙💛</p>$body$,
  'https://www.serradofc.pt/media/eleicoes/mesquita-a-presidente.webp',
  'Comunicação Serrado FC',
  'draft'
)
on conflict (slug) do nothing;
