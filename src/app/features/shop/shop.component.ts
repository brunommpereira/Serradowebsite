import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

/** Loja — prevista para a Fase 2 (P2). Nesta fase mostra o catálogo e encaminha encomendas. */
@Component({
  selector: 'sfc-shop',
  imports: [RouterLink, CurrencyPipe, PageHeroComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Loja" title="Loja do clube" subtitle="Equipamentos, t-shirts e merchandising do Serrado FC." [crumbs]="[{ label: 'Loja' }]" />
    <section class="section">
      <div class="container">
        <p class="alert alert--info">
          <sfc-icon name="bag" />
          <span>A loja online abre brevemente. Até lá, as encomendas são feitas na sede ou através do formulário de <a routerLink="/contactos" [queryParams]="{ assunto: 'Encomendas' }">contacto</a>.</span>
        </p>
        <ul class="products">
          @for (p of products; track p.id) {
            <li class="card">
              <div class="products__img media-ph"><img src="brand/logo-white.svg" alt="" loading="lazy" /></div>
              <span class="badge">{{ p.category }}</span>
              <h2 class="h-s">{{ p.name }}</h2>
              <p class="products__price">{{ p.price | currency: 'EUR' }}</p>
              <p class="caption">Tamanhos: {{ p.sizes.join(', ') }}</p>
              <button class="btn btn--outline btn--block" type="button" disabled>Adicionar ao carrinho</button>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: `
    .alert { margin-bottom: 2rem; }
    .products { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); li { display: grid; gap: 0.5rem; justify-items: start; } h2 { text-transform: none; margin: 0; } p { margin: 0; } }
    .products__img { width: 100%; aspect-ratio: 1; border-radius: var(--radius-s); img { width: 80px; } }
    .products__price { font: 800 1.6rem var(--font-display); color: var(--sfc-blue); }
  `,
})
export class ShopComponent {
  protected readonly products = inject(ContentService).products();

  constructor() {
    inject(SeoService).set({ title: 'Loja', description: 'Equipamentos, t-shirts, casacos e merchandising oficial do Serrado FC.', path: '/loja' });
  }
}
