/**
 * Transcrição dos documentos que regem o clube (Estatutos, nota de 1987, extrato do Diário da República
 * e Regulamento Interno de 12-04-1999). Mantém-se o texto e a grafia dos originais; só se corrigiram
 * gralhas evidentes. Sem dados pessoais dos outorgantes (moradas e números de identificação).
 */

export interface Article {
  /** Número do artigo (ex.: '1', '17') */
  n: string;
  /** Título curto, quando o original o tem (ex.: 'Decisões') */
  title?: string;
  /** Subtítulo de secção que aparece antes do artigo */
  section?: string;
  text?: string;
  /** Alíneas, já com a letra ou número (ex.: 'a) …') */
  items?: string[];
}

export interface Chapter {
  id: string;
  title: string;
  articles: Article[];
}

/** Estatutos (escritura de 30 de abril de 1985): artigos numerados de 1 a 9 */
export const STATUTES: Article[] = [
  {
    n: '1',
    text: 'No dia 29 de Abril de 1978 foi constituída uma Associação com a denominação Serrado Futebol Clube e que tem sede no Bairro do Serrado, Monte de Caparica, Freguesia de Caparica, Concelho de Almada, Distrito de Setúbal.',
  },
  {
    n: '2',
    text: 'Tem por fim a promoção cultural dos sócios, através da educação cultural, física e desportiva e recreativa, visando a sua formação humana integral, encontrando-se aberta a pessoas de ambos os sexos.',
  },
  {
    n: '3',
    text: 'São órgãos da Associação: a Assembleia Geral, a Direcção e o Conselho Fiscal, podendo ser criadas secções para coadjuvar a Direcção.',
  },
  {
    n: '4',
    text: 'Internamente, a Assembleia Geral é soberana e perante ela responde a Direcção, cuja actividade está permanentemente sujeita à inspecção do Conselho Fiscal.',
  },
  {
    n: '5',
    text: 'A Associação é representada por toda a Direcção, cujo Presidente tem função coordenadora, competindo àquela a iniciativa e a superintendência em todas as suas actividades.',
  },
  {
    n: '6',
    text: 'Constituem património da Associação a receita da quotização mensal dos sócios e as taxas cobradas pelos serviços prestados e, mediante deliberação da Assembleia Geral, quaisquer bens adquiridos por doação, deixa testamentária ou a título oneroso.',
  },
  {
    n: '7',
    text: 'A Associação durará por tempo indeterminado mas, no caso de se dissolver pelos motivos constantes da lei, o seu património reverterá a favor de instituições de interesse público a definir pela Assembleia Geral que decida a dissolução.',
  },
  {
    n: '8',
    text: 'Poderá ser admitido, como sócio da Associação, qualquer cidadão cujo proponente (ou proponentes) se responsabilize(m) pelo seu comportamento moral e cívico. A eliminação, por falta de pagamento de quotas, será da competência da Direcção. A exclusão será da competência da Assembleia Geral e verificar-se-á após conclusão de um processo disciplinar devidamente organizado.',
  },
  {
    n: '9',
    text: 'Os casos omissos nestes Estatutos serão regidos pelo Regulamento Interno, cuja aprovação compete à Assembleia Geral.',
  },
];

/** Nota do Presidente da Mesa da Assembleia Geral, Serrado, 24 de Março de 1987 */
export const NOTE_1987 = {
  intro:
    'Por razões de facilidade processual e de economia das verbas a dispender na oportunidade e inerentes ao processo de constituição legal do Serrado Futebol Clube, foi seguida a metodologia sugerida pela Federação Portuguesa das Colectividades de Cultura e Recreio (FPCCR), isto é:',
  points: [
    'a) Os Estatutos constam de uma só página sendo, por isso, extremamente sucintos;',
    'b) Os Estatutos integram, como realidade autónoma mas deles inseparável, o Regulamento Interno, cuja existência consta, aliás, do Artigo 9.º dos Estatutos;',
    'c) O Regulamento Interno constitui, de facto, o verdadeiro Estatuto da Colectividade, dado o desenvolvimento que tem e ainda a possibilidade que encerra de um ou outro ajuste pela Assembleia Geral, sem necessidade de escritura notarial.',
  ],
  documents: [
    '1. Os Estatutos propriamente ditos;',
    '2. O que consta do Diário da República e que é um resumo do ponto 1;',
    '3. O Regulamento Interno, que contempla e desenvolve os Estatutos, devendo ser considerado parte integrante dos mesmos, visto que neles aparece claramente explícito.',
  ],
  closing:
    'Creio que os documentos 1 e 3 devem ser difundidos entre os sócios ou, pelo menos, existirem exemplares na Sede para que possam ser consultados.',
  signed: 'Serrado, 24 de Março de 1987 — O Presidente da Mesa da Assembleia Geral',
};

