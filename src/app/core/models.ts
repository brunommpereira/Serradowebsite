/**
 * Modelos de domínio — espelham o modelo de dados da especificação (secção 34)
 * para que a troca dos dados de demonstração pela API REST seja direta.
 */

import { Permission } from './permissions';

export type SportSlug = 'atletismo' | 'futsal' | 'rugby' | 'formacao' | 'escola-de-desporto';

export type NewsCategory =
  | 'Clube'
  | 'Atletismo'
  | 'Futsal'
  | 'Rugby'
  | 'Formação'
  | 'Comunidade'
  | 'Eventos'
  | 'Parceiros'
  | 'Comunicados';

export interface Sport {
  id: number;
  slug: SportSlug;
  name: string;
  tagline: string;
  description: string;
  highlights: string[];
  icon: 'run' | 'ball' | 'rugby' | 'star' | 'school';
  active: boolean;
  /** Mostrada em destaque na homepage */
  featured: boolean;
  trainings: Training[];
  contactEmail: string;
  /**
   * Modalidade com site próprio (ex.: núcleo de rugby). Quando definido,
   * os links do site apontam para este endereço externo.
   */
  external?: {
    url: string;
    name: string;
    /** Atalhos para páginas do site externo */
    links?: { label: string; url: string }[];
    /** Rede social do núcleo */
    instagram?: string;
  };
  /** Escalões com descrição curta (usado quando a modalidade tem site próprio) */
  levels?: { name: string; text: string }[];
}

export interface Training {
  team: string;
  days: string;
  time: string;
  location: string;
}

export interface Team {
  id: number;
  sportSlug: SportSlug;
  season: string;
  name: string;
  category: string;
  coach: string;
}

export interface Coach {
  name: string;
  role: string;
  sportSlug: SportSlug;
}

export type MatchStatus = 'agendado' | 'terminado' | 'adiado';

export interface Match {
  id: number;
  sportSlug: SportSlug;
  team: string;
  opponent: string;
  /** ISO local: AAAA-MM-DDTHH:MM */
  date: string;
  venue: string;
  homeAway: 'casa' | 'fora';
  scoreHome?: number;
  scoreAway?: number;
  competition: string;
  season: string;
  status: MatchStatus;
}

export interface AthleticsResult {
  id: number;
  date: string;
  event: string;
  location: string;
  highlights: string[];
  season: string;
}

export interface ClubRecord {
  discipline: string;
  athlete: string;
  mark: string;
  year: string;
}

export interface Standing {
  sportSlug: SportSlug;
  competition: string;
  rows: { pos: number; team: string; played: number; points: number }[];
}

export interface NewsArticle {
  id: number;
  slug: string;
  title: string;
  category: NewsCategory;
  summary: string;
  /** Texto em HTML (editor visual do CMS) */
  bodyHtml: string;
  /** Imagem de capa (biblioteca de imagens do CMS) */
  coverUrl?: string | null;
  author: string;
  publicationDate: string;
}

export type EventKind = 'Torneio' | 'Caminhada' | 'Corrida' | 'Solidário' | 'Convívio' | 'Crianças';

export interface ClubEvent {
  id: number;
  slug: string;
  title: string;
  kind: EventKind;
  sportSlug?: SportSlug;
  summary: string;
  /** Texto em HTML (editor visual do CMS) */
  bodyHtml: string;
  coverUrl?: string | null;
  date: string;
  endTime?: string;
  location: string;
  capacity: number;
  registered: number;
  /** Preço em euros. 0 = gratuito */
  price: number;
  memberPrice?: number;
  registrationRequired: boolean;
  askShirtSize: boolean;
}

export interface AgendaItem {
  id: string;
  date: string;
  type: 'Jogo' | 'Treino' | 'Evento' | 'Competição' | 'Reunião';
  sportSlug?: SportSlug;
  title: string;
  location: string;
  opponent?: string;
  link: string;
}

export interface MembershipCategory {
  id: string;
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  ageRule: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface BoardMember {
  name: string;
  role: string;
}

export interface Board {
  name: string;
  members: BoardMember[];
}

export interface ClubDocument {
  title: string;
  category: 'Estatutos' | 'Regulamentos' | 'Relatórios e Contas' | 'Orçamentos' | 'Atas' | 'Eleições' | 'Comunicados';
  year: string;
  /** URL do PDF; vazio enquanto não for publicado */
  url: string;
}

export interface Sponsor {
  id: number;
  name: string;
  category: 'Patrocinador Principal' | 'Patrocinador' | 'Parceiro' | 'Parceiro Institucional';
  website: string;
  description: string;
  active: boolean;
}

export interface GalleryItem {
  id: number;
  title: string;
  category: 'Atletismo' | 'Futsal' | 'Rugby' | 'Eventos' | 'Comunidade';
  date: string;
  kind: 'foto' | 'video';
}

export interface Product {
  id: number;
  name: string;
  category: 'Equipamentos' | 'T-Shirts' | 'Casacos' | 'Bonés' | 'Mochilas' | 'Merchandising';
  price: number;
  sizes: string[];
}

export type PaymentStatus = 'Pendente' | 'Pago' | 'Em atraso' | 'Cancelado' | 'Reembolsado';

export interface MembershipPayment {
  id: number;
  period: string;
  amount: number;
  dueDate: string;
  paymentDate?: string;
  status: PaymentStatus;
  paymentMethod?: 'MB WAY' | 'Referência Multibanco' | 'Cartão' | 'Débito direto';
  receiptNumber?: string;
}

export interface Member {
  memberNumber: string;
  name: string;
  email: string;
  phone: string;
  category: string;
  status: 'Ativo' | 'Pendente' | 'Suspenso';
  registrationDate: string;
  dependents: { name: string; relation: string; memberNumber: string; status: string }[];
}

/** Conta de acesso à área reservada: uma pessoa, com ou sem perfil de sócio. */
export interface Account {
  id: string;
  name: string;
  email: string;
  /** null = não é sócio (ex.: atleta ou encarregado sem quota de sócio) */
  member: Member | null;
  /** Papéis no backoffice (vazio = utilizador normal do site); configuráveis no backoffice */
  roles: string[];
  /** Permissões efetivas dos papéis (ver core/permissions.ts) */
  permissions: Permission[];
}

export interface SearchResult {
  type: 'Página' | 'Notícia' | 'Evento' | 'Modalidade' | 'Equipa' | 'Documento';
  title: string;
  summary: string;
  link: string;
}
