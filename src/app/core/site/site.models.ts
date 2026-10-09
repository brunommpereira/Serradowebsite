/**
 * Conteúdos do site com estrutura própria (blocos). Cada bloco é um documento JSON editado no
 * backoffice (Backoffice → Conteúdos do site). O editor é gerado a partir de BLOCKS (site-blocks.ts);
 * enquanto um bloco não é editado, o site mostra o conteúdo original (site-defaults.ts).
 * O backend só aceita as chaves listadas em services/serrado/backend/routes/site.py.
 */
import { SportSlug } from '../models';

export type BlockFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'date'
  | 'datetime'
  | 'url'
  | 'email'
  | 'image'
  /** documento em PDF (biblioteca de imagens e documentos) */
  | 'file'
  /** lista de textos curtos, um por linha */
  | 'lines'
  /** lista de elementos com os seus próprios campos */
  | 'list';

export interface BlockField {
  key: string;
  label: string;
  kind: BlockFieldKind;
  required?: boolean;
  options?: readonly string[];
  /** etiquetas a mostrar para as opções (por omissão, a própria opção) */
  optionLabels?: Record<string, string>;
  hint?: string;
  max?: number;
  wide?: boolean;
  /** só para 'list' */
  fields?: BlockField[];
  /** só para 'list': texto da linha resumida de cada elemento */
  summary?: (item: Record<string, unknown>) => string;
  /** só para 'list': nome de um elemento («jogo», «produto»…) */
  singular?: string;
  /** só para 'list': elementos novos entram no início (listas por data, mais recentes primeiro) */
  newFirst?: boolean;
}

export interface BlockDef {
  key: string;
  label: string;
  group: string;
  description: string;
  icon: string;
  /** página do site onde aparece */
  publicPath: string;
  fields: BlockField[];
}

export interface ContactsBlock {
  name: string;
  shortName: string;
  tagline: string;
  address: string;
  postalCode: string;
  locality: string;
  phone: string;
  phone2: string;
  email: string;
  nipc: string;
  hours: { days: string; time: string }[];
  facebook: string;
  instagram: string;
  youtube: string;
  mapLat: number;
  mapLng: number;
}

export interface ClubBlock {
  heroSubtitle: string;
  introTitle: string;
  intro: string;
  timeline: { year: string; title: string; text: string }[];
  mission: string;
  vision: string;
  values: { icon: string; title: string; text: string }[];
  emblem: string;
  facilities: { name: string; text: string; imageUrl: string | null }[];
}

export interface BoardsBlock {
  note: string;
  members: { group: string; role: string; name: string }[];
}

export interface DocumentsBlock {
  items: { title: string; category: string; year: string; url: string | null }[];
}

export interface MembershipBlock {
  categories: {
    name: string;
    description: string;
    monthly: number;
    yearly: number;
    ageRule: string;
  }[];
  benefits: { title: string; text: string }[];
  faq: { q: string; a: string }[];
}

export interface CommunityBlock {
  projects: { title: string; text: string }[];
}

export interface ShopProduct {
  name: string;
  category: string;
  description: string;
  price: number;
  memberPrice: number | null;
  sizes: string[];
  imageUrl: string | null;
  available: boolean;
}

export interface ShopBlock {
  notice: string;
  products: ShopProduct[];
}

export interface GalleryBlock {
  items: {
    title: string;
    category: string;
    date: string;
    kind: string;
    imageUrl: string | null;
    videoUrl: string | null;
  }[];
}

export interface MatchItem {
  sportSlug: SportSlug;
  team: string;
  opponent: string;
  date: string;
  venue: string;
  homeAway: 'casa' | 'fora';
  competition: string;
  season: string;
  status: 'agendado' | 'terminado' | 'adiado';
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface MatchesBlock {
  items: MatchItem[];
}

export interface AthleticsBlock {
  items: { date: string; event: string; location: string; highlights: string[]; season: string }[];
}

export interface StandingsBlock {
  tables: { sportSlug: SportSlug; competition: string; rows: string[] }[];
}

export interface RecordsBlock {
  items: { discipline: string; athlete: string; mark: string; year: string }[];
}

export interface AgendaBlock {
  items: {
    date: string;
    type: string;
    title: string;
    location: string;
    sportSlug: SportSlug | null;
    link: string;
  }[];
}

export interface SportBlock {
  name: string;
  tagline: string;
  description: string;
  highlights: string[];
  active: boolean;
  featured: boolean;
  contactEmail: string;
  trainings: { team: string; days: string; time: string; location: string }[];
  teams: { name: string; category: string; coach: string; season: string }[];
  coaches: { name: string; role: string }[];
  levels: { name: string; text: string }[];
  externalUrl: string;
  externalName: string;
  instagram: string;
  links: { label: string; url: string }[];
}

export interface EmailBlock {
  /** **negrito**, *itálico*; uma linha em branco separa parágrafos */
  text: string;
  showLogo: boolean;
  /** imagem da biblioteca; sem imagem usa o emblema do clube */
  logoUrl: string | null;
  logoSize: number;
}

export interface SiteData {
  contacts: ContactsBlock;
  club: ClubBlock;
  boards: BoardsBlock;
  documents: DocumentsBlock;
  membership: MembershipBlock;
  community: CommunityBlock;
  shop: ShopBlock;
  gallery: GalleryBlock;
  matches: MatchesBlock;
  athletics: AthleticsBlock;
  standings: StandingsBlock;
  records: RecordsBlock;
  agenda: AgendaBlock;
  email: EmailBlock;
  'sport-atletismo': SportBlock;
  'sport-futsal': SportBlock;
  'sport-rugby': SportBlock;
  'sport-formacao': SportBlock;
  'sport-escola-de-desporto': SportBlock;
}

export type BlockKey = keyof SiteData;

export interface BlockRevision {
  id: number;
  createdAt: string;
  author: string | null;
  /** true = nesta versão voltou-se ao conteúdo original */
  original: boolean;
}

export interface BlockState {
  key: string;
  /** null = ainda não editado (o site mostra o original) */
  data: Record<string, unknown> | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
