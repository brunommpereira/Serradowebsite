import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as DATA from '../data/mock-data';
import { ClubEvent, NewsArticle, NewsCategory, EventKind, Sponsor, SportSlug } from '../models';
import { ApiClient } from '../api/api-client';
import { CMS_TYPES, CmsEntry, CmsRevision, CmsStatus, CmsType, paragraphs } from './cms.models';

const STORAGE_KEY = 'sfc.cms.v1';

interface DemoState {
  entries: Record<CmsType, CmsEntry[]>;
  revisions: { type: CmsType; entryId: number; rev: CmsRevision; data: CmsEntry }[];
  seq: number;
}

/**
 * Conteúdo do CMS (notícias, eventos, páginas, parceiros) — fonte única do site.
 *
 * - Modo demonstração: começa com os conteúdos de `core/data` e guarda as
 *   edições do backoffice no localStorage (só no browser de quem edita).
 * - Modo API: carrega o conteúdo publicado do middleware ao arrancar (ver
 *   `provideCmsInit`) e o backoffice escreve através da API.
 */
@Injectable({ providedIn: 'root' })
export class CmsStore {
  private readonly api = inject(ApiClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<DemoState>(this.restore());

  /** Todos os conteúdos (todos os estados no modo demo; só publicados no modo API). */
  entries(type: CmsType) {
    return this.state().entries[type];
  }

  published(type: CmsType): CmsEntry[] {
    return this.entries(type).filter((e) => e.status === 'published');
  }

  readonly news = computed<NewsArticle[]>(() =>
    this.state()
      .entries.news.filter((e) => e.status === 'published')
      .map(toNews)
      .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate)),
  );
  readonly events = computed<ClubEvent[]>(() =>
    this.state()
      .entries.events.filter((e) => e.status === 'published')
      .map(toEvent)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );
  readonly partners = computed<Sponsor[]>(() => this.state().entries.partners.filter((e) => e.status === 'published').map(toPartner));

  page(slug: string): { title: string; summary: string; paragraphs: string[]; updatedAt: string } | null {
    const p = this.published('pages').find((e) => e.slug === slug);
    return p ? { title: String(p['title']), summary: String(p['summary'] ?? ''), paragraphs: paragraphs(p['body']), updatedAt: p.updatedAt } : null;
  }

  // ---------------------------------------------------------------- modo API
  /**
   * Carrega o conteúdo publicado do middleware (chamado antes do arranque e no
   * pré-render do build). Se a API falhar, o site continua a funcionar (sem
   * conteúdo do CMS) em vez de partir.
   */
  async loadFromApi(asEditor = false) {
    if (!this.api.enabled) return;
    try {
      await this.fetchAll(asEditor);
    } catch (e) {
      console.warn('[CMS] Conteúdo indisponível:', (e as Error).message);
    }
  }

  private async fetchAll(asEditor: boolean) {
    const types: CmsType[] = ['news', 'events', 'pages', 'partners'];
    // Editor: todos os estados (para o backoffice); restantes: só o conteúdo público
    const lists = asEditor ? await Promise.all(types.map((t) => this.api.get<{ items: CmsEntry[] }>(`/admin/cms/${t}`, { limit: 200 }).catch(() => null))) : [null];
    if (lists.some((l) => l === null)) {
      const [news, events, partners, pages] = await Promise.all([
        this.api.get<NewsArticle[]>('/content/news'),
        this.api.get<ClubEvent[]>('/content/events'),
        this.api.get<Sponsor[]>('/content/partners'),
        this.api.get<{ slug: string; title: string; summary: string; paragraphs: string[]; updatedAt: string }[]>('/content/pages'),
      ]);
      this.state.set({
        entries: {
          news: news.map(fromNews),
          events: events.map(fromEvent),
          partners: partners.map(fromPartner),
          pages: pages.map((p, i) => ({ id: i + 1, slug: p.slug, title: p.title, summary: p.summary, body: p.paragraphs.join('\n\n'), ...published(p.updatedAt) })),
        },
        revisions: [],
        seq: 0,
      });
      return;
    }
    this.state.set({ entries: Object.fromEntries(types.map((t, i) => [t, lists[i]!.items])) as DemoState['entries'], revisions: [], seq: 0 });
  }

  // ---------------------------------------------------------------- escrita (modo demonstração)
  demoSave(type: CmsType, data: Record<string, unknown>, author: string, id?: number): CmsEntry {
    const st = this.state();
    const list = st.entries[type];
    if (list.some((e) => e.slug === data['slug'] && e.id !== id)) throw new Error('Já existe um conteúdo com esse endereço (slug).');
    const now = new Date().toISOString();
    let entry: CmsEntry;
    let seq = st.seq;
    if (id) {
      const current = list.find((e) => e.id === id);
      if (!current) throw new Error('Conteúdo não encontrado');
      entry = { ...current, ...data, updatedAt: now };
    } else {
      seq += 1;
      entry = { ...data, id: seq, status: 'draft', publishedAt: null, updatedAt: now } as CmsEntry;
    }
    this.commit({
      ...st,
      seq,
      entries: { ...st.entries, [type]: id ? list.map((e) => (e.id === id ? entry : e)) : [entry, ...list] },
      revisions: [...st.revisions, this.revision(type, entry, author, seq)],
    });
    return entry;
  }

  demoSetStatus(type: CmsType, id: number, status: CmsStatus): CmsEntry {
    const st = this.state();
    const current = st.entries[type].find((e) => e.id === id);
    if (!current) throw new Error('Conteúdo não encontrado');
    const entry: CmsEntry = {
      ...current,
      status,
      publishedAt: status === 'published' ? (current.publishedAt ?? new Date().toISOString()) : current.publishedAt,
      updatedAt: new Date().toISOString(),
    };
    this.commit({ ...st, entries: { ...st.entries, [type]: st.entries[type].map((e) => (e.id === id ? entry : e)) } });
    return entry;
  }

  demoRemove(type: CmsType, id: number) {
    const st = this.state();
    this.commit({ ...st, entries: { ...st.entries, [type]: st.entries[type].filter((e) => e.id !== id) } });
  }

  demoRevisions(type: CmsType, id: number): CmsRevision[] {
    return this.state()
      .revisions.filter((r) => r.type === type && r.entryId === id)
      .map((r) => r.rev)
      .reverse();
  }

  demoRestore(type: CmsType, id: number, revId: number, author: string): CmsEntry {
    const rev = this.state().revisions.find((r) => r.type === type && r.entryId === id && r.rev.id === revId);
    if (!rev) throw new Error('Versão não encontrada');
    const fields = Object.fromEntries(CMS_TYPES[type].fields.map((f) => [f.key, rev.data[f.key]]));
    return this.demoSave(type, fields, author, id);
  }

  /** Repõe o conteúdo de demonstração inicial. */
  demoReset() {
    this.commit(initialState());
  }

  private revision(type: CmsType, entry: CmsEntry, author: string, seq: number) {
    const titleKey = CMS_TYPES[type].titleKey;
    return {
      type,
      entryId: entry.id,
      data: { ...entry },
      rev: { id: seq * 1000 + this.state().revisions.length + 1, createdAt: entry.updatedAt, author, status: entry.status, title: String(entry[titleKey]) },
    };
  }

  private commit(next: DemoState) {
    this.state.set(next);
    if (!this.isBrowser || this.api.enabled) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* sem armazenamento: só em memória */
    }
  }

  private restore(): DemoState {
    // Modo API: começa vazio (o conteúdo real vem do middleware), nunca com dados de demonstração
    if (this.api.enabled) return { entries: { news: [], events: [], pages: [], partners: [] }, revisions: [], seq: 0 };
    if (this.isBrowser) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as DemoState;
      } catch {
        /* dados corrompidos: volta ao inicial */
      }
    }
    return initialState();
  }
}

