import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export const SITE_URL = 'https://www.serradofc.pt';
const DEFAULT_IMAGE = `${SITE_URL}/brand/icon-512.png`;

export interface PageSeo {
  title: string;
  description: string;
  /** Caminho a partir da raiz, ex.: /modalidades/futsal */
  path: string;
  image?: string | null;
  type?: 'website' | 'article';
}

/** Title, meta description, Open Graph e canonical por página (secção 38). */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private crumbsOwner: object | null = null;

  set(page: PageSeo) {
    const fullTitle = page.path === '/' ? `Serrado FC | ${page.title}` : `${page.title} | Serrado FC`;
    const url = `${SITE_URL}${page.path === '/' ? '' : page.path}`;
    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: page.type ?? 'website' });
    this.meta.updateTag({ property: 'og:image', content: absolute(page.image) ?? DEFAULT_IMAGE });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });

    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /** Migalhas de pão para os motores de busca (JSON-LD BreadcrumbList), a partir das mesmas da página. */
  breadcrumbs(crumbs: { label: string; link?: string }[], currentPath: string, owner: object) {
    this.crumbsOwner = owner;
    const items = [{ label: 'Início', link: '/' }, ...crumbs];
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.label,
        item: `${SITE_URL}${(c.link ?? (i === items.length - 1 ? currentPath : '/')).replace(/^\/$/, '')}`,
      })),
    };
    let el = this.doc.head.querySelector<HTMLScriptElement>('script#ld-breadcrumbs');
    if (!el) {
      el = this.doc.createElement('script');
      el.setAttribute('type', 'application/ld+json');
      el.setAttribute('id', 'ld-breadcrumbs');
      this.doc.head.appendChild(el);
    }
    // JSON-LD é dados, não código: o texto vai escapado para não fechar a tag
    el.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  }

  /** Só quem as pôs as tira (na troca de página, a nova pode já as ter posto antes de a antiga sair). */
  clearBreadcrumbs(owner: object) {
    if (this.crumbsOwner !== owner) return;
    this.crumbsOwner = null;
    this.doc.head.querySelector('script#ld-breadcrumbs')?.remove();
  }
}

/** Imagens do CMS vêm com caminho relativo (/api/v1/media/…): o Open Graph exige endereço completo. */
function absolute(src: string | undefined | null): string | undefined {
  if (!src) return undefined;
  return src.startsWith('/') ? `${SITE_URL}${src}` : src;
}
