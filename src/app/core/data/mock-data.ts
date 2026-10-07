/**
 * DADOS DE DEMONSTRAÇÃO
 * ---------------------------------------------------------------
 * Todo o conteúdo deste ficheiro (jogos, resultados, notícias, eventos,
 * valores de quotas, órgãos sociais, parceiros…) é ilustrativo.
 * Na Fase 1 serve de CMS em ficheiro; nas fases seguintes será
 * substituído pela API (ver ContentService).
 */
import {
  AthleticsResult,
  Board,
  ClubDocument,
  ClubEvent,
  ClubRecord,
  Coach,
  FaqItem,
  GalleryItem,
  Match,
  Member,
  MembershipCategory,
  MembershipPayment,
  NewsArticle,
  Product,
  Sponsor,
  Sport,
  Standing,
  Team,
} from '../models';

export const CLUB = {
  name: 'Serrado Futebol Clube',
  shortName: 'Serrado FC',
  founded: '1978-04-29',
  tagline: 'Uma história. Uma família. Várias modalidades.',
  address: 'Bairro do Serrado',
  postalCode: '2825-095',
  locality: 'Caparica, Almada',
  phone: '+351 210 000 000',
  email: 'geral@serradofc.pt',
  nipc: '501523332',
  hours: [
    { days: 'Segunda a Sexta', time: '18h00 – 22h00' },
    { days: 'Sábado', time: '09h00 – 13h00' },
    { days: 'Domingo', time: 'Encerrado (exceto dias de jogo)' },
  ],
  social: {
    facebook: 'https://www.facebook.com/serradofutebolclube/',
    instagram: 'https://www.instagram.com/serradofc_1978/',
    youtube: 'https://www.youtube.com/',
  },
  map: { lat: 38.655, lng: -9.2 },
};