// ------------------------------------------------------------------ conversões CMS ⇄ site
export const toNews = (e: CmsEntry): NewsArticle => ({
  id: e.id,
  slug: e.slug,
  title: String(e['title']),
  category: e['category'] as NewsCategory,
  summary: String(e['summary'] ?? ''),
  content: paragraphs(e['body']),
  author: String(e['author'] || 'Comunicação Serrado FC'),
  publicationDate: String(e.publishedAt ?? e.updatedAt).slice(0, 10),
});

export const toEvent = (e: CmsEntry): ClubEvent => ({
  id: e.id,
  slug: e.slug,
  title: String(e['title']),
  kind: e['kind'] as EventKind,
  sportSlug: (e['sportSlug'] as SportSlug | null) ?? undefined,
  summary: String(e['summary'] ?? ''),
  description: paragraphs(e['body']),
  date: String(e['startsAt']),
  endTime: (e['endTime'] as string | null) ?? undefined,
  location: String(e['location']),
  capacity: Number(e['capacity'] ?? 0),
  registered: Number(e['registered'] ?? 0),
  price: Number(e['price'] ?? 0),
  memberPrice: e['memberPrice'] === null || e['memberPrice'] === undefined ? undefined : Number(e['memberPrice']),
  registrationRequired: !!e['registrationRequired'],
  askShirtSize: !!e['askShirtSize'],
});

