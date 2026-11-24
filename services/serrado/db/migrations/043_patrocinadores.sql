-- Patrocinadores do clube: logótipo nos parceiros, os patrocinadores publicados
-- (e a parceria com a associação As Rosinhas), com uma notícia para cada um (em rascunho, para publicar no backoffice ao longo da semana).

alter table cms_partners add column if not exists logo_url text;

-- Os lugares de exemplo («Espaço reservado…») saem do site
update cms_partners
   set status = 'archived', updated_at = now()
 where description like 'Espaço reservado%' and status <> 'archived';

insert into cms_partners (slug, name, category, website, logo_url, description, status, published_at)
values
  (
    'oliveira-seguros',
    'Oliveira Seguros',
    'Patrocinador',
    'https://www.osseguros.pt/',
    'https://www.serradofc.pt/media/parceiros/oliveira-seguros.webp',
    'Mediadora de seguros com escritório em Almada e mais de 40 anos de experiência. Soluções para particulares, empresas, clubes e associações.',
    'published',
    now()
  ),
  (
    'electrificadora-central-do-feijo',
    'Electrificadora Central do Feijó',
    'Patrocinador',
    'https://www.ecfeijo.pt/',
    'https://www.serradofc.pt/media/parceiros/electrificadora-central-do-feijo.webp',
    'Empresa de Almada desde 1979: instalações elétricas de média e baixa tensão, automação, domótica e quadros elétricos.',
    'published',
    now()
  ),
  (
    'frsh-coffee-bar',
    'FRSH Coffee Bar',
    'Patrocinador',
    'https://www.facebook.com/freshcoffeebar/',
    'https://www.serradofc.pt/media/parceiros/frsh-coffee-bar.webp',
    'O Fresh, no Parque Urbano de Santo António da Caparica: a casa das nossas corridas, convívios e festas do clube.',
    'published',
    now()
  ),
  (
    'as-rosinhas',
    'As Rosinhas',
    'Parceiro',
    'https://www.asrosinhas.org/',
    'https://www.serradofc.pt/media/parceiros/as-rosinhas.webp',
    'Associação sem fins lucrativos que faz e oferece próteses mamárias artesanais a mulheres mastectomizadas. Uma causa que o Serrado FC tem orgulho em apoiar.',
    'published',
    now()
  )
on conflict (slug) do nothing;

