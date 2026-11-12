-- Dorsal de cada atleta na edição do Troféu (vem da lista de inscritos da Xistarca) e quando lhe foi enviado o email com o dorsal
alter table race_signups
  add column bib int check (bib is null or bib between 1 and 99999),
  add column bib_email_at timestamptz;