export const SPORTS: Sport[] = [
  {
    id: 1,
    slug: 'atletismo',
    name: 'Atletismo',
    tagline: 'Corre connosco.',
    description:
      'Do primeiro quilómetro à meia maratona, o atletismo do Serrado FC junta atletas de competição e corredores de lazer num grupo onde todos contam.',
    highlights: ['Treinos para todos os níveis', 'Participação em provas de estrada e pista', 'Grupo de corrida para sócios'],
    icon: 'run',
    active: true,
    featured: true,
    trainings: [
      { team: 'Formação (Sub-12 a Sub-18)', days: 'Terça e Quinta', time: '18h30 – 20h00', location: 'Pista / Centro de Treinos do Serrado' },
      { team: 'Seniores e Veteranos', days: 'Segunda, Quarta e Sexta', time: '19h30 – 21h00', location: 'Centro de Treinos do Serrado' },
      { team: 'Grupo de Corrida (sócios)', days: 'Sábado', time: '08h30', location: 'Ponto de encontro: Sede' },
    ],
    contactEmail: 'atletismo@serradofc.pt',
  },
  {
    id: 2,
    slug: 'futsal',
    name: 'Futsal',
    tagline: 'Formação, competição e equipa.',
    description:
      'O futsal é a modalidade com mais atletas no clube. Da formação aos seniores, trabalhamos técnica, tática e valores dentro e fora do pavilhão.',
    highlights: ['Escalões Sub-7 a Sub-17', 'Equipa sénior em competição distrital', 'Treinadores certificados'],
    icon: 'ball',
    active: true,
    featured: true,
    trainings: [
      { team: 'Sub-7 e Sub-9', days: 'Terça e Quinta', time: '18h00 – 19h00', location: 'Pavilhão' },
      { team: 'Sub-11 e Sub-13', days: 'Segunda, Quarta e Sexta', time: '18h30 – 19h45', location: 'Pavilhão' },
      { team: 'Sub-15 e Sub-17', days: 'Segunda, Quarta e Sexta', time: '19h45 – 21h00', location: 'Pavilhão' },
      { team: 'Seniores', days: 'Terça, Quinta e Sexta', time: '21h00 – 22h30', location: 'Pavilhão' },
    ],
    contactEmail: 'futsal@serradofc.pt',
  },
  {
    id: 3,
    slug: 'rugby',
    name: 'Rugby',
    tagline: 'Formação de rugby em Almada, a partir dos 5 anos.',
    description:
      'O Almada Rugby SFC é o núcleo de rugby do Serrado FC. Nasceu em 2026 para levar o rugby e os seus valores aos mais novos do concelho, com uma aposta clara na formação.',
    highlights: ['Escalões U8, U10, U12 e U14', 'Treinadores com certificação da Federação Portuguesa de Rugby', 'Treinos de experiência gratuitos'],
    icon: 'rugby',
    active: true,
    featured: true,
    trainings: [
      { team: 'Formação (U8 a U14)', days: 'Segunda e Sexta', time: '19h00 – 20h00', location: 'Campo da EB 2,3 da Costa da Caparica' },
    ],
    contactEmail: 'rugby@serradofc.pt',
    external: {
      url: 'https://almadarugby.pt/',
      name: 'Almada Rugby SFC',
      instagram: 'https://www.instagram.com/almadarugby',
      links: [
        { label: 'Vem experimentar', url: 'https://almadarugby.pt/vem-jogar-rugby' },
        { label: 'Sobre o núcleo', url: 'https://almadarugby.pt/sobre-nos' },
        { label: 'Formação e escalões', url: 'https://almadarugby.pt/formacao-rugby' },
        { label: 'Calendário', url: 'https://almadarugby.pt/calendario' },
        { label: 'Perguntas frequentes', url: 'https://almadarugby.pt/perguntas-frequentes' },
        { label: 'Contactos', url: 'https://almadarugby.pt/contactos' },
      ],
    },
    levels: [
      { name: 'U8', text: 'Rugby de bandeiras, sem contacto. Correr, passar e aprender a jogar em equipa.' },
      { name: 'U10', text: 'Introdução progressiva e supervisionada à placagem e à disputa da bola.' },
      { name: 'U12', text: 'Consolidação do contacto e primeiras noções táticas e de posições.' },
      { name: 'U14', text: 'Rugby completo e primeiros torneios, dentro do modelo formativo da federação.' },
    ],
  },
  {
    id: 4,
    slug: 'formacao',
    name: 'Formação',
    tagline: 'Crescer a jogar.',
    description:
      'A formação é o coração do clube. Um projeto transversal às modalidades, focado no desenvolvimento desportivo, pessoal e escolar dos jovens.',
    highlights: ['Projeto educativo comum', 'Acompanhamento escolar', 'Envolvimento das famílias'],
    icon: 'star',
    active: true,
    featured: false,
    trainings: [],
    contactEmail: 'formacao@serradofc.pt',
  },
  {
    id: 5,
    slug: 'escola-de-desporto',
    name: 'Escola de Desporto',
    tagline: 'O primeiro contacto com o desporto.',
    description:
      'Para crianças dos 4 aos 8 anos: jogos, coordenação motora e experimentação de várias modalidades, num ambiente divertido e seguro.',
    highlights: ['Dos 4 aos 8 anos', 'Multidesportiva', 'Sessões ao sábado de manhã'],
    icon: 'school',
    active: true,
    featured: false,
    trainings: [{ team: 'Escola de Desporto (4–8 anos)', days: 'Sábado', time: '09h30 – 11h00', location: 'Pavilhão' }],
    contactEmail: 'escola@serradofc.pt',
  },
];

