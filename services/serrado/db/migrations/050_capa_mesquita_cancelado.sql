-- Notícia da candidatura do Mesquita: capa e imagem passam para o cartaz com a faixa «CANCELADO».
update cms_news
   set cover_url = 'https://www.serradofc.pt/media/eleicoes/mesquita-a-presidente-cancelado.webp',
       body = replace(body, 'media/eleicoes/mesquita-a-presidente.webp" alt="Cartaz: Mesquita a Presidente do Serrado FC"',
                            'media/eleicoes/mesquita-a-presidente-cancelado.webp" alt="Cartaz: Mesquita a Presidente do Serrado FC, com a faixa Cancelado"'),
       updated_at = now()
 where slug = 'mesquita-candidato-a-presidente-do-serrado-fc'
   and cover_url = 'https://www.serradofc.pt/media/eleicoes/mesquita-a-presidente.webp';