-- Notícias de agradecimento (rascunho: a Direção publica uma por dia no backoffice)
insert into cms_news (slug, title, category, summary, body, cover_url, author, status)
values
  (
    'obrigado-oliveira-seguros',
    'Obrigado, Oliveira Seguros, por apoiar o Serrado FC',
    'Clube',
    'A Oliveira Seguros, mediadora de seguros de Almada com mais de 40 anos de experiência, é patrocinadora do Serrado FC. Um agradecimento especial de todo o clube.',
    $body$<p>É com enorme orgulho que apresentamos a <strong>Oliveira Seguros</strong> como patrocinadora do <strong>Serrado FC</strong>. Em nome de todos os atletas, treinadores, sócios e famílias, deixamos um agradecimento sincero por acreditarem no nosso projeto.</p>
<img src="https://www.serradofc.pt/media/parceiros/oliveira-seguros.webp" alt="Logótipo da Oliveira Seguros">
<h2>Quem é a Oliveira Seguros</h2>
<p>A Oliveira Seguros é uma mediadora de seguros com escritório em <strong>Almada</strong> e também em Setúbal, com <strong>mais de 40 anos de experiência</strong>. Trabalha com particulares e empresas, com soluções à medida: automóvel, casa, saúde, vida, acidentes de trabalho, responsabilidade civil e muito mais, incluindo seguros e protocolos pensados para <strong>clubes, associações e ginásios</strong>.</p>
<p>O lema diz tudo: não fazem apenas seguros, criam confiança e relações sólidas. É exatamente esse espírito que queremos no Serrado FC.</p>
<h2>Porque este apoio é importante</h2>
<p>Cada apoio de uma empresa da nossa terra ajuda a manter as modalidades ativas, a equipar os atletas e a abrir o desporto a mais crianças, jovens e adultos da comunidade.</p>
<h2>Contactos</h2>
<ul>
<li><strong>Morada:</strong> Rua Nuno Álvares Botelho, 14, 2800-172 Almada</li>
<li><strong>Telefone:</strong> 212 760 972</li>
<li><strong>Email:</strong> geral@osseguros.pt</li>
<li><strong>Site:</strong> <a href="https://www.osseguros.pt/" rel="noopener noreferrer">osseguros.pt</a></li>
</ul>
<p>Quando precisares de um seguro, lembra-te de quem apoia o teu clube. Obrigado, Oliveira Seguros! 💙💛</p>$body$,
    'https://www.serradofc.pt/media/parceiros/oliveira-seguros.webp',
    'Comunicação Serrado FC',
    'draft'
  ),
  (
    'obrigado-electrificadora-central-do-feijo',
    'Obrigado, Electrificadora Central do Feijó, por apoiar o Serrado FC',
    'Clube',
    'A Electrificadora Central do Feijó, empresa de Almada desde 1979, é patrocinadora do Serrado FC. Um agradecimento especial de todo o clube.',
    $body$<p>O <strong>Serrado FC</strong> tem o prazer de apresentar a <strong>Electrificadora Central do Feijó</strong> como patrocinadora do clube. Muito obrigado por darem energia ao nosso projeto!</p>
<img src="https://www.serradofc.pt/media/parceiros/electrificadora-central-do-feijo.webp" alt="Logótipo da Electrificadora Central do Feijó: instalações elétricas, média e baixa tensão, automação">
<h2>Quem é a Electrificadora Central do Feijó</h2>
<p>Fundada em <strong>1979</strong>, a Electrificadora Central do Feijó está há <strong>mais de 40 anos em Almada</strong>, com escritório e armazém no Parque Industrial de Vale Flores, no Feijó. Faz o projeto e a execução de:</p>
<ul>
<li>instalações elétricas de <strong>média e baixa tensão</strong>;</li>
<li><strong>automação</strong> de processos industriais e <strong>domótica</strong>;</li>
<li>quadros elétricos, telecomunicações, estudos luminotécnicos e grupos geradores.</li>
</ul>
<p>Uma empresa da nossa terra, com uma equipa especializada e em formação contínua, que cresceu com Almada e continua a apostar na comunidade.</p>
<h2>Porque este apoio é importante</h2>
<p>Com o apoio de empresas locais como a Electrificadora Central do Feijó, o Serrado FC consegue continuar a oferecer desporto a crianças, jovens e adultos, e a crescer com responsabilidade.</p>
<h2>Contactos</h2>
<ul>
<li><strong>Morada:</strong> Rua Piteira Santos, 5E, Parque Industrial Vale Flores, 2810-350 Almada</li>
<li><strong>Telefone:</strong> 212 548 470</li>
<li><strong>Email:</strong> geral@ecfeijo.pt</li>
<li><strong>Site:</strong> <a href="https://www.ecfeijo.pt/" rel="noopener noreferrer">ecfeijo.pt</a></li>
</ul>
<p>Obrigado, Electrificadora Central do Feijó! 💙💛</p>$body$,
    'https://www.serradofc.pt/media/parceiros/electrificadora-central-do-feijo.webp',
    'Comunicação Serrado FC',
    'draft'
  ),
  (
    'obrigado-frsh-coffee-bar',
    'Obrigado, FRSH Coffee Bar, por apoiar o Serrado FC',
    'Clube',
    'O FRSH Coffee Bar, a nossa casa no Parque Urbano de Santo António da Caparica, é patrocinador do Serrado FC. Obrigado por receberem as nossas corridas, convívios e festas.',
    $body$<p>Há parceiros que se tornam casa. O <strong>FRSH Coffee Bar</strong> é patrocinador do <strong>Serrado FC</strong> e queremos agradecer-lhes publicamente por tudo o que têm feito pelo clube.</p>
<img src="https://www.serradofc.pt/media/parceiros/frsh-coffee-bar.webp" alt="Logótipo FRSH, Est. 2025">
<h2>Quem é o FRSH Coffee Bar</h2>
<p>O Fresh fica no <strong>Parque Urbano de Santo António da Caparica</strong>, na Alameda Cidade da Costa da Caparica. É um espaço descontraído, cheio de famílias, desportistas e grupos de amigos, onde se junta boa música, bom ambiente e convívio sem pressas. É também o ponto de partida dos nossos treinos e corridas e o lugar onde a família Serrado se encontra.</p>
<h2>O que já fizemos juntos</h2>
<ul>
<li>O <strong>Jantar de Natal</strong> do clube, no Fresh;</li>
<li>A <strong>abertura da época</strong>, com corrida/caminhada e festa de convívio no Fresh;</li>
<li>Os encontros de atletas, sócios e famílias depois dos treinos e das provas.</li>
</ul>
<h2>Porque este apoio é importante</h2>
<p>Ter um espaço onde atletas de todas as modalidades se juntam faz do Serrado FC mais do que um clube: faz dele uma comunidade. Passa pelo Fresh, de terça a domingo, e diz que vens da parte do Serrado! 💙💛</p>
<p><a href="https://www.facebook.com/freshcoffeebar/" rel="noopener noreferrer">FRSH Coffee Bar no Facebook</a></p>$body$,
    'https://www.serradofc.pt/media/parceiros/frsh-coffee-bar.webp',
    'Comunicação Serrado FC',
    'draft'
  ),
  (
    'parceria-serrado-fc-as-rosinhas',
    'Serrado FC e As Rosinhas: uma parceria com coração',
    'Clube',
    'O Serrado FC é parceiro da associação As Rosinhas, que faz e oferece próteses mamárias artesanais a mulheres mastectomizadas. Conhece a causa e descobre como ajudar.',
    $body$<p>O desporto é saúde, comunidade e solidariedade. É por isso que o <strong>Serrado FC</strong> tem muito orgulho em anunciar a parceria com a associação <strong>As Rosinhas</strong>.</p>
<img src="https://www.serradofc.pt/media/parceiros/as-rosinhas.webp" alt="Logótipo da associação As Rosinhas">
<h2>Quem são As Rosinhas</h2>
<p>As Rosinhas nasceram no final de <strong>2020</strong>, como um projeto familiar e <strong>sem fins lucrativos</strong>, apoiado por voluntários. Fazem à mão <strong>próteses mamárias artesanais</strong>, confortáveis, discretas e adaptáveis, e oferecem-nas às <strong>mulheres mastectomizadas</strong> que as procuram. A missão é simples e enorme: devolver autoestima e qualidade de vida.</p>
<h2>Como podes ajudar</h2>
<ul>
<li><strong>Torna-te sócio(a)</strong> d'As Rosinhas: a quota anual ajuda a enviar mais Rosinhas, de forma gratuita;</li>
<li><strong>Faz um donativo</strong> ou apoia a campanha de angariação de fundos;</li>
<li><strong>Compra merchandising</strong> solidário (t-shirts, camisolas, bonés e mais);</li>
<li><strong>Partilha</strong> esta causa com quem possa precisar.</li>
</ul>
<p>Sabe mais em <a href="https://www.asrosinhas.org/" rel="noopener noreferrer">asrosinhas.org</a> ou pelo email info@asrosinhas.org.</p>
<p>Juntos somos mais fortes. Obrigado, As Rosinhas, por tudo o que fazem! 💙💛🌹</p>$body$,
    'https://www.serradofc.pt/media/parceiros/as-rosinhas.webp',
    'Comunicação Serrado FC',
    'draft'
  )
on conflict (slug) do nothing;
