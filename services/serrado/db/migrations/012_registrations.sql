-- Registo online de sócios e atletas: documentos legais com versões, assinatura desenhada e prova.

-- Condições, RGPD e autorização de imagem. Cada alteração é uma versão nova (as antigas nunca mudam:
-- cada registo aponta para a versão exata que a pessoa leu e aceitou).
create table legal_documents (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('socio', 'atleta', 'rgpd', 'imagem')),
  version     int not null check (version > 0),
  title       text not null check (length(title) between 3 and 160),
  body        text not null check (length(body) between 20 and 60000),   -- texto simples; parágrafos separados por linha em branco
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),           -- do título + texto, para a prova
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (kind, version)
);

create function legal_documents_readonly() returns trigger language plpgsql as $$
begin
  raise exception 'legal_document_readonly: as versões publicadas não se alteram; cria uma versão nova';
end $$;
create trigger legal_documents_no_update before update on legal_documents
  for each row execute function legal_documents_readonly();

-- Cada registo guarda o que foi submetido, o que foi aceite (versão + hash), a assinatura e a prova.
create table registrations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('member', 'athlete')),
  data            jsonb not null,                                -- formulário tal como foi submetido (já validado)
  member_number   text references members (member_number) on update cascade on delete set null,
  athlete_id      uuid references athletes (id) on delete set null,
  signer_name     text not null,
  signer_email    text not null,
  signer_role     text not null check (signer_role in ('titular', 'encarregado')),
  accepted        jsonb not null,                                -- [{kind, version, sha256, accepted}]
  image_consent   boolean not null default false,
  signature_png   bytea not null,
  signature_sha256 text not null,
  ip              text not null,
  user_agent      text not null default '',
  signed_at       timestamptz not null default now(),
  evidence_sha256 text not null,                                 -- hash de tudo o que está acima (prova de integridade)
  pdf             bytea,
  pdf_sha256      text
);
create index registrations_signed_idx on registrations (signed_at desc);
