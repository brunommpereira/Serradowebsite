-- Emails em massa (Backoffice → Email aos atletas): cada endereço recebe uma campanha uma só vez.
create table email_campaign_sent (
  campaign text not null,
  email    text not null,
  sent_at  timestamptz not null default now(),
  primary key (campaign, email)
);
