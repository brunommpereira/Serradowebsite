import { RenderMode, ServerRoute } from '@angular/ssr';
import { SPORTS } from './core/data/mock-data';

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
  { path: 'propostas/confirmar', renderMode: RenderMode.Client },
  {
    path: 'modalidades/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => SPORTS.map((s) => ({ slug: s.slug })),
  },
  // Notícias e eventos vêm do CMS (podem ser criados a qualquer momento): renderizados no browser;
  // os endereços entram no sitemap dinâmico (/api/v1/content/sitemap.xml)
  { path: 'noticias/:slug', renderMode: RenderMode.Client },
  { path: 'eventos/:slug', renderMode: RenderMode.Client },
  // Endereços antigos: o servidor (Caddy) responde com 301
  { path: 'termos', renderMode: RenderMode.Client },
  { path: 'modalidades/escola-de-desporto', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
