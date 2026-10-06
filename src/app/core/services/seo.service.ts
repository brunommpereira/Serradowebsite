import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export const SITE_URL = 'https://serradofc.pt';
const DEFAULT_IMAGE = `${SITE_URL}/brand/icon-512.png`;

export interface PageSeo {
  title: string;
  description: string;
  /** Caminho a partir da raiz, ex.: /modalidades/futsal */
  path: string;
  image?: string;
  type?: 'website' | 'article';
}

/** Title, meta description, Open Graph e canonical por página (secção 38). */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  set(page: PageSeo) {
    const fullTitle = page.path === '/' ? `Serrado FC | ${page.title}` : `${page.title} | Serrado FC`;
    const url = `${SITE_URL}${page.path === '/' ? '' : page.path}`;
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: page.type ?? 'website' });
    this.meta.updateTag({ property: 'og:image', content: page.image ?? DEFAULT_IMAGE });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });

    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}
