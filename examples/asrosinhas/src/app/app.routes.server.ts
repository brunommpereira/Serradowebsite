import { RenderMode, ServerRoute } from '@angular/ssr';
import { ALL_PRODUCTS } from './core/content';

/** Todas as páginas são pré-geradas em HTML (SEO, rapidez e alojamento estático no GitHub Pages). */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'loja/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => ALL_PRODUCTS.map((p) => ({ slug: p.slug })),
  },
  { path: '**', renderMode: RenderMode.Prerender },
];
