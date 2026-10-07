-- Biblioteca de imagens do CMS. As imagens ficam na própria base de dados (bytea):
-- entram nas cópias de segurança diárias e não precisam de outro armazenamento.
-- São conteúdo público do site: não carregar aqui documentos de atletas.
create table cms_media (
  id          bigint generated always as identity primary key,
  key         uuid not null unique default gen_random_uuid(),  -- usado no endereço público
  name        text not null,
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  size_bytes  int not null check (size_bytes > 0 and size_bytes <= 5242880),
  width       int check (width > 0),
  height      int check (height > 0),
  alt         text not null default '',
  data        bytea not null,
  uploaded_by uuid references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index cms_media_created_idx on cms_media (created_at desc);

-- Imagem de capa também nos eventos
alter table cms_events add column cover_url text;

comment on column cms_news.body is 'HTML limpo pelo backend (editor visual) ou texto simples antigo (parágrafos)';
