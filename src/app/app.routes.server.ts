import { RenderMode, ServerRoute } from '@angular/ssr';
import { EVENTS, NEWS, SPORTS } from './core/data/mock-data';

/**
 * Todas as páginas públicas são pré-geradas em HTML estático (SEO + performance).
 * A Área de Sócio é renderizada só no browser (dados pessoais, sessão).
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'area-socio', renderMode: RenderMode.Client },
  { path: 'area-socio/entrar', renderMode: RenderMode.Client },
  { path: 'entrar', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'paginas/:slug', renderMode: RenderMode.Client },
  { path: 'area-atletas', renderMode: RenderMode.Client },
  {
    path: 'modalidades/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => SPORTS.map((s) => ({ slug: s.slug })),
  },
  {
    path: 'noticias/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => NEWS.map((n) => ({ slug: n.slug })),
  },
  {
    path: 'eventos/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => EVENTS.map((e) => ({ slug: e.slug })),
  },
  { path: '**', renderMode: RenderMode.Prerender },
];