export const TEAMS: Team[] = [
  { id: 1, sportSlug: 'futsal', season: '2026/27', name: 'Seniores', category: 'Sénior', coach: 'A designar' },
  { id: 2, sportSlug: 'futsal', season: '2026/27', name: 'Sub-17', category: 'Juvenis', coach: 'A designar' },
  { id: 3, sportSlug: 'futsal', season: '2026/27', name: 'Sub-15', category: 'Iniciados', coach: 'A designar' },
  { id: 4, sportSlug: 'futsal', season: '2026/27', name: 'Sub-13', category: 'Infantis', coach: 'A designar' },
  { id: 5, sportSlug: 'futsal', season: '2026/27', name: 'Sub-11', category: 'Benjamins', coach: 'A designar' },
  { id: 6, sportSlug: 'futsal', season: '2026/27', name: 'Sub-9', category: 'Traquinas', coach: 'A designar' },
  { id: 7, sportSlug: 'futsal', season: '2026/27', name: 'Sub-7', category: 'Petizes', coach: 'A designar' },
  { id: 12, sportSlug: 'atletismo', season: '2026/27', name: 'Formação', category: 'Sub-12 a Sub-18', coach: 'A designar' },
  { id: 13, sportSlug: 'atletismo', season: '2026/27', name: 'Seniores', category: 'Sénior', coach: 'A designar' },
  { id: 14, sportSlug: 'atletismo', season: '2026/27', name: 'Veteranos', category: 'Masters', coach: 'A designar' },
];

export const COACHES: Coach[] = [
  { name: 'A designar', role: 'Coordenador técnico', sportSlug: 'futsal' },
  { name: 'A designar', role: 'Treinador principal — Seniores', sportSlug: 'futsal' },
  { name: 'A designar', role: 'Treinador principal', sportSlug: 'atletismo' },
];

export const MATCHES: Match[] = [
  // Próximos
  { id: 1, sportSlug: 'futsal', team: 'Seniores', opponent: 'GD Exemplo', date: '2026-10-15T21:00', venue: 'Pavilhão do Serrado', homeAway: 'casa', competition: 'Campeonato Distrital', season: '2026/27', status: 'agendado' },
  { id: 3, sportSlug: 'futsal', team: 'Sub-13', opponent: 'CD Amostra', date: '2026-10-17T10:30', venue: 'Pavilhão Municipal', homeAway: 'fora', competition: 'Distrital Sub-13', season: '2026/27', status: 'agendado' },
  { id: 4, sportSlug: 'futsal', team: 'Seniores', opponent: 'AD Modelo', date: '2026-10-25T18:00', venue: 'Pavilhão Municipal', homeAway: 'fora', competition: 'Campeonato Distrital', season: '2026/27', status: 'agendado' },
  // Terminados
  { id: 10, sportSlug: 'futsal', team: 'Seniores', opponent: 'Adversário', date: '2026-10-04T21:00', venue: 'Pavilhão do Serrado', homeAway: 'casa', scoreHome: 4, scoreAway: 2, competition: 'Campeonato Distrital', season: '2026/27', status: 'terminado' },
  { id: 12, sportSlug: 'futsal', team: 'Sub-15', opponent: 'CD Amostra', date: '2026-10-03T11:00', venue: 'Pavilhão Municipal', homeAway: 'fora', scoreHome: 3, scoreAway: 3, competition: 'Distrital Sub-15', season: '2026/27', status: 'terminado' },
  { id: 13, sportSlug: 'futsal', team: 'Seniores', opponent: 'GD Modelo', date: '2026-09-27T18:00', venue: 'Pavilhão Municipal', homeAway: 'fora', scoreHome: 1, scoreAway: 2, competition: 'Campeonato Distrital', season: '2026/27', status: 'terminado' },
  { id: 15, sportSlug: 'futsal', team: 'Seniores', opponent: 'AD Exemplo', date: '2026-05-10T18:00', venue: 'Pavilhão do Serrado', homeAway: 'casa', scoreHome: 5, scoreAway: 1, competition: 'Campeonato Distrital', season: '2025/26', status: 'terminado' },
];

export const ATHLETICS_RESULTS: AthleticsResult[] = [
  { id: 1, date: '2026-10-12T09:00', event: 'Corrida da Cidade (10K)', location: 'Almada', highlights: [], season: '2026/27' },
  { id: 2, date: '2026-09-28T09:30', event: 'Meia Maratona de Exemplo', location: 'Setúbal', highlights: ['3.º lugar coletivo', '12 atletas classificados', '2 recordes pessoais'], season: '2026/27' },
  { id: 3, date: '2026-09-14T10:00', event: 'Grande Prémio de Estrada', location: 'Costa da Caparica', highlights: ['Vitória no escalão M45', '18 atletas em prova'], season: '2026/27' },
  { id: 4, date: '2026-06-07T09:00', event: 'Torneio de Pista de Formação', location: 'Lisboa', highlights: ['4 pódios na formação'], season: '2025/26' },
];