export const toPartner = (e: CmsEntry): Sponsor => ({
  id: e.id,
  name: String(e['name']),
  category: e['category'] as Sponsor['category'],
  website: String(e['website'] ?? ''),
  description: String(e['description'] ?? ''),
  active: e.status === 'published',
});

const published = (date: string) => ({ status: 'published' as const, publishedAt: date, updatedAt: date });

function fromNews(n: NewsArticle): CmsEntry {
  return { id: n.id, slug: n.slug, title: n.title, category: n.category, summary: n.summary, body: n.content.join('\n\n'), author: n.author, coverUrl: null, ...published(n.publicationDate) };
}

function fromEvent(e: ClubEvent): CmsEntry {
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    kind: e.kind,
    sportSlug: e.sportSlug ?? null,
    summary: e.summary,
    body: e.description.join('\n\n'),
    startsAt: e.date,
    endTime: e.endTime ?? null,
    location: e.location,
    capacity: e.capacity,
    registered: e.registered,
    price: e.price,
    memberPrice: e.memberPrice ?? null,
    registrationRequired: e.registrationRequired,
    askShirtSize: e.askShirtSize,
    ...published('2026-09-01T09:00:00Z'),
  };
}

function fromPartner(s: Sponsor): CmsEntry {
  return { id: s.id, slug: s.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: s.name, category: s.category, website: s.website, description: s.description, ...published('2026-09-01T09:00:00Z'), status: s.active ? 'published' : 'archived' };
}

const DEMO_PAGES: CmsEntry[] = [
  {
    id: 1,
    slug: 'regulamento-formacao',
    title: 'Regulamento interno da formação',
    summary: 'Regras de funcionamento dos escalões de formação do Serrado FC.',
    body: 'Os atletas devem chegar 10 minutos antes do início dos treinos, com o equipamento do clube.\n\nAs faltas devem ser comunicadas na Área de Atletas («Não vou») até à véspera.\n\nO clube promove o respeito por colegas, treinadores, árbitros e adversários.',
    ...published('2026-09-01T09:00:00Z'),
  },
];

function initialState(): DemoState {
  const news = DATA.NEWS.map(fromNews);
  const draft: CmsEntry = {
    id: 1000,
    slug: 'rascunho-gala-anual',
    title: 'Gala anual do clube: reserva a data',
    category: 'Clube',
    summary: 'A gala de aniversário regressa em abril.',
    body: 'Texto em preparação.',
    author: 'Comunicação Serrado FC',
    coverUrl: null,
    status: 'draft',
    publishedAt: null,
    updatedAt: '2026-10-06T16:20:00Z',
  };
  return {
    entries: { news: [draft, ...news], events: DATA.EVENTS.map(fromEvent), pages: DEMO_PAGES, partners: DATA.SPONSORS.map(fromPartner) },
    revisions: [],
    seq: 1000,
  };
}
