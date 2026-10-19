/**
 * Conteúdo original de cada bloco: é o que o site mostra enquanto o bloco não é editado
 * no backoffice, e o ponto de partida do editor.
 */
import * as DATA from '../data/mock-data';
import { SportSlug } from '../models';
import { SiteData, SportBlock } from './site.models';

function sport(slug: SportSlug): SportBlock {
  const s = DATA.SPORTS.find((x) => x.slug === slug)!;
  return {
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    highlights: s.highlights,
    active: s.active,
    featured: s.featured,
    contactEmail: s.contactEmail,
    trainings: s.trainings,
    teams: DATA.TEAMS.filter((t) => t.sportSlug === slug).map((t) => ({
      name: t.name,
      category: t.category,
      coach: t.coach,
      season: t.season,
    })),
    coaches: DATA.COACHES.filter((c) => c.sportSlug === slug).map((c) => ({
      name: c.name,
      role: c.role,
    })),
    levels: s.levels ?? [],
    externalUrl: s.external?.url ?? '',
    externalName: s.external?.name ?? '',
    instagram: s.external?.instagram ?? '',
    links: s.external?.links ?? [],
  };
}

export const SITE_DEFAULTS: SiteData = {
  contacts: {
    name: DATA.CLUB.name,
    shortName: DATA.CLUB.shortName,
    tagline: DATA.CLUB.tagline,
    address: DATA.CLUB.address,
    postalCode: DATA.CLUB.postalCode,
    locality: DATA.CLUB.locality,
    phone: DATA.CLUB.phone,
    phone2: '',
    whatsapp: '935 519 828',
    whatsappMessage: 'Olá! Venho do site do Serrado FC e gostava de saber…',
    email: DATA.CLUB.email,
    nipc: DATA.CLUB.nipc,
    cae: '93120 – Atividades dos clubes desportivos',
    regulator: 'ASAE – Autoridade de Segurança Alimentar e Económica',
    hours: DATA.CLUB.hours,
    facebook: DATA.CLUB.social.facebook,
    instagram: DATA.CLUB.social.instagram,
    youtube: DATA.CLUB.social.youtube,
    mapLat: DATA.CLUB.map.lat,
    mapLng: DATA.CLUB.map.lng,
  },
  club: {
    heroSubtitle:
      'Um clube de bairro que se tornou casa de várias modalidades. Esta é a nossa história, a nossa missão e a nossa gente.',
    introTitle: 'Uma história. Uma família. Várias modalidades.',
    intro:
      'O Serrado Futebol Clube nasceu a 29 de abril de 1978, com o novo bairro da Quinta do Serrado, na Caparica: cerca de 400 fogos que trouxeram ao local muitos jovens à procura de desporto e de ocupação dos tempos livres. À frente do movimento esteve Samuel Gomes de Andrade, com largas provas dadas nos Bombeiros Voluntários de Almada, acompanhado por um grande grupo de jovens com uma idade média de 15 anos.\n\n' +
      'Sem sede e sem campos, foi preciso «inventá-los». As primeiras reuniões faziam-se no Talho do Samuel, como ficou conhecido, onde os assuntos eram debatidos e as decisões tomadas de forma informal. Em 1979, a sede passou para uma antiga adega, onde ainda hoje funciona: um espaço pequeno que os sócios tornaram acolhedor.\n\n' +
      'Desde o início, o clube animou o bairro e a freguesia: festejos de aniversário, Santos Populares, verões cheios de iniciativas. O objetivo foi sempre ocupar os tempos livres dos jovens com desporto, recreio e convívio. Hoje somos um clube multidesportivo, com atletismo, futsal, rugby, formação e Escola de Desporto, sem perder aquilo que nos define: a comunidade.',
    timeline: [
      {
        year: '1978',
        title: 'Fundação do clube',
        text: 'A 29 de abril nasce o Serrado Futebol Clube, com a chegada de cerca de 400 famílias ao novo bairro da Quinta do Serrado. A primeira «sede» é o Talho do Samuel.',
      },
      {
        year: '1979',
        title: 'Sede no bairro',
        text: 'A sede muda-se para uma antiga adega, onde ainda hoje funciona. Um espaço pequeno, arranjado pelos próprios sócios.',
      },
      {
        year: '1980',
        title: 'Estatutos aprovados',
        text: 'Os Estatutos e o Regulamento Interno são aprovados em Assembleia Geral, a 13 de dezembro de 1980.',
      },
      {
        year: '1982',
        title: 'Do pelado ao «Campo da Fossa»',
        text: 'O primeiro campo de terra batida, onde se jogava futebol de salão e se fazia ginástica, dá lugar a uma vivenda. Os jovens correm na rua (o início do atletismo) e o clube passa a jogar no célebre «Campo da Fossa».',
      },
      {
        year: '1985',
        title: 'No Diário da República',
        text: 'Os Estatutos são publicados no Diário da República n.º 126, de 1 de junho de 1985. O clube filia-se na Federação Portuguesa das Colectividades de Cultura e Recreio, na Federação Portuguesa de Futebol de Salão, na Federação Portuguesa de Cicloturismo e no INATEL.',
      },
      {
        year: '1999/2000',
        title: 'Campeão Distrital de Futebol de Salão',
        text: 'O primeiro grande título do clube.',
      },
      {
        year: '2001/2002',
        title: 'Vice-Campeão Nacional de Futebol de Salão',
        text: 'O Serrado FC entre os melhores do país.',
      },
      {
        year: '2002/2003',
        title: 'Campeão Distrital de Futsal',
        text: 'Os seniores masculinos sagram-se campeões da Associação de Futebol de Setúbal.',
      },
      {
        year: '',
        title: 'Formação e comunidade',
        text: 'A aposta na formação traz centenas de crianças e jovens ao desporto, a par de caminhadas solidárias, voluntariado e do projeto Descobrir Património.',
      },
      {
        year: '2025/2026',
        title: 'Vice-campeão no Troféu de Atletismo de Almada',
        text: 'O atletismo do Serrado FC no pódio do Troféu «Mário Pinto Claro».',
      },
      {
        year: '2026',
        title: 'Clube multidesportivo',
        text: 'Nasce o Almada Rugby SFC, núcleo de rugby do clube. Um Serrado FC moderno e aberto a todos, fiel às suas raízes.',
      },
    ],
    mission:
      'Promover a prática desportiva, a formação e a inclusão, unindo a comunidade da Caparica à volta do desporto.',
    vision:
      'Ser um clube multidesportivo de referência, moderno e transparente, onde cada pessoa encontra o seu lugar.',
    values: [
      {
        icon: 'users',
        title: 'Comunidade',
        text: 'O clube é de quem o vive: atletas, famílias, sócios e vizinhos.',
      },
      { icon: 'star', title: 'Formação', text: 'Formar atletas e, acima de tudo, formar pessoas.' },
      {
        icon: 'trophy',
        title: 'Competição',
        text: 'Ambição de ganhar, com respeito pelos adversários.',
      },
      { icon: 'heart', title: 'Inclusão', text: 'Portas abertas a todos, sem exceção.' },
      { icon: 'shield', title: 'Transparência', text: 'Contas claras e gestão aberta aos sócios.' },
      {
        icon: 'check',
        title: 'Profissionalismo',
        text: 'Organização, rigor e treinadores qualificados.',
      },
    ],
    emblem:
      'O emblema mantém o desenho da fundação: a bola ao centro, num círculo metade azul e metade amarelo, entre os louros da vitória, e a fita com o nome do clube. No original pintado à mão, que está na sede, lê-se «Fundado em 29 abril 78».',
    archive: [
      {
        imageUrl: 'media/historia/emblema-original.webp',
        caption: 'O emblema original, pintado à mão, que está na sede: «Fundado em 29 abril 78».',
      },
      {
        imageUrl: 'media/historia/primeiras-equipas.webp',
        caption:
          'Uma das primeiras equipas do Serrado F.C., numa fotografia da sede gasta pelo tempo.',
      },
      {
        imageUrl: 'media/historia/campeoes-futsal-2002-2003.webp',
        caption: 'Campeões de Futsal Sénior Masculino 2002/2003 da A.F. Setúbal.',
      },
    ],
    facilities: [
      {
        name: 'Centro de Treinos do Serrado',
        text: 'Campo para treinos e jogos de rugby e atletismo, com balneários e bancada.',
        imageUrl: null,
      },
      { name: 'Pavilhão', text: 'Casa do futsal e da Escola de Desporto.', imageUrl: null },
      {
        name: 'Sede social',
        text: 'Secretaria, sala de reuniões, bar e espaço de convívio dos sócios.',
        imageUrl: null,
      },
    ],
  },
  boards: {
    note: 'Biénio 2025/2027, eleitos na Assembleia Geral de 6 de dezembro de 2025.',
    members: DATA.BOARDS.flatMap((b) =>
      b.members.map((m) => ({ group: b.name, role: m.role, name: m.name })),
    ),
  },
  documents: {
    items: DATA.DOCUMENTS.map((d) => ({
      title: d.title,
      category: d.category,
      year: d.year,
      url: d.url || null,
    })),
  },
  membership: {
    categories: DATA.MEMBERSHIP_CATEGORIES.map((c) => ({
      name: c.name,
      description: c.description,
      monthly: c.monthly,
      yearly: c.yearly,
      ageRule: c.ageRule,
    })),
    benefits: DATA.MEMBERSHIP_BENEFITS,
    faq: DATA.MEMBERSHIP_FAQ,
  },
  community: { projects: DATA.COMMUNITY_PROJECTS },
  shop: {
    notice:
      'A loja online abre brevemente. Até lá, as encomendas são feitas na sede ou através do formulário de contacto.',
    products: DATA.PRODUCTS.map((p) => ({
      name: p.name,
      category: p.category,
      description: '',
      price: p.price,
      memberPrice: null,
      sizes: p.sizes,
      imageUrl: null,
      available: true,
    })),
  },
  gallery: {
    items: DATA.GALLERY.map((g) => ({
      title: g.title,
      category: g.category,
      date: g.date,
      kind: g.kind,
      imageUrl: null,
      videoUrl: null,
    })),
  },
  matches: {
    items: DATA.MATCHES.map((m) => ({
      sportSlug: m.sportSlug,
      team: m.team,
      opponent: m.opponent,
      date: m.date,
      venue: m.venue,
      homeAway: m.homeAway,
      competition: m.competition,
      season: m.season,
      status: m.status,
      scoreHome: m.scoreHome ?? null,
      scoreAway: m.scoreAway ?? null,
    })),
  },
  athletics: {
    items: DATA.ATHLETICS_RESULTS.map((r) => ({
      date: r.date,
      event: r.event,
      location: r.location,
      highlights: r.highlights,
      season: r.season,
    })),
  },
  standings: {
    tables: DATA.STANDINGS.map((s) => ({
      sportSlug: s.sportSlug,
      competition: s.competition,
      rows: s.rows.map((r) => `${r.team} | ${r.played} | ${r.points}`),
    })),
  },
  records: { items: DATA.CLUB_RECORDS },
  agenda: {
    items: [
      {
        date: '2026-11-21T15:00',
        type: 'Reunião',
        title: 'Assembleia Geral Ordinária',
        location: 'Sede do Serrado FC',
        sportSlug: null,
        link: '/clube#transparencia',
      },
    ],
  },
  email: {
    text: [
      '**SERRADO FUTEBOL CLUBE**',
      '*Desporto • Formação • Comunidade*',
      '',
      '🥈 **Vice-Campeão Troféu de Atletismo de Almada "Mário Pinto Claro"** | 2025/2026',
      '🏆 **Campeão Distrital de Futebol de Salão** | 1999/2000',
      '🥈 **Vice-Campeão Nacional Futebol Salão** | 2001/2002',
      '🏆 **Campeão Distrital de Futsal** | 2002/2003',
      '',
      '🏅 **Medalha de Prata de Mérito Desportivo**',
      'Câmara Municipal de Almada',
    ].join('\n'),
    showLogo: true,
    logoUrl: null,
    logoSize: 90,
  },
  'sport-atletismo': sport('atletismo'),
  'sport-futsal': sport('futsal'),
  'sport-rugby': sport('rugby'),
  'sport-formacao': sport('formacao'),
  'sport-escola-de-desporto': sport('escola-de-desporto'),
};
