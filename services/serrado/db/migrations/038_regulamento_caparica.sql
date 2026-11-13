-- Regulamento do Troféu da Caparica (1.ª prova, 15 de novembro de 2026): aparece na lista de provas da ficha do atleta
update race_calendar c
   set info_url = 'https://tatletismo-almada.pt/wp-content/uploads/2026/10/TAAMPC-2026.2027-TCaparica-Regulamento.pdf'
  from race_editions e
 where e.id = c.edition_id and e.season = '2026/2027' and c.round = 1 and c.race_date = '2026-11-15' and c.info_url is null;
