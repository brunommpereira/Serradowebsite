-- Inscrições nos eventos do site (eventos do CMS com «Exige inscrição»). Uma inscrição pode ser para
-- várias pessoas (ex.: a família); o valor é o preço do evento × pessoas (preço de sócio, se houver).
create table event_registrations (
  id             bigint generated always as identity primary key,
  event_id       bigint not null references cms_events (id) on delete cascade,
  code           text not null unique,                 -- n.º de inscrição (QR de check-in)
  name           text not null,
  email          text not null,
  phone          text not null,
  people         int not null default 1 check (people between 1 and 20),
  is_member      boolean not null default false,
  member_number  text not null default '',
  sport          text,
  shirt_size     text,
  notes          text not null default '',
  amount         numeric(8, 2) not null default 0,
  consent_at     timestamptz not null,
  consent_image  boolean not null default false,
  ip             text,
  user_agent     text not null default '',
  status         text not null default 'inscrito' check (status in ('inscrito', 'pago', 'cancelado')),
  staff_note     text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references users (id) on delete set null
);
create index event_registrations_event_idx on event_registrations (event_id, created_at desc);

-- Evento da abertura da época (7 de novembro), com inscrição no site
insert into cms_events (slug, title, kind, summary, body, cover_url, starts_at, location, capacity, price,
                        registration_required, ask_shirt_size, status, published_at)
values (
  'abertura-da-epoca',
  'Abertura da época no Fresh: treino, corrida e churrasco',
  'Convívio',
  'Sábado, 7 de novembro: treino e corridas às 10h30 e churrasco com bebidas a partir das 12h no Fresh Bar. 20 € por pessoa, tudo incluído.',
  $body$<p>Damos início à época do Serrado FC com <strong>todas as modalidades</strong> (atletismo, futsal e rugby), em parceria com a FRSH The Run Club.</p>
<ul>
<li><strong>10h30</strong>: treino e corridas para todos, ao ritmo de cada um</li>
<li><strong>12h00</strong>: churrasco com bebidas incluídas no <strong>Fresh Bar</strong></li>
</ul>
<p><strong>20 € por pessoa, tudo incluído</strong> (treino, churrasco e bebidas). Atletas, treinadores, sócios, famílias e amigos são todos bem-vindos.</p>
<img src="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-20eur.webp" alt="Cartaz da abertura da época do Serrado FC: sábado, 7 de novembro, no Fresh Bar. 10h30 treino e corridas, 12h00 churrasco com bebidas incluídas. 20 euros por pessoa, tudo incluído">
<p><a href="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-20eur-a4.pdf" rel="noopener noreferrer">Descarrega o cartaz em A4 para imprimir (PDF)</a></p>$body$,
  'https://www.serradofc.pt/media/eventos/fresh-abertura-epoca.webp',
  '2026-11-07 10:30',
  'Fresh Bar',
  0,
  20,
  true,
  false,
  'published',
  now()
)
on conflict (slug) do nothing;

-- A notícia passa a indicar o valor e a ligar à inscrição (só se ainda não foi mudada no backoffice)
update cms_news
   set summary = 'No sábado, 7 de novembro, damos início à época do Serrado FC com todas as modalidades: treino e corridas às 10h30 e, a partir das 12h, churrasco com bebidas no Fresh Bar. 20 € por pessoa, tudo incluído. Inscrições no site.',
       body = $body$<p>Está na hora de arrancar a nova época! No <strong>sábado, 7 de novembro</strong>, o Serrado FC junta atletas, sócios, famílias e amigos de <strong>todas as modalidades</strong> (atletismo, futsal e rugby) para um dia de desporto e convívio no <strong>Fresh</strong>, em parceria com a FRSH The Run Club.</p>
<img src="https://www.serradofc.pt/media/eventos/fresh-abertura-epoca.webp" alt="Logótipo FRSH The Run Club, Est. 2025">
<h2>Programa</h2>
<ul>
<li><strong>10h30</strong>: treino e corridas para todos, ao ritmo de cada um</li>
<li><strong>12h00</strong>: churrasco com bebidas incluídas no <strong>Fresh Bar</strong></li>
</ul>
<h2>Preço e inscrição</h2>
<p><strong>20 € por pessoa, tudo incluído</strong>: treino, churrasco e bebidas.</p>
<p>A inscrição faz-se no site, na página do evento: <a href="https://www.serradofc.pt/eventos/abertura-da-epoca#inscricao">inscreve-te aqui</a>. Podes inscrever a família toda de uma vez.</p>
<h2>Quem pode vir</h2>
<p>Atletas, treinadores, sócios, famílias e amigos do clube. Não é preciso ser corredor: o treino é aberto a todos os níveis e quem preferir pode juntar-se só para o almoço.</p>
<p>Traz roupa e calçado confortáveis para o treino e muita vontade de começar bem a época. Vemo-nos no Fresh!</p>
<img src="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-20eur.webp" alt="Cartaz da abertura da época do Serrado FC: sábado, 7 de novembro, no Fresh Bar. 10h30 treino e corridas, 12h00 churrasco com bebidas incluídas. 20 euros por pessoa, tudo incluído">
<p><a href="https://www.serradofc.pt/media/eventos/cartaz-abertura-epoca-20eur-a4.pdf" rel="noopener noreferrer">Descarrega o cartaz em A4 para imprimir (PDF)</a></p>
<blockquote>Mais informações junto dos treinadores e da direção, ou através da página de contactos.</blockquote>$body$,
       updated_at = now()
 where slug = 'abertura-da-epoca-no-fresh'
   and body like '%/media/eventos/cartaz-abertura-epoca.webp%';
