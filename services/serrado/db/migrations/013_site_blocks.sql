-- Conteúdos do site com estrutura própria (contactos, clube, órgãos sociais, documentos, loja,
-- jogos, provas, galeria, modalidades…). Cada bloco é um documento JSON editado no backoffice;
-- enquanto não existe, o site mostra o conteúdo original que vem no código.
create table site_blocks (
  key        text primary key check (key ~ '^[a-z][a-z0-9-]{1,40}$'),
  data       jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references users (id) on delete set null
);

-- Histórico: uma linha por gravação (data null = reposto o conteúdo original).
create table site_block_revisions (
  id         bigint generated always as identity primary key,
  key        text not null,
  data       jsonb,
  author_id  uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index site_block_revisions_key_idx on site_block_revisions (key, created_at desc);

-- Documentos em PDF (estatutos, relatórios e contas…) na mesma biblioteca das imagens
alter table cms_media drop constraint cms_media_mime_check;
alter table cms_media add constraint cms_media_mime_check check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'));
alter table cms_media drop constraint cms_media_size_bytes_check;
alter table cms_media add constraint cms_media_size_bytes_check check (size_bytes > 0 and size_bytes <= 10485760);