export const CLUB_RECORDS: ClubRecord[] = [
  { discipline: '100m', athlete: 'A atualizar', mark: '—', year: '—' },
  { discipline: '400m', athlete: 'A atualizar', mark: '—', year: '—' },
  { discipline: '5K', athlete: 'A atualizar', mark: '—', year: '—' },
  { discipline: '10K', athlete: 'A atualizar', mark: '—', year: '—' },
  { discipline: 'Meia Maratona', athlete: 'A atualizar', mark: '—', year: '—' },
];

export const STANDINGS: Standing[] = [
  {
    sportSlug: 'futsal',
    competition: 'Campeonato Distrital — Seniores',
    rows: [
      { pos: 1, team: 'GD Exemplo', played: 4, points: 10 },
      { pos: 2, team: 'Serrado FC', played: 4, points: 9 },
      { pos: 3, team: 'AD Modelo', played: 4, points: 7 },
      { pos: 4, team: 'CD Amostra', played: 4, points: 4 },
      { pos: 5, team: 'GD Modelo', played: 4, points: 3 },
    ],
  },
];

/** Notícias de demonstração (texto simples, em parágrafos): o CmsStore converte-as em conteúdos do CMS. */
export type NewsSeed = Omit<NewsArticle, 'bodyHtml' | 'coverUrl'> & { content: string[] };
export const NEWS: NewsSeed[] = [
  {
    id: 1,
    slug: 'nova-epoca-futsal',
    title: 'Arranca a nova época de futsal com mais de 120 atletas',
    category: 'Futsal',
    summary: 'Dos Sub-7 aos Seniores, o pavilhão voltou a encher-se. Conhece as equipas e os horários de treino para 2026/27.',
    content: [
      'A época 2026/27 do futsal do Serrado FC arrancou com todas as equipas em treino e casa cheia no pavilhão.',
      'Este ano o clube conta com sete escalões, desde os Petizes (Sub-7) até à equipa sénior, que volta a disputar o Campeonato Distrital.',
      'As inscrições continuam abertas em todos os escalões de formação. Os interessados podem experimentar um treino gratuito antes de se inscreverem.',
    ],
    author: 'Comunicação Serrado FC',
    publicationDate: '2026-10-05',
  },
  {
    id: 2,
    slug: 'rugby-almada-rugby',
    title: 'Nasce o Almada Rugby SFC, o núcleo de rugby do Serrado FC',
    category: 'Rugby',
    summary: 'Formação de rugby a partir dos 5 anos, nos escalões U8, U10, U12 e U14. A primeira época arrancou a 7 de setembro.',
    content: [
      'O Serrado FC tem um novo núcleo: o Almada Rugby SFC, dedicado à formação de rugby a partir dos 5 anos.',
      'A primeira época de treinos arrancou a 7 de setembro de 2026, com os escalões U8, U10, U12 e U14. Os treinos são à segunda e à sexta-feira, das 19h00 às 20h00, e os treinos de experiência são gratuitos.',
      'Toda a informação do núcleo (formação, calendário, perguntas frequentes e contactos) está em almadarugby.pt.',
    ],
    author: 'Comunicação Serrado FC',
    publicationDate: '2026-09-07',
  },
  {
    id: 3,
    slug: 'campanha-socios-2026',
    title: 'Campanha de Sócios 2026: faz parte da família Serrado',
    category: 'Clube',
    summary: 'Novas categorias, quota familiar e, em breve, pagamento online. Ser sócio nunca foi tão simples.',
    content: [
      'O Serrado FC lançou a campanha de sócios 2026 com novas categorias, incluindo a quota Familiar.',
      'Em breve será possível pagar quotas online por MB WAY, Referência Multibanco ou cartão, e ter o cartão de sócio digital no telemóvel.',
      'Ser sócio é apoiar diretamente a formação de centenas de jovens do nosso bairro.',
    ],
    author: 'Direção',
    publicationDate: '2026-10-01',
  },
  {
    id: 4,
    slug: 'atletismo-meia-maratona',
    title: 'Atletismo: 12 atletas na Meia Maratona e 3.º lugar coletivo',
    category: 'Atletismo',
    summary: 'Uma manhã em grande para a secção de atletismo, com pódio coletivo e vários recordes pessoais.',
    content: [
      'A secção de atletismo esteve em destaque na Meia Maratona, com 12 atletas classificados e o 3.º lugar coletivo.',
      'Parabéns a todos os atletas e à equipa técnica!',
    ],
    author: 'Secção de Atletismo',
    publicationDate: '2026-09-29',
  },
  {
    id: 5,
    slug: 'caminhada-solidaria-inscricoes',
    title: 'Inscrições abertas para a Caminhada Solidária',
    category: 'Comunidade',
    summary: 'Uma caminhada pelo património da Caparica com receita revertida para famílias apoiadas pelo clube.',
    content: [
      'Estão abertas as inscrições para a Caminhada Solidária do Serrado FC.',
      'O percurso passa por locais de interesse histórico da freguesia, no âmbito do projeto Descobrir Património.',
    ],
    author: 'Comunicação Serrado FC',
    publicationDate: '2026-09-20',
  },
  {
    id: 6,
    slug: 'escola-de-desporto-arranque',
    title: 'Escola de Desporto recebe os mais pequenos',
    category: 'Formação',
    summary: 'Sábados de manhã dedicados à descoberta de várias modalidades, para crianças dos 4 aos 8 anos.',
    content: [
      'A Escola de Desporto voltou com sessões aos sábados de manhã, no pavilhão.',
      'As crianças experimentam futsal, rugby e atletismo num ambiente divertido e seguro.',
    ],
    author: 'Coordenação de Formação',
    publicationDate: '2026-09-15',
  },
  {
    id: 7,
    slug: 'convocatoria-assembleia-geral',
    title: 'Convocatória: Assembleia Geral Ordinária',
    category: 'Comunicados',
    summary: 'Convocam-se os sócios para a Assembleia Geral Ordinária. Consulta a ordem de trabalhos.',
    content: [
      'Nos termos dos Estatutos, convocam-se os sócios do Serrado Futebol Clube para a Assembleia Geral Ordinária.',
      'A ordem de trabalhos e os documentos de apoio estarão disponíveis na área de Transparência.',
    ],
    author: 'Mesa da Assembleia Geral',
    publicationDate: '2026-09-10',
  },
];

