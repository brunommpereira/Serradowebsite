import { inject, Injectable } from '@angular/core';
import {
  AgendaItem,
  AthleticsResult,
  Board,
  ClubDocument,
  ClubEvent,
  ClubRecord,
  Coach,
  FaqItem,
  GalleryItem,
  Match,
  MembershipCategory,
  NewsArticle,
  SearchResult,
  Sport,
  SportSlug,
  Standing,
  Team,
} from '../models';
import { CmsStore } from '../cms/cms-store';
import { SiteStore } from '../site/site-store';
import { ShopProduct, SportBlock } from '../site/site.models';

const SPORT_SLUGS: SportSlug[] = ['atletismo', 'futsal', 'rugby', 'formacao', 'escola-de-desporto'];
const SPORT_ICON: Record<SportSlug, Sport['icon']> = { atletismo: 'run', futsal: 'ball', rugby: 'rugby', formacao: 'star', 'escola-de-desporto': 'school' };

/** Contactos e dados do clube (bloco «Contactos e redes sociais»), no formato que as páginas usam. */
export interface ClubInfo {
  name: string;
  shortName: string;
  founded: string;
  tagline: string;
  address: string;
  postalCode: string;
  locality: string;
  phone: string;
  phone2: string;
  email: string;
  nipc: string;
  hours: { days: string; time: string }[];
  social: { facebook: string; instagram: string; youtube: string };
  map: { lat: number; lng: number };
}

export interface Product extends ShopProduct {
  id: number;
}

/**
 * Ponto único de acesso ao conteúdo do site.
 *
 * - Notícias, eventos, páginas e parceiros: CMS (CmsStore).
 * - Contactos, clube, modalidades, jogos, provas, loja, galeria…: conteúdos do site (SiteStore),
 *   editados em Backoffice → Conteúdos do site, com o conteúdo original enquanto não forem editados.
 */