/** Extrato publicado no Diário da República, III Série, n.º 126, de 1 de Junho de 1985 */
export const DR_EXTRACT =
  'Certifico que, por escritura de 30 de Abril do corrente ano, lavrada de fl. 40 v.º a fl. 42 v.º do livro de notas para escrituras diversas n.º 40-H do 1.º Cartório Notarial de Almada, foi constituída uma associação com a denominação em epígrafe e sede no Bairro do Serrado, Casa do Felismino, 3-B, Monte da Caparica, freguesia da Caparica, concelho de Almada, que tem por fim a promoção dos sócios, através de acções de índole cultural, desportiva e recreativa, visando a sua formação humana, encontrando-se aberta a pessoas de ambos os sexos. Constituem património da associação a receita da quotização mensal dos sócios e das taxas cobradas pelos serviços prestados e, mediante deliberação da assembleia geral, quaisquer bens adquiridos por doação, deixa testamentária ou a título oneroso. Poderá ser admitido como sócio da associação qualquer cidadão cujo proponente se responsabilize pelo seu comportamento moral e cívico. A eliminação por falta de pagamento de quotas é da competência da direcção. A expulsão será da competência da assembleia geral.';

/** Regulamento Interno (versão de 12-04-1999), 13 capítulos e 44 artigos */
export const REGULATION: Chapter[] = [
  {
    id: 'cap-1',
    title: 'Capítulo I — Denominação, Fins e Sede',
    articles: [
      {
        n: '1',
        text: 'No dia 29 de Abril de 1978 foi constituída, no Bairro do Serrado, no Monte de Caparica, concelho de Almada, uma Associação recreativa e desportiva com a denominação de SERRADO FUTEBOL CLUBE, abreviadamente designada por S.F.C.',
      },
      {
        n: '2',
        text: 'O S.F.C. tem por fins desenvolver actividades recreativas, culturais e desportivas, promovendo a sua prática e expansão, especialmente entre os seus associados.',
      },
      {
        n: '3',
        text: 'O S.F.C. tem a sua Sede e instalações sociais no Monte de Caparica, podendo ocupar ou possuir instalações em quaisquer outros locais.',
      },
    ],
  },
  {
    id: 'cap-2',
    title: 'Capítulo II — Constituição e Símbolos',
    articles: [
      { n: '4', text: 'O S.F.C. é constituído por um número não limitado de sócios.' },
      {
        n: '5',
        text: 'O S.F.C. adopta, como cores, o amarelo e o azul, constituindo símbolos do Clube o emblema, o estandarte e a bandeira.',
      },
    ],
  },
  {
    id: 'cap-3',
    title: 'Capítulo III — Admissão, Demissão e Categorias de Sócios',
    articles: [
      {
        n: '6',
        text: 'Podem solicitar a sua admissão, como sócios do SFC, todos os indivíduos sob proposta de um sócio efectivo. Contudo, a Assembleia Geral, sob proposta da Direcção, reserva-se o direito de estabelecer, temporariamente, restrições à sua admissão, desde que se verifique tornar-se exagerado o número de sócios em relação à capacidade das instalações do Clube.',
      },
      {
        n: '7',
        text: 'Existem cinco categorias de sócios: a) Efectivos; b) Auxiliares; c) Beneméritos; d) De mérito; e) Honorários.',
        items: [
          'a) São Efectivos os sócios maiores de 18 anos e de qualquer sexo.',
          'b) São Auxiliares os sócios com menos de 18 anos e de qualquer sexo.',
          'c) Os sócios Beneméritos são todos os indivíduos, mesmo estranhos ao SFC, a quem a Assembleia Geral, sob proposta da Direcção, conceder o respectivo diploma por haverem concedido valiosa ajuda material.',
          'd) Os sócios de Mérito são todas as entidades, instituições e indivíduos que tenham prestado ao SFC serviços relevantes e a quem a Assembleia Geral, sob proposta da Direcção, conceder o respectivo diploma.',
          'e) Os sócios Honorários são as entidades ou indivíduos que tenham prestado serviços relevantes ou que se hajam notabilizado por quaisquer actos em prol da Nação ou da humanidade e a quem a Assembleia Geral, sob proposta da Direcção, conceder o respectivo diploma.',
        ],
      },
      {
        n: '8',
        text: 'A admissão e demissão de sócios efectivos e auxiliares é da competência da Direcção. A admissão dos sócios Beneméritos, de Mérito e Honorários é da competência da Assembleia Geral, devendo, para isso, a respectiva proposta ser aprovada, pelo menos, com dois terços dos votos dos sócios presentes à Assembleia.',
      },
      {
        n: '9',
        text: 'A admissão dos sócios efectivos e auxiliares será precedida de proposta assinada por um sócio efectivo, devendo conter o nome, data de nascimento, naturalidade, filiação, profissão e morada do sócio proposto.',
        items: [
          'a) Esta proposta deverá estar patente, na sede do Clube, durante 8 dias e a Direcção indagará das qualidades do proposto.',
          'b) Se, findo este prazo, não houver reclamações e sendo essas pesquisas, feitas pela Direcção, favoráveis ao proposto, esta votará a sua admissão em reunião.',
          'c) Quando haja reclamações ou as informações colhidas pela Direcção não forem favoráveis ao proposto, será chamado o sócio proponente, a quem se dará conhecimento delas para que retire a proposta ou, querendo, recorra para a Assembleia Geral.',
        ],
      },
      {
        n: '10',
        text: 'Os sócios beneméritos, de mérito e honorários podem acumular esta qualidade com a de sócio efectivo, se o desejarem, acumulando, assim, os respectivos direitos e deveres.',
      },
    ],
  },
  {
    id: 'cap-4',
    title: 'Capítulo IV — Dos Fundos',
    articles: [
      {
        n: '11',
        text: 'Constituem receita do Clube: as importâncias das jóias, estatutos, cartões de identidade, quotas, rendimento do bufete e quaisquer outras provenientes de actividades realizadas sob os seus auspícios.',
      },
      {
        n: '12',
        text: 'A jóia, os estatutos e o cartão de identidade serão pagos de uma só vez, no acto de admissão, tanto para os sócios efectivos como para os auxiliares. Haverá uma quota mínima mensal para os sócios efectivos e outra de menor valor para os sócios auxiliares.',
        items: [
          'a) As quotas mínimas, referidas no corpo do artigo, serão sempre estabelecidas em Assembleia Geral, por proposta da Direcção ou do Conselho Fiscal, devendo esse tema constar, obrigatoriamente, da respectiva Ordem de Trabalhos.',
          'b) A primeira quota a satisfazer será a do mês referente à admissão do sócio.',
          'c) Os sócios serão obrigados a satisfazer o pagamento das quotas, jóias, estatutos e cartão de identidade na sede da colectividade, ficando, porém, dispensados deste dever quando haja cobrador. Contudo, para efeitos da penalidade a que se refere a alínea b) do Art.º 17.º, não fará fé a alegação de que o mesmo cobrador os não procurou.',
        ],
      },
    ],
  },
  {
    id: 'cap-5',
    title: 'Capítulo V — Direitos dos Sócios',
    articles: [
      {
        n: '13',
        text: 'Todos os sócios têm direito:',
        items: [
          'a) A frequentar e utilizar a sede e quaisquer outras instalações do Clube.',
          'b) A representar o Clube na prática de actividades desportivas, recreativas ou culturais e a praticar essas mesmas actividades nas instalações do Clube.',
          'c) A solicitar, por escrito, à Direcção a suspensão do pagamento de quotas quando estiver doente ou desempregado ou a cumprir serviço militar obrigatório até ao posto de 1.º Cabo ou qualquer outra situação que o justifique.',
          'd) A inscrever os seus filhos menores nas actividades desportivas, recreativas ou culturais mantidas pelo Clube.',
          'e) A solicitar aos Corpos Gerentes informações e esclarecimentos ou apresentar sugestões de utilidade para o Clube e para os fins que ele visa.',
          'f) A pedir a demissão.',
        ],
      },
      {
        n: '14',
        text: 'Os sócios efectivos têm direito a:',
        items: [
          'a) Tomar parte nas Assembleias Gerais, votar, eleger e ser eleitos.',
          'b) Tendo mais de seis meses de associado e em dia a sua quotização, a tomar parte nas Assembleias Gerais, votar, eleger e ser eleitos para os diversos cargos directivos, desde que saibam ler e escrever.',
          'c) Requerer a convocação de Assembleias Gerais extraordinárias.',
          'd) Examinar as contas, os documentos e os livros relativos às actividades do Clube nos oito dias que precedem a Assembleia Geral Ordinária.',
          'e) Propor a admissão de sócios e recorrer das decisões da Direcção que a tenham rejeitado ou anulado.',
        ],
      },
      {
        n: '15',
        text: 'Os sócios não efectivos podem comparecer nas Assembleias Gerais sendo-lhes, contudo, vedado tomar parte nas discussões, votar ou serem votados, excepto se forem directamente visados na discussão.',
      },
    ],
  },
  {
    id: 'cap-6',
    title: 'Capítulo VI — Deveres dos Sócios',
    articles: [
      {
        n: '16',
        text: 'São deveres de todos os sócios:',
        items: [
          'a) Honrar a sua qualidade de sócio do Clube e defender o prestígio e a dignidade do S.F.C.',
          'b) Cumprir os estatutos, regulamentos e todas as decisões da Assembleia Geral e da Direcção, mesmo quando delas discordem, sendo-lhes, nesse caso, reservado o direito de recorrerem para os órgãos competentes.',
          'c) Desempenhar, gratuitamente e com a maior dedicação, os cargos para que forem eleitos e prestar ao Clube toda a colaboração que lhe seja solicitada.',
          'd) Pagar as quotas, que se consideram vencidas no primeiro dia do mês a que se referem e que deverão ser pagas dentro do mesmo mês.',
          'e) Manter impecável comportamento moral e disciplinar dentro das instalações do Clube, conduzir-se de forma a não deslustrar a sua qualidade de sócio e identificar-se, como tal, sempre que lhe for solicitado nas instalações do Clube.',
          'f) Pedir, por escrito, a sua demissão quando não pretenda continuar a ser sócio e participar também por escrito sempre que mude de residência.',
          'g) Indemnizar o Clube do valor de quaisquer danos ou prejuízos causados no seu património e que lhe sejam imputados.',
        ],
      },
    ],
  },
  {
    id: 'cap-7',
    title: 'Capítulo VII — Disciplina',
    articles: [
      {
        n: '17',
        text: 'As infracções disciplinares consistem na violação dos deveres estabelecidos nos Estatutos e Regulamentos do Clube. Tais infracções serão punidas, consoante a sua gravidade, com as seguintes penas, que são aplicáveis a qualquer categoria de sócios: 1) Advertência; 2) Suspensão; 3) Eliminação; 4) Expulsão.',
        items: [
          'a) Incorrem nas penas de advertência ou suspensão os sócios que infrinjam o estabelecido nas alíneas b), e) e g) do Art.º 16.º destes Estatutos.',
          'b) Incorrem na pena de eliminação os sócios que deixem de pagar as suas quotas pelo espaço de três meses, sem justificação e, quando avisados pela Direcção, as não satisfaçam no prazo de quinze dias.',
          'c) Incorrem na pena de expulsão os sócios cujas infracções sejam de gravidade tal que levem a Direcção a propor e a Assembleia Geral a aprovar a respectiva demissão coerciva.',
          'd) As penas dos números 1), 2) e 3) são da competência da Direcção e a do número 4) é da competência da Assembleia Geral.',
          'e) A graduação das penas em advertência ou suspensão é da competência da Direcção em face da gravidade das infracções.',
          'f) A duração da pena de suspensão a aplicar é do critério da Direcção, estabelecendo-se como limite máximo o período de um ano.',
          'g) No caso de infracções acerca das quais a Direcção entenda propor à Assembleia Geral a expulsão do sócio infractor, a suspensão terá lugar até à realização da Assembleia Geral imediata.',
          'h) Dos castigos aplicados pela Direcção haverá recurso para a Assembleia Geral.',
          'i) Os sócios que se encontrem suspensos por castigos aplicados terão de satisfazer a importância das suas quotas correspondentes a esse lapso de tempo.',
          'j) A falta não justificada à Assembleia Geral dos sócios com casos disciplinares pendentes não pode ser motivo de não aplicação da penalidade.',
        ],
      },
    ],
  },
  {
    id: 'cap-8',
    title: 'Capítulo VIII — Corpos Gerentes',
    articles: [
      {
        n: '18',
        section: 'Secção I — Generalidades',
        text: 'O S.F.C. realiza os seus fins por intermédio da Assembleia Geral e dos Corpos Gerentes, que são a Mesa da A.G., a Direcção e o Conselho Fiscal.',
      },
      {
        n: '19',
        text: 'A eleição dos Corpos Gerentes será feita anualmente, sendo elegíveis apenas os sócios efectivos no pleno gozo dos seus direitos.',
        items: [
          'a) Perdem o mandato os membros dos Corpos Gerentes que abandonem o lugar ou peçam demissão do cargo ou sejam punidos com qualquer pena prevista no Artigo 17.º.',
          'b) Nenhum sócio poderá desempenhar, simultaneamente, mais de um cargo dos Corpos Gerentes.',
        ],
      },
      {
        n: '20',
        title: 'Solidariedade dos membros',
        items: [
          'a) Os membros de cada um dos Corpos Gerentes são solidária e colectivamente responsáveis pelos actos praticados pelo respectivo órgão no exercício do mandato para que são eleitos, salvo quando hajam feito declaração de voto da sua formal discordância, registada em acta da sessão em que a deliberação foi tomada ou da 1.ª a que assistam, se não tiverem estado presentes naquela.',
          'b) A responsabilidade a que se refere a alínea anterior cessa logo que em Assembleia Geral sejam aprovados os actos da gerência, salvo se, posteriormente, se verificar terem sido praticados com dolo ou fraude.',
          'c) Cada membro dos Corpos Gerentes pode requerer certidão da acta na parte em que conste a sua declaração de voto e a descrição do assunto a que esta se refere.',
        ],
      },
      {
        n: '21',
        title: 'Decisões',
        items: [
          'a) Qualquer dos órgãos que constituem os Corpos Gerentes só pode tomar deliberações desde que esteja presente a maioria absoluta dos seus membros.',
          'b) Aos membros dos Corpos Gerentes não é permitido divulgar a natureza dos debates e opiniões emitidas nas reuniões nem especificar a qualidade dos votos com que as decisões foram tomadas, salvo quando respondendo a inquéritos oficiais do Clube.',
        ],
      },
      {
        n: '22',
        section: 'Secção II — Reunião conjunta dos Corpos Gerentes',
        text: 'Os Corpos Gerentes do SFC podem reunir-se, conjuntamente, para apreciar e decidir sobre assuntos de interesse para o Clube que caibam na sua competência.',
      },
      {
        n: '23',
        text: 'Aos Corpos Gerentes, reunidos em conjunto, compete:',
        items: [
          'a) Interpretar os Estatutos e resolver os casos neles omissos, devendo sujeitar à confirmação da Assembleia Geral as decisões tomadas.',
          'b) Deliberar sobre a oportunidade da revisão parcial ou total dos Estatutos, apresentando à Assembleia Geral as propostas de alteração que julguem convenientes, acompanhadas de parecer devidamente fundamentado.',
          'c) Decidir a suspensão imediata de qualquer acto ou suprimir qualquer omissão de alguns dos Corpos Gerentes que sejam contrários aos Estatutos ou às resoluções da Assembleia Geral ou que sejam considerados manifestamente prejudiciais aos interesses do SFC.',
          'd) Decidir, em casos de excepcional gravidade, sobre a suspensão preventiva dos sócios arguidos em processo disciplinar.',
          'e) Julgar os processos disciplinares instaurados contra membros dos Corpos Gerentes.',
          'f) Dar parecer sobre qualquer assunto urgente que, não estando expressamente atribuído à Assembleia Geral, a Direcção não queira resolver sem ouvir os restantes Corpos Gerentes nem adiar até à reunião da Assembleia Geral.',
          'g) Reunir sempre que qualquer dos órgãos que o constituem o solicite, emitindo os pareceres que julguem convenientes ou lhe sejam pedidos.',
        ],
      },
      {
        n: '24',
        text: 'As reuniões dos Corpos Gerentes, em conjunto, são presididas pelo Presidente da Assembleia Geral, secretariadas pelos respectivos secretários e delas serão lavradas actas, em livro especial, das quais constem todas as deliberações tomadas, que constituirão e servirão de base aos pareceres necessários e que serão assinadas por todos os presentes à reunião.',
      },
    ],
  },
  {
    id: 'cap-9',
    title: 'Capítulo IX — Assembleia Geral',
    articles: [
      {
        n: '25',
        section: 'Secção I — Constituição',
        text: 'A Assembleia Geral é a reunião de todos os sócios efectivos, no pleno gozo dos seus direitos, e nela reside o poder soberano do Clube.',
      },
      {
        n: '26',
        section: 'Secção II — Convocação',
        text: 'A Assembleia Geral reunirá ordinariamente uma vez por ano, entre os dias 1 e 31 de Janeiro, para eleição dos órgãos sociais e discussão do relatório e contas da Direcção cessante e do parecer do Conselho Fiscal.',
      },
      {
        n: '27',
        text: 'A Assembleia Geral reunirá extraordinariamente sempre que for convocada pela respectiva Mesa.',
        items: [
          'a) A Direcção ou o Conselho Fiscal poderão requerer à Mesa da Assembleia Geral a sua convocação extraordinária.',
          'b) Um grupo de vinte sócios efectivos, no pleno gozo dos seus direitos, poderá requerer à Mesa da Assembleia Geral a sua convocação extraordinária. Neste caso, para que a Assembleia Geral funcione, é necessária a presença de três quartos do número dos requerentes.',
          'c) Quando uma assembleia geral extraordinária, convocada nos termos da alínea b), se não realize por falta do número mínimo de sócios requerentes, ficam os sócios que faltaram inibidos de requerer sessões extraordinárias da Assembleia Geral pelo prazo de dois anos e os requerentes solidariamente obrigados ao pagamento das despesas feitas com a convocação da Assembleia Geral.',
        ],
      },
      {
        n: '28',
        section: 'Secção III — Competência',
        text: 'É competência da Assembleia Geral:',
        items: [
          'a) Apreciar e votar o Relatório das actividades do Clube e contas da gerência, bem como o parecer do Conselho Fiscal, relativas a cada ano social.',
          'b) Eleger os Corpos Gerentes, bem como os delegados do Clube aos organismos a que o Clube estiver vinculado.',
          'c) Fixar ou alterar a importância da jóia na admissão de sócios, das quotas e de quaisquer outras contribuições.',
          'd) Apreciar e votar os Estatutos e os Regulamentos do Clube e velar pelo seu cumprimento, interpretá-los, alterá-los ou revogá-los, bem como resolver casos neles omissos e confirmar ou alterar as decisões tomadas sobre esta matéria pelos Corpos Gerentes, reunidos em conjunto.',
          'e) Autorizar a Direcção a realizar empréstimos e outras operações de crédito.',
          'f) Decidir da aquisição ou alienação de bens imóveis e das garantias a prestar pelo Clube que onerem bens imobiliários ou consignem quaisquer rendimentos.',
          'g) Decidir sobre a readmissão de sócios que tenham sido expulsos.',
          'h) Alterar as suas próprias deliberações.',
          'i) Eleger comissões para a execução ou estudo de qualquer assunto.',
          'j) Deliberar sobre a aplicação de penalidades.',
          'k) Destituir qualquer elemento dos Corpos Gerentes.',
          'l) Aceitar a demissão da Mesa da Assembleia Geral.',
          'm) Decidir sobre a existência do S.F.C.',
        ],
      },
      {
        n: '29',
        section: 'Secção IV — Funcionamento',
        text: 'A Assembleia Geral é dirigida pelo Presidente, coadjuvado por dois Secretários, designados por primeiro e segundo secretário, que com ele constituem a Mesa da Assembleia Geral.',
      },
      {
        n: '30',
        text: 'Considera-se legalmente constituída a Assembleia Geral desde que a ela estejam presentes, à hora previamente marcada, pelo menos um terço dos sócios efectivos, ou meia hora depois com qualquer número de presenças.',
        items: [
          'a) As deliberações da Assembleia Geral são tomadas por maioria absoluta do número de votos que correspondam aos votantes.',
          'b) Quando na primeira votação não tiver sido apurada a maioria absoluta, as deliberações serão tomadas, em segunda votação, pela maioria obtida.',
          'c) As votações relativas às eleições dos Corpos Gerentes e as que tiverem que confirmar ou negar a expulsão de associados serão sempre feitas por escrutínio secreto, sendo as deliberações tomadas num só escrutínio.',
          'd) As deliberações da Assembleia Geral só podem recair sobre os assuntos constantes da respectiva convocatória, sendo nulas e de nenhum efeito as estranhas à ordem de trabalhos, salvo as de simples saudação ou de pesar.',
        ],
      },
      {
        n: '31',
        text: 'Compete à Mesa da Assembleia Geral:',
        items: [
          'a) Convocar as Assembleias Gerais Ordinárias e Extraordinárias, mediante a afixação de avisos em locais visíveis, mencionando a ordem de trabalhos, o dia, a hora e o local onde terá lugar, com uma antecedência mínima de oito dias em relação à data prevista para a Assembleia Geral.',
          'b) Dirigir, orientar e esclarecer os trabalhos da Assembleia Geral.',
          'c) Redigir e assinar as actas das sessões, submetendo-as à discussão e aprovação da Assembleia Geral.',
          'd) Dar posse aos membros dos Corpos Gerentes ou de quaisquer comissões eleitas pela Assembleia Geral, bem como aceitar a sua demissão.',
          'e) Representar a Assembleia Geral, no intervalo das suas reuniões, em todos os actos externos ou internos que se efectuem no decorrer do mandato.',
          'f) Rubricar todos os livros da sociedade.',
        ],
      },
      {
        n: '32',
        text: 'As competências da Mesa da Assembleia Geral são personalizadas no seu Presidente, competindo ao primeiro secretário redigir as actas das sessões e fazer todo o expediente da Mesa, coadjuvado pelo segundo secretário.',
        items: [
          'a) Na falta do Presidente da Mesa da Assembleia, é a Assembleia Geral presidida pelo primeiro secretário e, na falta deste, pelo segundo secretário.',
        ],
      },
    ],
  },
  {
    id: 'cap-10',
    title: 'Capítulo X — Conselho Fiscal',
    articles: [
      {
        n: '33',
        text: 'O Conselho Fiscal é constituído por três membros efectivos que desempenharão as funções de Presidente, Secretário e Relator.',
      },
      {
        n: '34',
        text: 'Ao Conselho Fiscal compete:',
        items: [
          'a) Fiscalizar e dar parecer sobre todos os actos administrativos e financeiros da Direcção.',
          'b) Dar parecer sobre os relatórios e contas da Direcção, quer sejam mensais ou relativos a um ano social.',
          'c) Dar parecer sobre a fixação ou alteração de quotas ou outras contribuições obrigatórias a apresentar pela Direcção à Assembleia Geral.',
          'd) Dar parecer sobre a suspensão do pagamento de jóia na admissão de sócios, proposta pela Direcção.',
          'e) Dar parecer sobre a interpretação dos Estatutos, sobre a aplicação de sanções disciplinares das alíneas b), c) e d) do Art.º 17.º, sobre os recursos disciplinares e ainda instruir os processos de inquérito de sindicância e disciplinares que lhe sejam confiados.',
          'f) Dar parecer sobre a restante actividade do Clube, sempre que, para tal, lhe seja solicitado.',
          'g) Solicitar a convocação da Assembleia Geral ou da reunião conjunta dos Corpos Gerentes.',
          'h) Assistir, quando o entender, às reuniões da Direcção, tendo voto consultivo e lavrando, em livro especial, as respectivas actas.',
        ],
      },
    ],
  },
  {
    id: 'cap-11',
    title: 'Capítulo XI — Direcção',
    articles: [
      {
        n: '35',
        text: 'O S.F.C. é dirigido e administrado por uma Direcção, composta por: Presidente, Vice-Presidente, Tesoureiro, um primeiro e um segundo Secretários e dois Vogais.',
        items: [
          'a) O número de vogais poderá ser superior a dois se tal for julgado útil.',
          'b) Ao Presidente da Direcção compete convocar as reuniões da Direcção, abrir e encerrar as sessões, dirigir os trabalhos, assinar os balancetes mensais e as ordens de pagamento, conjuntamente com o Secretário e o Tesoureiro, e dar cumprimento às deliberações da Direcção.',
          'c) Ao Vice-Presidente compete substituir o Presidente na sua ausência, além das funções que, pela Direcção, lhe sejam atribuídas.',
          'd) Ao Tesoureiro compete assinar os recibos das quotas e de todas as receitas do Clube e prover ao expediente da tesouraria.',
          'e) Ao Primeiro Secretário compete redigir as Actas das sessões da Direcção e cuidar de todo o expediente da colectividade.',
          'f) Ao Segundo Secretário compete substituir o primeiro secretário, na sua ausência, e auxiliá-lo no cumprimento dos seus deveres.',
          'g) Os Vogais auxiliarão a Direcção nas tarefas que, por esta, lhes forem atribuídas.',
        ],
      },
      {
        n: '36',
        text: 'Compete à Direcção dirigir e administrar o Clube, prestigiá-lo, zelar pelos seus interesses, impulsionar o progresso das suas actividades e designadamente:',
        items: [
          'a) Cumprir e fazer cumprir o disposto nestes Estatutos, bem como todas as deliberações que, em conformidade com eles, forem votadas pela Assembleia Geral.',
          'b) Aprovar, rejeitar ou anular a admissão e a readmissão de sócios efectivos e auxiliares, salvo o disposto na alínea i) do Art.º 28.º.',
          'c) Propor à Assembleia Geral, com parecer prévio do Conselho Fiscal, a fixação ou alteração de quotas e quaisquer outras contribuições obrigatórias e determinar, com parecer favorável do mesmo Conselho, a suspensão do pagamento de jóia na admissão de sócios, por período que julgue conveniente.',
          'd) Aplicar as penas constantes nas alíneas a), b) e c) do Art.º 17.º.',
          'e) Propor à Assembleia Geral a concessão dos títulos das alíneas c), d) e e) do Art.º 7.º.',
          'f) Solicitar a convocação da Assembleia Geral ou da reunião conjunta dos Corpos Gerentes.',
          'g) Solicitar pareceres aos Corpos Gerentes, reunidos em conjunto, ou ao Conselho Fiscal.',
          'h) Elaborar os Regulamentos que se mostrem necessários à vida do Clube.',
          'i) Nomear as Comissões e colaboradores que julgue convenientes para a boa execução das actividades do Clube.',
          'j) Facultar ao Conselho Fiscal o exame dos livros de escrituração e contabilidade e a verificação de todos os documentos.',
          'k) Facultar aos sócios as contas, os documentos e os livros relativos às actividades do Clube, dentro do prazo estabelecido na alínea c) do Art.º 14.º.',
          'l) Comparecer a todas as reuniões da Assembleia Geral e dos Corpos Gerentes reunidos em conjunto para prestar esclarecimentos e fornecer elementos relativos à sua actividade.',
          'm) Receber, ao começo da gerência, e entregar no fim dela, todos os valores que forem demonstrados nas contas devidamente legalizadas e um Inventário de todos os valores pertencentes à colectividade.',
          'n) Velar pela conservação dos valores pertencentes à colectividade.',
          'o) Elaborar mensalmente Balancetes que traduzam o movimento de receitas e despesas do Clube e que deverão ser afixados até ao dia 10 do mês seguinte.',
        ],
      },
      {
        n: '37',
        text: 'A Direcção reunir-se-á, pelo menos, uma vez por semana e as suas votações serão tomadas por maioria de votos.',
        items: [
          'a) Em caso de empate, o Presidente tem voto de qualidade.',
          'b) Das reuniões da Direcção serão elaboradas actas, exaradas em livro a esse fim expressamente destinado, sendo cada acta assinada por todos os membros presentes.',
        ],
      },
    ],
  },
  {
    id: 'cap-12',
    title: 'Capítulo XII — Eleições',
    articles: [
      {
        n: '38',
        text: 'As eleições para os Corpos Gerentes serão feitas por escrutínio secreto, devendo cada órgão ser eleito separadamente.',
        items: [
          '1) A eleição de uma lista de candidatos será efectiva: a) no caso de haver mais do que uma lista, por maioria relativa dos votos; b) no caso de haver uma só lista, por maioria absoluta (metade mais um) dos votos.',
          '2) Para a Mesa da Assembleia Geral haverá listas de três nomes com a designação dos respectivos cargos.',
          '3) Para a Direcção haverá listas de sete nomes, designando os cargos respectivos.',
          '4) Para o Conselho Fiscal haverá listas de três nomes com indicação dos respectivos cargos.',
          '5) A eleição dos representantes da colectividade nos organismos da hierarquia recreativa, cultural ou desportiva será também realizada na Assembleia Geral eleitoral, igualmente por escrutínio secreto e separadamente.',
        ],
      },
      { n: '39', text: 'A posse de qualquer cargo deverá ser tomada até oito dias depois da eleição.' },
    ],
  },
  {
    id: 'cap-13',
    title: 'Capítulo XIII — Disposições Gerais e Transitórias',
    articles: [
      {
        n: '40',
        text: 'O SFC poderá ser dissolvido por motivos de tal forma graves e insuperáveis que tornem impossível a realização dos seus fins, em Assembleia Geral especificamente convocada para esse efeito.',
        items: [
          '1) A decisão de dissolução terá de ser tomada por quatro quintos dos sócios existentes em primeira convocatória ou, em segunda convocação, por quatro quintos dos sócios presentes à reunião.',
          '2) A Assembleia Geral, no caso de ser resolvida a dissolução do SFC, estabelecerá as disposições necessárias à distribuição do património líquido social, incluindo os livros da colectividade e os troféus.',
        ],
      },
      {
        n: '41',
        text: 'Proceder-se-á à actualização da numeração dos sócios de cinco em cinco anos, podendo a Direcção antecipá-la se o julgar conveniente.',
      },
      {
        n: '42',
        text: 'O ano social do Clube coincide com o ano civil e a ele devem ser referidas as contas de gerência.',
      },
      {
        n: '43',
        text: 'Até 01 de Janeiro de 1985, e atendendo à especificidade das condições que levaram à fundação do SFC e ao leque actual da idade dos seus sócios, serão, para todos os efeitos, considerados como efectivos os sócios que tenham completado 15 anos de idade.',
        items: [
          'a) Para efeitos de participação nos Corpos Gerentes, o disposto no corpo do Artigo apenas se aplica de forma a que: em qualquer dos órgãos que constituem os Corpos Gerentes (Mesa da Assembleia Geral, Direcção e Conselho Fiscal) a maioria dos elementos eleitos deverá ter mais de 18 anos à data da eleição; os Presidentes da Mesa da Assembleia Geral, da Direcção e do Conselho Fiscal, bem como o Tesoureiro, terão sempre de ser sócios com mais de 18 anos à data da eleição.',
        ],
      },
      {
        n: '44',
        text: 'Os Estatutos e o Regulamento Interno foram aprovados pela Assembleia Geral, cujos trabalhos terminaram em 13 de Dezembro de 1980, e entraram imediatamente em vigor.',
      },
    ],
  },
];