export type EventSeed = Omit<ClubEvent, 'bodyHtml' | 'coverUrl'> & { description: string[] };
export const EVENTS: EventSeed[] = [
  {
    id: 1,
    slug: 'caminhada-solidaria',
    title: 'Caminhada Solidária — Descobrir Património',
    kind: 'Caminhada',
    summary: 'Percurso de 8 km pelo património da Caparica. Receita revertida para famílias apoiadas pelo clube.',
    description: [
      'Uma manhã para caminhar em família e conhecer a história da nossa terra.',
      'Inclui t-shirt do evento, abastecimento a meio do percurso e seguro.',
      'Partida e chegada junto à sede do clube.',
    ],
    date: '2026-11-08T09:30',
    endTime: '12:30',
    location: 'Sede do Serrado FC',
    capacity: 200,
    registered: 87,
    price: 8,
    memberPrice: 5,
    registrationRequired: true,
    askShirtSize: true,
  },
  {
    id: 2,
    slug: 'torneio-futsal-natal',
    title: 'Torneio de Natal de Futsal (Formação)',
    kind: 'Torneio',
    sportSlug: 'futsal',
    summary: 'Torneio de formação Sub-9 a Sub-13 com equipas convidadas da região.',
    description: ['Dois dias de futsal de formação, convívio e espírito natalício.', 'Inscrições por equipa, através dos coordenadores.'],
    date: '2026-12-19T09:00',
    endTime: '19:00',
    location: 'Pavilhão do Serrado',
    capacity: 16,
    registered: 9,
    price: 0,
    registrationRequired: true,
    askShirtSize: false,
  },
  {
    id: 3,
    slug: 'corrida-serrado-5k',
    title: 'Corrida Serrado 5K',
    kind: 'Corrida',
    sportSlug: 'atletismo',
    summary: 'A corrida do clube, aberta a todos. Inclui caminhada de 3 km e corrida infantil.',
    description: ['Prova de 5 km com cronometragem, caminhada de 3 km e corridas infantis.', 'Prémios para os três primeiros de cada escalão.'],
    date: '2027-03-14T10:00',
    endTime: '13:00',
    location: 'Bairro do Serrado',
    capacity: 400,
    registered: 0,
    price: 10,
    memberPrice: 7,
    registrationRequired: true,
    askShirtSize: true,
  },
  {
    id: 4,
    slug: 'dia-aberto-escola-de-desporto',
    title: 'Dia Aberto da Escola de Desporto',
    kind: 'Crianças',
    sportSlug: 'escola-de-desporto',
    summary: 'Traz os teus filhos para experimentar várias modalidades. Gratuito.',
    description: ['Sessão aberta para crianças dos 4 aos 8 anos experimentarem futsal, rugby e atletismo.'],
    date: '2026-10-24T10:00',
    endTime: '12:00',
    location: 'Pavilhão do Serrado',
    capacity: 40,
    registered: 22,
    price: 0,
    registrationRequired: true,
    askShirtSize: false,
  },
];

