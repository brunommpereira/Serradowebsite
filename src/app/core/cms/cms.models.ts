/**
 * CMS — tipos de conteúdo e campos editáveis. Espelha o backend
 * (services/backend/src/routes/cms.ts): o editor do backoffice é gerado
 * a partir destas definições.
 */
export type CmsType = 'news' | 'events' | 'pages' | 'partners';
export type CmsStatus = 'draft' | 'published' | 'archived';

export interface CmsEntry {
  id: number;
  slug: string;
  status: CmsStatus;
  publishedAt: string | null;
  updatedAt: string;
  [field: string]: unknown;
}

export interface CmsRevision {
  id: number;
  createdAt: string;
  author: string | null;
  status: string;
  title: string;
}

export type CmsFieldKind = 'text' | 'textarea' | 'markdown' | 'select' | 'number' | 'checkbox' | 'datetime' | 'time' | 'url';

export interface CmsField {
  key: string;
  label: string;
  kind: CmsFieldKind;
  required?: boolean;
  options?: readonly string[];
  hint?: string;
  max?: number;
  /** ocupa a largura toda no formulário */
  wide?: boolean;
}

export interface CmsTypeDef {
  type: CmsType;
  label: string;
  singular: string;
  /** campo usado como título nas listas */
  titleKey: 'title' | 'name';
  icon: string;
  fields: CmsField[];
  /** página pública do conteúdo (para «Ver no site») */
  publicPath?: (e: CmsEntry) => string;
}

export const NEWS_CATEGORIES = ['Clube', 'Atletismo', 'Futsal', 'Rugby', 'Formação', 'Comunidade', 'Eventos', 'Parceiros', 'Comunicados'] as const;
export const EVENT_KINDS = ['Torneio', 'Caminhada', 'Corrida', 'Solidário', 'Convívio', 'Crianças'] as const;
export const PARTNER_CATEGORIES = ['Patrocinador Principal', 'Patrocinador', 'Parceiro', 'Parceiro Institucional'] as const;
export const SPORT_SLUGS = ['atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto'] as const;

const SLUG: CmsField = { key: 'slug', label: 'Endereço (slug)', kind: 'text', required: true, max: 120, hint: 'Letras minúsculas, números e hífenes. Gerado a partir do título.' };
const BODY: CmsField = { key: 'body', label: 'Texto', kind: 'markdown', wide: true, hint: 'Separa os parágrafos com uma linha em branco.' };

export const CMS_TYPES: Record<CmsType, CmsTypeDef> = {
  news: {
    type: 'news',
    label: 'Notícias',
    singular: 'notícia',
    titleKey: 'title',
    icon: 'file',
    publicPath: (e) => `/noticias/${e.slug}`,
    fields: [
      { key: 'title', label: 'Título', kind: 'text', required: true, max: 200, wide: true },
      SLUG,
      { key: 'category', label: 'Categoria', kind: 'select', required: true, options: NEWS_CATEGORIES },
      { key: 'summary', label: 'Resumo', kind: 'textarea', max: 400, wide: true, hint: 'Aparece nas listas e nas partilhas.' },
      BODY,
      { key: 'coverUrl', label: 'Imagem de capa (URL)', kind: 'url', max: 500 },
      { key: 'author', label: 'Autor', kind: 'text', max: 120 },
    ],
  },
  events: {
    type: 'events',
    label: 'Eventos',
    singular: 'evento',
    titleKey: 'title',
    icon: 'calendar',
    publicPath: (e) => `/eventos/${e.slug}`,
    fields: [
      { key: 'title', label: 'Título', kind: 'text', required: true, max: 200, wide: true },
      SLUG,
      { key: 'kind', label: 'Tipo', kind: 'select', required: true, options: EVENT_KINDS },
      { key: 'startsAt', label: 'Início', kind: 'datetime', required: true },
      { key: 'endTime', label: 'Fim (hora)', kind: 'time' },
      { key: 'location', label: 'Local', kind: 'text', required: true, max: 200 },
      { key: 'sportSlug', label: 'Modalidade', kind: 'select', options: SPORT_SLUGS },
      { key: 'summary', label: 'Resumo', kind: 'textarea', max: 400, wide: true },
      BODY,
      { key: 'capacity', label: 'Lotação', kind: 'number' },
      { key: 'price', label: 'Preço (€)', kind: 'number' },
      { key: 'memberPrice', label: 'Preço sócio (€)', kind: 'number' },
      { key: 'registrationRequired', label: 'Exige inscrição', kind: 'checkbox' },
      { key: 'askShirtSize', label: 'Pedir tamanho de t-shirt', kind: 'checkbox' },
    ],
  },
  pages: {
    type: 'pages',
    label: 'Páginas',
    singular: 'página',
    titleKey: 'title',
    icon: 'home',
    publicPath: (e) => `/paginas/${e.slug}`,
    fields: [
      { key: 'title', label: 'Título', kind: 'text', required: true, max: 200, wide: true },
      SLUG,
      { key: 'summary', label: 'Descrição (SEO)', kind: 'textarea', max: 400, wide: true },
      BODY,
    ],
  },
  partners: {
    type: 'partners',
    label: 'Parceiros',
    singular: 'parceiro',
    titleKey: 'name',
    icon: 'heart',
    publicPath: () => '/parceiros',
    fields: [
      { key: 'name', label: 'Nome', kind: 'text', required: true, max: 200, wide: true },
      SLUG,
      { key: 'category', label: 'Categoria', kind: 'select', required: true, options: PARTNER_CATEGORIES },
      { key: 'website', label: 'Site', kind: 'url', max: 300 },
      { key: 'description', label: 'Descrição', kind: 'textarea', max: 2000, wide: true },
    ],
  },
};

export const STATUS_LABEL: Record<CmsStatus, string> = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' };

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

/** Texto do CMS → parágrafos (linha em branco separa parágrafos). */
export function paragraphs(body: unknown): string[] {
  return String(body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Valores por omissão de um conteúdo novo. */
export function emptyEntry(type: CmsType): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of CMS_TYPES[type].fields) {
    out[f.key] = f.kind === 'checkbox' ? false : f.kind === 'number' ? (f.key === 'memberPrice' ? null : 0) : f.kind === 'select' && !f.required ? null : '';
  }
  if (type === 'news') out['author'] = 'Comunicação Serrado FC';
  return out;
}
