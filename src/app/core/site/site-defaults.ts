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
    email: DATA.CLUB.email,
    nipc: DATA.CLUB.nipc,
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
      'O Serrado Futebol Clube foi fundado a 29 de abril de 1978 no Bairro do Serrado, na Caparica (Almada), pela vontade de um grupo de moradores que queria dar aos jovens um lugar para jogar, aprender e pertencer.\n\n' +
      'Hoje somos um clube multidesportivo, com atletismo, futsal, rugby, formação e Escola de Desporto, sem nunca perder aquilo que nos define: a comunidade.',
    timeline: [
      {
        year: '1978',
        title: 'Fundação do clube',
        text: 'A 29 de abril de 1978 nasce o Serrado Futebol Clube, no Bairro do Serrado, Caparica.',
      },
      {
        year: '',
        title: 'Primeiras atividades',
        text: 'Os primeiros jogos, torneios e convívios juntam o bairro à volta do clube.',
      },
      {
        year: '',
        title: 'Crescimento',
        text: 'Mais sócios, mais atletas e uma sede que se torna ponto de encontro da comunidade.',
      },
      {
        year: '',
        title: 'Novas modalidades',
        text: 'O clube abre-se a novas modalidades, como o atletismo e o futsal.',
      },
      {
        year: '',
        title: 'Formação',
        text: 'A aposta na formação traz centenas de crianças e jovens ao desporto.',
      },
      {
        year: '',
        title: 'Projetos comunitários',
        text: 'Caminhadas solidárias, voluntariado e o projeto Descobrir Património.',
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
      'A bola ao centro, rodeada pelas cores do clube, os louros da vitória e a fita com o nome e a data de fundação: EST. 29.04.1978.',
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