export const MEMBERSHIP_CATEGORIES: MembershipCategory[] = [
  { id: 'senior', name: 'Sénior', description: 'Sócio efetivo com direito de voto.', monthly: 10, yearly: 110, ageRule: '18 ou mais anos' },
  { id: 'juvenil', name: 'Juvenil', description: 'Para jovens adeptos e atletas.', monthly: 5, yearly: 55, ageRule: '12 aos 17 anos' },
  { id: 'crianca', name: 'Criança', description: 'O primeiro cartão de sócio.', monthly: 2.5, yearly: 25, ageRule: 'Até 11 anos' },
  { id: 'familiar', name: 'Familiar', description: 'Titular + dependentes no mesmo agregado.', monthly: 20, yearly: 220, ageRule: 'Agregado familiar' },
];

export const MEMBERSHIP_BENEFITS = [
  { title: 'Cartão digital', text: 'O teu cartão de sócio sempre no telemóvel, com QR Code.' },
  { title: 'Entrada nos jogos', text: 'Acesso aos jogos em casa de todas as modalidades.' },
  { title: 'Descontos', text: 'Preços especiais em eventos, loja do clube e parceiros.' },
  { title: 'Voz ativa', text: 'Direito de voto na Assembleia Geral (sócios seniores).' },
  { title: 'Inscrições prioritárias', text: 'Acesso antecipado a eventos e atividades com vagas limitadas.' },
  { title: 'Apoiar a formação', text: 'A tua quota ajuda centenas de jovens do bairro a praticar desporto.' },
];

export const MEMBERSHIP_FAQ: FaqItem[] = [
  { q: 'Quem pode ser sócio?', a: 'Qualquer pessoa, de qualquer idade. Menores de idade precisam da autorização do encarregado de educação.' },
  { q: 'Como pago as quotas?', a: 'Na sede do clube ou, assim que o pagamento online for ativado, por MB WAY, Referência Multibanco, cartão ou débito direto, na Área de Sócio.' },
  { q: 'Posso pagar a quota anual?', a: 'Sim. A anuidade tem desconto face ao pagamento mensal.' },
  { q: 'Como funciona a quota Familiar?', a: 'Um titular inscreve os membros do agregado como dependentes e gere as quotas, pagamentos e inscrições de todos.' },
  { q: 'Perdi a password da Área de Sócio. E agora?', a: 'Usa a opção "Esqueci-me da password" na página de entrada. Receberás um email para definir uma nova.' },
  { q: 'Como são tratados os meus dados?', a: 'De acordo com o RGPD. Consulta a nossa Política de Privacidade para saberes como tratamos e protegemos os teus dados.' },
];