/** Resumo público da última Assembleia Geral (sem nomes de sócios nem valores) */
export const LAST_ASSEMBLY = {
  title: 'Assembleia Geral Extraordinária de 6 de dezembro de 2025',
  agenda: [
    'Apreciação, discussão e votação do relatório de atividades e contas, bem como do património do clube;',
    'Votação e eleição dos órgãos sociais do clube para o biénio 2025/2027;',
    'Outros assuntos.',
  ],
  summary: [
    'A Assembleia reuniu nas instalações do clube, às 17h00, com a presença de 16 associados.',
    'Foi apresentado o relatório da vida do clube nos últimos meses: a concessão do bar não teve sucesso nesse período e a sede esteve encerrada por esse motivo; o arraial dos Santos Populares ajudou a suportar a manutenção do clube; foi feita uma parceria com o Outdoor Training Camp (OTC) para participar no Troféu de Atletismo de Almada, onde o clube seguia em 1.º lugar coletivo após duas provas; e o clube explorou um bar de apoio no G.P. de Atletismo da Caparica, a convite da organização.',
    'Foram prestadas aos associados as informações sobre a situação financeira da associação.',
    'Foi apresentada uma lista única, candidata ao biénio 2025/2027. A votação foi feita por boletins individuais, depositados na urna um a um. A nova Direção foi eleita por unanimidade, com 16 votos a favor.',
  ],
};
