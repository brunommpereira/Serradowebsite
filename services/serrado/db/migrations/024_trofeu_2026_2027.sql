-- Provas sem data definida (ex.: «janeiro de 2027», «a definir») e o calendário do Troféu 2026/2027,
-- tal como está em https://tatletismo-almada.pt/index.php/provas-26-27/ (consultado a 20/10/2026).

alter table race_calendar alter column race_date drop not null;
alter table race_calendar add column if not exists date_label text not null default '' check (length(date_label) <= 40);

-- Edição 2026/2027 (se ainda não existir). O endereço do evento na Xistarca fica vazio até abrirem
-- as inscrições pelo site: sem ele, o site mostra as provas mas não aceita pedidos.
insert into race_editions (season, name, event_url, active)
select '2026/2027', 'Troféu de Almada em Atletismo 2026/2027', '', not exists (select 1 from race_editions where active)
 where not exists (select 1 from race_editions where season = '2026/2027');

insert into race_calendar (edition_id, round, name, race_date, date_label, location, info_url)
select e.id, p.round, p.name, p.race_date::date, p.date_label, null, p.info_url
  from race_editions e,
       (values
         (1, 'Troféu da Caparica 2026', '2026-11-15', '', null),
         (2, '7.º Grande Prémio de São Martinho', '2026-11-22', '', 'https://tatletismo-almada.pt/index.php/2a-prova-26-27/'),
         (3, '2.ª Corrida Noturna Reis by Serrado FC', null, 'janeiro de 2027', null),
         (4, '32.º GP Atletismo Charneca da Caparica', null, 'março de 2027', null),
         (5, 'Provas Técnicas 53.º Aniversário do 25 de Abril', '2027-05-01', '', null),
         (6, '10.ª Milha Urbana Alberto Chaíça', null, 'maio de 2027', null),
         (7, '8.º Corta-Mato Rui Duarte Silva', null, 'maio de 2027', null),
         (8, 'Corrida Egas Moniz 2027', '2027-06-06', '', null),
         (9, '11.º Meeting Artemisa Sá 2027', '2027-06-10', '', null),
         (10, 'Prova a incluir brevemente', null, 'a definir', null)
       ) as p (round, name, race_date, date_label, info_url)
 where e.season = '2026/2027'
on conflict (edition_id, round) do update
   set name = excluded.name, race_date = excluded.race_date, date_label = excluded.date_label,
       info_url = coalesce(excluded.info_url, race_calendar.info_url);