export const BOARDS: Board[] = [
  { name: 'Direção', members: [{ name: 'A designar', role: 'Presidente' }, { name: 'A designar', role: 'Vice-Presidente' }, { name: 'A designar', role: 'Secretário' }, { name: 'A designar', role: 'Tesoureiro' }] },
  { name: 'Conselho Fiscal', members: [{ name: 'A designar', role: 'Presidente' }, { name: 'A designar', role: 'Vogal' }, { name: 'A designar', role: 'Vogal' }] },
  { name: 'Mesa da Assembleia Geral', members: [{ name: 'A designar', role: 'Presidente' }, { name: 'A designar', role: 'Secretário' }, { name: 'A designar', role: 'Vogal' }] },
];

export const DOCUMENTS: ClubDocument[] = [
  { title: 'Estatutos do Serrado Futebol Clube', category: 'Estatutos', year: '—', url: '' },
  { title: 'Regulamento Interno', category: 'Regulamentos', year: '—', url: '' },
  { title: 'Regulamento de Quotas', category: 'Regulamentos', year: '2026', url: '' },
  { title: 'Relatório e Contas', category: 'Relatórios e Contas', year: '2025', url: '' },
  { title: 'Orçamento', category: 'Orçamentos', year: '2026', url: '' },
  { title: 'Ata da Assembleia Geral', category: 'Atas', year: '2026', url: '' },
  { title: 'Regulamento Eleitoral', category: 'Eleições', year: '—', url: '' },
  { title: 'Convocatória — Assembleia Geral Ordinária', category: 'Comunicados', year: '2026', url: '' },
];

export const SPONSORS: Sponsor[] = [
  { id: 1, name: 'Patrocinador Principal', category: 'Patrocinador Principal', website: '', description: 'Espaço reservado ao patrocinador principal do clube.', active: true },
  { id: 2, name: 'Patrocinador A', category: 'Patrocinador', website: '', description: 'Espaço reservado.', active: true },
  { id: 3, name: 'Patrocinador B', category: 'Patrocinador', website: '', description: 'Espaço reservado.', active: true },
  { id: 4, name: 'Patrocinador C', category: 'Patrocinador', website: '', description: 'Espaço reservado.', active: true },
  { id: 5, name: 'Parceiro Local', category: 'Parceiro', website: '', description: 'Espaço reservado.', active: true },
  { id: 6, name: 'Parceiro Institucional', category: 'Parceiro Institucional', website: '', description: 'Espaço reservado.', active: true },
];

export const GALLERY: GalleryItem[] = [
  { id: 1, title: 'Apresentação das equipas de futsal', category: 'Futsal', date: '2026-10-05', kind: 'foto' },
  { id: 2, title: 'Jogo em casa — Rugby Seniores', category: 'Rugby', date: '2026-10-04', kind: 'foto' },
  { id: 3, title: 'Meia Maratona', category: 'Atletismo', date: '2026-09-28', kind: 'foto' },
  { id: 4, title: 'Resumo do jogo — Futsal Seniores', category: 'Futsal', date: '2026-10-04', kind: 'video' },
  { id: 5, title: 'Caminhada Solidária 2025', category: 'Comunidade', date: '2025-11-09', kind: 'foto' },
  { id: 6, title: 'Arraial do Clube', category: 'Eventos', date: '2026-06-20', kind: 'foto' },
  { id: 7, title: 'Treino da Escola de Rugby', category: 'Rugby', date: '2026-09-26', kind: 'video' },
  { id: 8, title: 'Grande Prémio de Estrada', category: 'Atletismo', date: '2026-09-14', kind: 'foto' },
];

