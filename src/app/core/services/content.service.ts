import { inject, Injectable } from '@angular/core';
import * as DATA from '../data/mock-data';
import { AgendaItem, ClubEvent, Match, NewsArticle, SearchResult, Sport, SportSlug } from '../models';
import { CmsStore } from '../cms/cms-store';

/**
 * Ponto único de acesso ao conteúdo do site.
 *
 * Fase 1: lê os dados de demonstração em `core/data/mock-data.ts`.
 * Fase 2+: cada método passa a chamar o endpoint REST equivalente
 * (comentado ao lado), sem alterações nos componentes.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  readonly club = DATA.CLUB;
  /** Notícias, eventos e parceiros vêm do CMS (editados no backoffice). */
  private readonly cms = inject(CmsStore);

  /** GET /api/sports */
  sports(): Sport[] {
    return DATA.SPORTS.filter((s) => s.active);
  }

  /** GET /api/sports/{slug} */
  sport(slug: string): Sport | undefined {
    return DATA.SPORTS.find((s) => s.slug === slug);
  }

  /** GET /api/teams?sport= */
  teams(sport?: SportSlug) {
    return DATA.TEAMS.filter((t) => !sport || t.sportSlug === sport);
  }

  coaches(sport: SportSlug) {
    return DATA.COACHES.filter((c) => c.sportSlug === sport);
  }

  /** GET /api/matches */
  matches(): Match[] {
    return [...DATA.MATCHES].sort((a, b) => a.date.localeCompare(b.date));
  }

  upcomingMatches(sport?: SportSlug, limit = 99): Match[] {
    const now = nowIso();
    return this.matches()
      .filter((m) => m.status === 'agendado' && m.date >= now && (!sport || m.sportSlug === sport))
      .slice(0, limit);
  }

  results(sport?: SportSlug): Match[] {
    return this.matches()
      .filter((m) => m.status === 'terminado' && (!sport || m.sportSlug === sport))
      .reverse();
  }

  athleticsResults() {
    return DATA.ATHLETICS_RESULTS.filter((r) => r.highlights.length);
  }

  standings(sport?: SportSlug) {
    return DATA.STANDINGS.filter((s) => !sport || s.sportSlug === sport);
  }

  clubRecords() {
    return DATA.CLUB_RECORDS;
  }

  /** GET /api/news */
  news(category?: string): NewsArticle[] {
    return [...this.cms.news()]
      .filter((n) => !category || n.category === category)
      .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  }

  /** GET /api/news/{slug} */
  article(slug: string) {
    return this.cms.news().find((n) => n.slug === slug);
  }

  newsCategories() {
    return ['Clube', 'Atletismo', 'Futsal', 'Rugby', 'Formação', 'Comunidade', 'Eventos', 'Parceiros', 'Comunicados'] as const;
  }

  /** GET /api/events */
  events(): ClubEvent[] {
    return [...this.cms.events()].sort((a, b) => a.date.localeCompare(b.date));
  }

  upcomingEvents(): ClubEvent[] {
    const now = nowIso();
    return this.events().filter((e) => e.date >= now);
  }

  event(slug: string) {
    return this.cms.events().find((e) => e.slug === slug);
  }

  /** Agenda agregada: jogos, competições de atletismo, eventos e vida associativa. */
  agenda(): AgendaItem[] {
    const now = nowIso();
    const items: AgendaItem[] = [
      ...this.upcomingMatches().map<AgendaItem>((m) => ({
        id: `m${m.id}`,
        date: m.date,
        type: 'Jogo',
        sportSlug: m.sportSlug,
        title: `${m.team} · ${m.competition}`,
        opponent: m.opponent,
        location: m.venue,
        link: `/modalidades/${m.sportSlug}`,
      })),
      ...DATA.ATHLETICS_RESULTS.filter((r) => r.date >= now).map<AgendaItem>((r) => ({
        id: `a${r.id}`,
        date: r.date,
        type: 'Competição',
        sportSlug: 'atletismo',
        title: r.event,
        location: r.location,
        link: '/modalidades/atletismo',
      })),
      ...this.upcomingEvents().map<AgendaItem>((e) => ({
        id: `e${e.id}`,
        date: e.date,
        type: 'Evento',
        sportSlug: e.sportSlug,
        title: e.title,
        location: e.location,
        link: `/eventos/${e.slug}`,
      })),
      {
        id: 'ag1',
        date: '2026-11-21T15:00',
        type: 'Reunião',
        title: 'Assembleia Geral Ordinária',
        location: 'Sede do Serrado FC',
        link: '/clube#transparencia',
      },
    ];
    return items.filter((i) => i.date >= now).sort((a, b) => a.date.localeCompare(b.date));
  }

  membershipCategories() {
    return DATA.MEMBERSHIP_CATEGORIES;
  }

  membershipBenefits() {
    return DATA.MEMBERSHIP_BENEFITS;
  }

  membershipFaq() {
    return DATA.MEMBERSHIP_FAQ;
  }

  boards() {
    return DATA.BOARDS;
  }

  documents() {
    return DATA.DOCUMENTS;
  }

  sponsors() {
    return this.cms.partners();
  }

  gallery() {
    return DATA.GALLERY;
  }

  products() {
    return DATA.PRODUCTS;
  }

  communityProjects() {
    return DATA.COMMUNITY_PROJECTS;
  }

  /** Pesquisa global (secção 28). Na Fase 7 pode evoluir para pesquisa inteligente. */
  search(query: string): SearchResult[] {
    const q = normalize(query);
    if (q.length < 2) return [];
    const hit = (...fields: string[]) => fields.some((f) => normalize(f).includes(q));

    const pages: SearchResult[] = [
      { type: 'Página', title: 'O Clube', summary: 'História, missão, órgãos sociais, transparência e instalações.', link: '/clube' },
      { type: 'Página', title: 'Ser Sócio', summary: 'Categorias, quotas, benefícios e FAQ.', link: '/socios' },
      { type: 'Página', title: 'Agenda', summary: 'Calendário de jogos, competições e eventos.', link: '/agenda' },
      { type: 'Página', title: 'Resultados', summary: 'Resultados e classificações de todas as modalidades.', link: '/resultados' },
      { type: 'Página', title: 'Parceiros', summary: 'Patrocinadores e como apoiar o clube.', link: '/parceiros' },
      { type: 'Página', title: 'Comunidade', summary: 'Projetos sociais, voluntariado e Descobrir Património.', link: '/comunidade' },
      { type: 'Página', title: 'Contactos', summary: 'Morada, horários, telefone e email.', link: '/contactos' },
      { type: 'Página', title: 'Loja', summary: 'Equipamentos e merchandising do clube.', link: '/loja' },
    ];

    return [
      ...pages.filter((p) => hit(p.title, p.summary)),
      ...DATA.SPORTS.filter((s) => hit(s.name, s.tagline, s.description)).map<SearchResult>((s) => ({
        type: 'Modalidade',
        title: s.name,
        summary: s.tagline,
        link: `/modalidades/${s.slug}`,
      })),
      ...DATA.TEAMS.filter((t) => hit(t.name, t.category, t.sportSlug)).map<SearchResult>((t) => ({
        type: 'Equipa',
        title: `${this.sport(t.sportSlug)?.name} — ${t.name}`,
        summary: `${t.category} · Época ${t.season}`,
        link: `/modalidades/${t.sportSlug}`,
      })),
      ...this.cms.news().filter((n) => hit(n.title, n.summary, n.category)).map<SearchResult>((n) => ({
        type: 'Notícia',
        title: n.title,
        summary: n.summary,
        link: `/noticias/${n.slug}`,
      })),
      ...this.cms.events().filter((e) => hit(e.title, e.summary, e.kind)).map<SearchResult>((e) => ({
        type: 'Evento',
        title: e.title,
        summary: e.summary,
        link: `/eventos/${e.slug}`,
      })),
      ...DATA.DOCUMENTS.filter((d) => hit(d.title, d.category)).map<SearchResult>((d) => ({
        type: 'Documento',
        title: d.title,
        summary: `${d.category} · ${d.year}`,
        link: '/clube#transparencia',
      })),
    ];
  }
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Data/hora local atual no mesmo formato dos dados (AAAA-MM-DDTHH:MM). */
export function nowIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
