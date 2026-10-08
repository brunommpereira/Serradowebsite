-- Conteúdos que vêm de fora (página de Facebook do clube): qual entrada do CMS corresponde
-- a cada publicação ou evento, para não duplicar e saber se ainda se pode atualizar.
create table cms_external (
  source       text not null check (source ~ '^[a-z0-9-]{1,32}$'),   -- ex.: facebook
  external_id  text not null check (length(external_id) between 1 and 200),
  type         text not null check (type in ('news', 'events')),
  entry_id     bigint not null,
  remote_updated_at text,               -- updated_time do fornecedor na última importação
  synced_at    timestamptz not null default now(),
  primary key (source, external_id)
);
create index cms_external_entry_idx on cms_external (type, entry_id);