export const PRODUCTS: Product[] = [
  { id: 1, name: 'Camisola Oficial 2026/27', category: 'Equipamentos', price: 35, sizes: ['6A', '8A', '10A', '12A', 'S', 'M', 'L', 'XL'] },
  { id: 2, name: 'T-Shirt Serrado FC', category: 'T-Shirts', price: 15, sizes: ['S', 'M', 'L', 'XL'] },
  { id: 3, name: 'Casaco de Treino', category: 'Casacos', price: 45, sizes: ['S', 'M', 'L', 'XL'] },
  { id: 4, name: 'Boné SFC', category: 'Bonés', price: 12, sizes: ['Único'] },
  { id: 5, name: 'Mochila do Clube', category: 'Mochilas', price: 25, sizes: ['Único'] },
  { id: 6, name: 'Cachecol Serrado FC', category: 'Merchandising', price: 10, sizes: ['Único'] },
];

export const COMMUNITY_PROJECTS = [
  { title: 'Projetos sociais', text: 'Apoio a famílias do bairro através de quotas solidárias e isenção de mensalidades para atletas carenciados.' },
  { title: 'Caminhadas solidárias', text: 'Caminhadas abertas a todos, com receita revertida para causas da comunidade.' },
  { title: 'Voluntariado', text: 'Sem os voluntários não há clube. Ajuda nos jogos, eventos, transporte ou comunicação.' },
  { title: 'Crianças e jovens', text: 'Desporto como ferramenta de educação, integração e prevenção.' },
  { title: 'Inclusão', text: 'Modalidades abertas a todos, independentemente da origem, género ou condição.' },
  { title: 'Descobrir Património', text: 'Percursos pela história e património da Caparica, em parceria com entidades locais.' },
];

/** Conta de demonstração da Área de Sócio (substituir por autenticação OAuth2/OIDC na Fase 2). */
export const DEMO_MEMBER: Member = {
  memberNumber: '00482',
  name: 'Sócio Demonstração',
  email: 'socio@exemplo.pt',
  phone: '+351 910 000 000',
  category: 'Familiar',
  status: 'Ativo',
  registrationDate: '2019-03-01',
  dependents: [
    { name: 'Dependente 1', relation: 'Filho/a', memberNumber: '00483', status: 'Ativo' },
    { name: 'Dependente 2', relation: 'Filho/a', memberNumber: '00484', status: 'Ativo' },
  ],
};

/** Conta de demonstração de uma atleta adulta (perfil «Atleta» na Área de Atletas). */
export const DEMO_ATHLETE_MEMBER: Member = {
  memberNumber: '00731',
  name: 'Rita Exemplo',
  email: 'atleta@exemplo.pt',
  phone: '+351 910 000 001',
  category: 'Efetivo',
  status: 'Ativo',
  registrationDate: '2023-09-12',
  dependents: [],
};

export const DEMO_PAYMENTS: MembershipPayment[] = [
  { id: 6, period: 'Novembro 2026', amount: 20, dueDate: '2026-11-08', status: 'Pendente' },
  { id: 5, period: 'Outubro 2026', amount: 20, dueDate: '2026-10-08', paymentDate: '2026-10-02', status: 'Pago', paymentMethod: 'MB WAY', receiptNumber: 'R2026/0412' },
  { id: 4, period: 'Setembro 2026', amount: 20, dueDate: '2026-09-08', paymentDate: '2026-09-05', status: 'Pago', paymentMethod: 'MB WAY', receiptNumber: 'R2026/0377' },
  { id: 3, period: 'Agosto 2026', amount: 20, dueDate: '2026-08-08', paymentDate: '2026-08-07', status: 'Pago', paymentMethod: 'Referência Multibanco', receiptNumber: 'R2026/0331' },
  { id: 2, period: 'Julho 2026', amount: 20, dueDate: '2026-07-08', paymentDate: '2026-07-08', status: 'Pago', paymentMethod: 'Débito direto', receiptNumber: 'R2026/0290' },
];