@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly cms = inject(CmsStore);
  private readonly site = inject(SiteStore);

  /** Contactos e dados do clube (sempre atuais: lê o bloco em cada acesso). */
  get club(): ClubInfo {
    const c = this.site.data('contacts');
    return {
      name: c.name,
      shortName: c.shortName,
      founded: '1978-04-29',
      tagline: c.tagline,
      address: c.address,
      postalCode: c.postalCode,
      locality: c.locality,
      phone: c.phone,
      phone2: c.phone2,
      email: c.email,
      nipc: c.nipc,
      hours: c.hours,
      social: { facebook: c.facebook, instagram: c.instagram, youtube: c.youtube },
      map: { lat: Number(c.mapLat), lng: Number(c.mapLng) },
    };
  }

  /** Texto, história, valores e instalações da página do Clube. */
  clubPage() {
    return this.site.data('club');
  }

  private sportBlock(slug: SportSlug): SportBlock {
    return this.site.data(`sport-${slug}`);
  }

  private allSports(): Sport[] {
    return SPORT_SLUGS.map((slug, i) => {
      const b = this.sportBlock(slug);
      return {
        id: i + 1,
        slug,
        name: b.name,
        tagline: b.tagline,
        description: b.description,
        highlights: b.highlights,
        icon: SPORT_ICON[slug],
        active: b.active,
        featured: b.featured,
        trainings: b.trainings,
        contactEmail: b.contactEmail,
        external: b.externalUrl ? { url: b.externalUrl, name: b.externalName || b.name, instagram: b.instagram || undefined, links: b.links } : undefined,
        levels: b.levels.length ? b.levels : undefined,
      };
    });
  }

  sports(): Sport[] {
    return this.allSports().filter((s) => s.active);
  }

  sport(slug: string): Sport | undefined {
    return this.allSports().find((s) => s.slug === slug);
  }

  teams(sport?: SportSlug): Team[] {
    let id = 0;
    return SPORT_SLUGS.filter((slug) => !sport || slug === sport).flatMap((slug) =>
      this.sportBlock(slug).teams.map((t) => ({ id: ++id, sportSlug: slug, season: t.season, name: t.name, category: t.category, coach: t.coach })),
    );
  }

  coaches(sport: SportSlug): Coach[] {
    return this.sportBlock(sport).coaches.map((c) => ({ ...c, sportSlug: sport }));
  }

  matches(): Match[] {
    return this.site
      .data('matches')
      .items.map<Match>((m, i) => ({
        id: i + 1,
        sportSlug: m.sportSlug,
        team: m.team,
        opponent: m.opponent,
        date: m.date,
        venue: m.venue,
        homeAway: m.homeAway,
        competition: m.competition,
        season: m.season,
        status: m.status,
        scoreHome: m.scoreHome ?? undefined,
        scoreAway: m.scoreAway ?? undefined,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
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

  private athleticsAll(): AthleticsResult[] {
    return this.site
      .data('athletics')
      .items.map((r, i) => ({ id: i + 1, ...r }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  athleticsResults(): AthleticsResult[] {
    return this.athleticsAll().filter((r) => r.highlights.length);
  }

  standings(sport?: SportSlug): Standing[] {
    return this.site
      .data('standings')
      .tables.filter((t) => !sport || t.sportSlug === sport)
      .map((t) => ({
        sportSlug: t.sportSlug,
        competition: t.competition,
        rows: t.rows
          .map((line) => line.split('|').map((x) => x.trim()))
          .filter((cols) => cols[0])
          .map((cols, i) => ({ pos: i + 1, team: cols[0], played: Number(cols[1]) || 0, points: Number(cols[2]) || 0 })),
      }));
  }

  clubRecords(): ClubRecord[] {
    return this.site.data('records').items;
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
      ...this.athleticsAll().filter((r) => r.date >= now).map<AgendaItem>((r) => ({
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
      ...this.site.data('agenda').items.map<AgendaItem>((a, i) => ({
        id: `o${i}`,
        date: a.date,
        type: a.type as AgendaItem['type'],
        sportSlug: a.sportSlug ?? undefined,
        title: a.title,
        location: a.location,
        link: a.link || '/agenda',
      })),
    ];
    return items.filter((i) => i.date >= now).sort((a, b) => a.date.localeCompare(b.date));
  }

  membershipCategories(): MembershipCategory[] {
    return this.site.data('membership').categories.map((c) => ({ id: slug(c.name), ...c, monthly: Number(c.monthly) || 0, yearly: Number(c.yearly) || 0 }));
  }

  membershipBenefits(): { title: string; text: string }[] {
    return this.site.data('membership').benefits;
  }

  membershipFaq(): FaqItem[] {
    return this.site.data('membership').faq;
  }

  /** Órgãos sociais, agrupados pela ordem em que aparecem na lista. */
  boards(): Board[] {
    const out: Board[] = [];
    for (const m of this.site.data('boards').members) {
      let b = out.find((x) => x.name === m.group);
      if (!b) out.push((b = { name: m.group, members: [] }));
      b.members.push({ role: m.role, name: m.name });
    }
    return out;
  }

  boardsNote(): string {
    return this.site.data('boards').note;
  }

  documents(): ClubDocument[] {
    return this.site.data('documents').items.map((d) => ({ ...d, category: d.category as ClubDocument['category'], url: d.url ?? '' }));
  }

  sponsors() {
    return this.cms.partners();
  }

  gallery(): (GalleryItem & { imageUrl: string | null; videoUrl: string | null })[] {
    return this.site
      .data('gallery')
      .items.map((g, i) => ({ id: i + 1, ...g, category: g.category as GalleryItem['category'], kind: g.kind as GalleryItem['kind'] }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  shopNotice(): string {
    return this.site.data('shop').notice;
  }

  products(): Product[] {
    return this.site.data('shop').products.map((p, i) => ({ id: i + 1, ...p }));
  }

  communityProjects(): { title: string; text: string }[] {
    return this.site.data('community').projects;
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
      ...this.sports().filter((s) => hit(s.name, s.tagline, s.description)).map<SearchResult>((s) => ({
        type: 'Modalidade',
        title: s.name,
        summary: s.tagline,
        link: `/modalidades/${s.slug}`,
      })),
      ...this.teams().filter((t) => hit(t.name, t.category, t.sportSlug)).map<SearchResult>((t) => ({
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
      ...this.documents().filter((d) => hit(d.title, d.category)).map<SearchResult>((d) => ({
        type: 'Documento',
        title: d.title,
        summary: `${d.category} · ${d.year}`,
        link: '/clube#transparencia',
      })),
    ];
  }
}

/** Número para ligações tel: (sem espaços nem pontuação, mantém o +). */
export function tel(phone: string) {
  return phone.replace(/[^\d+]/g, '');
}

function slug(s: string) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
