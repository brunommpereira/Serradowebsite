import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ORG, SITE_URL } from './content';

/** Título, descrição e partilha (Open Graph) de cada página, gerados já no HTML pré-renderizado. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  set(p: { title: string; description: string; image?: string }) {
    const full =
      p.title === ORG.name
        ? `${ORG.name} · Próteses mamárias artesanais`
        : `${p.title} · ${ORG.name}`;
    this.title.setTitle(full);
    this.meta.updateTag({ name: 'description', content: p.description });
    this.meta.updateTag({ property: 'og:title', content: full });
    this.meta.updateTag({ property: 'og:description', content: p.description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    if (p.image) this.meta.updateTag({ property: 'og:image', content: SITE_URL + p.image });
  }
}
