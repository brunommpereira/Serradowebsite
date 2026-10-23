-- Contacto de emergência do clube, por edição do Troféu: vai para a Xistarca (que o exige) em nome dos
-- atletas que não têm contacto de emergência na ficha. Por omissão: o clube, com o telefone dos Contactos do site.
alter table race_editions
  add column emergency_name text not null default 'Serrado FC' check (length(emergency_name) <= 120),
  add column emergency_phone text not null default '' check (emergency_phone = '' or emergency_phone ~ '^\+?\d{9,15}$');

update race_editions
   set emergency_phone = coalesce(
         (select regexp_replace(data->>'phone', '\D', '', 'g') from site_blocks
           where key = 'contacts' and regexp_replace(data->>'phone', '\D', '', 'g') ~ '^\d{9,15}$'), '')
 where emergency_phone = '';
