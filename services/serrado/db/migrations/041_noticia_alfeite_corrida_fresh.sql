-- Notícia: a equipa não foi inscrita na prova do Alfeite; convite para a corrida/caminhada e festa no Fresh (22 de novembro).
-- Se já existir uma notícia com o mesmo endereço, não faz nada.
insert into cms_news (slug, title, category, summary, body, author, status, published_at)
values (
  'abertura-da-epoca-corrida-e-festa-no-fresh',
  'Abertura da época: vamos correr juntos no dia 22, no Fresh',
  'Clube',
  'Fomos impedidos de inscrever a equipa na próxima prova do Troféu de Almada, no Alfeite. Para compensar, convidamos todos para uma corrida/caminhada de 6 a 7 km e uma festa de convívio no Fresh, a 22 de novembro.',
  $body$<p>Por motivos alheios ao Clube, fomos impedidos de inscrever a equipa <strong>Serrado FC | Outdoor Training Camp</strong> na próxima prova do Troféu de Almada, que se realiza no Alfeite. Tentámos tudo para que a situação fosse resolvida, mas infelizmente não foi possível. Esta situação aconteceu também com outros clubes com um elevado número de participantes.</p>
<p>Pedimos imensas desculpas a todos os atletas pelo transtorno.</p>
<h2>E agora, uma proposta</h2>
<p>Para compensar, convidamos todos os atletas, sócios, famílias e amigos para a abertura da época, no <strong>domingo, 22 de novembro</strong>:</p>
<ul>
<li><strong>10h30:</strong> corridinha ou caminhada de 6 a 7 km, em frente ao Fresh, ao ritmo de cada um</li>
<li><strong>A seguir:</strong> festa de convívio no Fresh, com churrasco e bebida incluídos</li>
</ul>
<p>Vamos festejar o início de época em grande. <a href="https://www.serradofc.pt/eventos/abertura-da-epoca#inscricao" rel="noopener noreferrer">Inscreve-te na página do evento</a> e conta com o Serrado FC! 💙💛</p>$body$,
  'Comunicação Serrado FC',
  'published',
  now()
)
on conflict (slug) do nothing;
