-- Logótipo do OTC – Outdoor Training Camp (no parceiro e na notícia, enquanto estiver em rascunho e sem imagem)
update cms_partners set logo_url = 'https://www.serradofc.pt/media/parceiros/otc-outdoor-training-camp.webp', updated_at = now()
 where slug = 'otc-outdoor-training-camp' and logo_url is null;

update cms_news
   set cover_url = coalesce(cover_url, 'https://www.serradofc.pt/media/parceiros/otc-outdoor-training-camp.webp'),
       body = replace(body, '<h2>Quem é o OTC',
         '<img src="https://www.serradofc.pt/media/parceiros/otc-outdoor-training-camp.webp" alt="Logótipo OTC – Outdoor Training Camp">' || chr(10) || '<h2>Quem é o OTC'),
       updated_at = now()
 where slug = 'obrigado-otc-outdoor-training-camp' and status = 'draft' and body not like '%otc-outdoor-training-camp.webp%';
