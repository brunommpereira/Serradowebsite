"""
Modelos dos documentos legais do registo online. São um ponto de partida: a direção tem de os
rever (e, de preferência, um jurista) antes de os publicar no backoffice. Só o seed de demonstração
os publica automaticamente.
"""

TEMPLATES: dict[str, tuple[str, str]] = {
    "socio": (
        "Condições de admissão de sócio",
        """Ao inscrever-se como sócio do Serrado Futebol Clube (o «Clube»), a pessoa declara que conhece e aceita os Estatutos e o Regulamento Interno do Clube, disponíveis na secretaria e no site.

1. Quota. O sócio obriga-se a pagar a quota da sua categoria, no valor e com a periodicidade aprovados em Assembleia Geral e publicados no site. A falta de pagamento de quotas pode levar à suspensão dos direitos de sócio, nos termos dos Estatutos.

2. Direitos. O sócio tem direito a participar na vida do Clube, nas Assembleias Gerais e nas atividades organizadas para sócios, nos termos dos Estatutos.

3. Deveres. O sócio compromete-se a respeitar os Estatutos, os regulamentos e as decisões dos órgãos sociais, e a contribuir para o bom nome do Clube.

4. Dados de contacto. O sócio compromete-se a manter os seus dados atualizados, na área reservada do site ou junto da secretaria.

5. Saída. O sócio pode pedir a sua exoneração a qualquer momento, por escrito, sem prejuízo das quotas vencidas.""",
    ),
    "atleta": (
        "Regulamento e condições de inscrição de atleta",
        """Ao inscrever um atleta no Serrado Futebol Clube (o «Clube»), o próprio atleta ou, sendo menor, o encarregado de educação declara que conhece e aceita o Regulamento Interno do Clube e as regras da modalidade.

1. Aptidão. O atleta (ou o encarregado de educação) declara que o atleta não tem contraindicações conhecidas para a prática desportiva e compromete-se a apresentar o exame médico desportivo exigido pela federação da modalidade.

2. Seguro. A inscrição inclui o seguro desportivo obrigatório, nos termos da lei e das regras da federação.

3. Mensalidades. Nas escolas com mensalidade, o encarregado de educação (ou o atleta) obriga-se a pagá-la até ao dia 8 de cada mês. A falta de pagamento pode impedir a participação nos treinos e jogos.

4. Conduta. O atleta compromete-se a respeitar treinadores, colegas, adversários e árbitros, e a cumprir os horários e as regras do Clube. O encarregado de educação compromete-se a fazer o mesmo nos treinos e nas competições.

5. Documentos. O atleta (ou o encarregado de educação) compromete-se a entregar os documentos pedidos para a inscrição na federação e a manter os dados atualizados.

6. Desistência. A desistência deve ser comunicada por escrito à secretaria; as mensalidades vencidas continuam devidas.""",
    ),
    "rgpd": (
        "Informação sobre proteção de dados (RGPD)",
        """O Serrado Futebol Clube (o «Clube») é o responsável pelo tratamento dos dados pessoais recolhidos neste formulário. Contacto: secretaria do Clube (ver a página Contactos do site).

1. Finalidades. Os dados são tratados para gerir a inscrição de sócios e atletas, as quotas e mensalidades, a inscrição nas federações e associações da modalidade, o seguro desportivo, as comunicações do Clube e o cumprimento de obrigações legais (por exemplo, fiscais).

2. Fundamento. O tratamento é necessário para a execução da inscrição (contrato) e para o cumprimento de obrigações legais. Os dados de menores são tratados com o consentimento e sob a responsabilidade do encarregado de educação.

3. Destinatários. Os dados podem ser comunicados à federação e associação da modalidade, à seguradora e ao programa de faturação, apenas na medida necessária. Os prestadores de serviços do site (alojamento, email e pagamentos) tratam os dados por conta do Clube, com contratos de tratamento de dados.

4. Conservação. Os dados são conservados enquanto durar a inscrição e, depois disso, pelos prazos legais (por exemplo, 10 anos para documentos de faturação).

5. Direitos. O titular (ou o encarregado de educação) pode pedir o acesso, a retificação, o apagamento, a limitação ou a portabilidade dos dados e opor-se ao tratamento, junto da secretaria. Pode ainda apresentar reclamação à Comissão Nacional de Proteção de Dados (www.cnpd.pt).

6. Segurança. Os dados de identificação (n.º do documento, NIF e morada) só são acessíveis às pessoas do Clube que deles precisam para as suas funções, e todos os acessos de gestão ficam registados.""",
    ),
    "imagem": (
        "Autorização de utilização de imagem",
        """Autorizo o Serrado Futebol Clube a captar e a publicar fotografias e vídeos em que apareça o atleta (ou eu próprio), tirados em treinos, jogos, provas e eventos do Clube, no site, nas redes sociais e em materiais de divulgação do Clube, sem fins comerciais.

Esta autorização é facultativa: recusá-la não impede a inscrição. Pode ser retirada a qualquer momento, junto da secretaria, sem efeitos sobre as publicações anteriores à retirada; a pedido, o Clube retira as imagens que ainda controle.""",
    ),
}
