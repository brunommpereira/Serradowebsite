import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

/** Loja: catálogo editado no backoffice (Conteúdos do site → Loja); as encomendas seguem pelo formulário de contacto. */
@Component({
  selector: 'sfc-shop',
  imports: [RouterLink, CurrencyPipe, PageHeroComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Loja" title="Loja do clube" subtitle="Equipamentos, t-shirts e merchandising do Serrado FC." [crumbs]="[{ label: 'Loja' }]" />
    <section class="section">
      <div class="container">
        @if (notice) {
          <p class="alert alert--info">
            <sfc-icon name="bag" />
            <span>{{ notice }} <a routerLink="/contactos" [queryParams]="{ assunto: 'Encomendas' }">Fazer uma encomenda</a>.</span>
          </p>
        }
        <ul class="products">
          @for (p of products; track p.id) {
            <li class="card">
              @if (p.imageUrl) {
                <img class="products__img products__photo" [src]="p.imageUrl" [alt]="p.name" loading="lazy" />
              } @else {
                <div class="products__img media-ph"><img src="brand/logo-white.svg" alt="" loading="lazy" /></div>
              }
              <span class="badge">{{ p.category }}</span>
              <h2 class="h-s">{{ p.name }}</h2>
              @if (p.description) {
                <p class="muted">{{ p.description }}</p>
              }
              <p class="products__price">{{ p.price | currency: 'EUR' }}</p>
              @if (p.memberPrice !== null && p.memberPrice !== undefined) {
                <p class="caption"><strong>Sócios:</strong> {{ p.memberPrice | currency: 'EUR' }}</p>
              }
              @if (p.sizes.length) {
                <p class="caption">Tamanhos: {{ p.sizes.join(', ') }}</p>
              }
              @if (p.available) {
                <a class="btn btn--outline btn--block" routerLink="/contactos" [queryParams]="{ assunto: 'Encomendas' }">Encomendar</a>
              } @else {
                <span class="badge badge--neutral">Esgotado</span>
              }
            </li>
          } @empty {
            <li class="muted">Ainda não há produtos.</li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: `
    .alert { margin-bottom: 2rem; }
    .products { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); li { display: grid; gap: 0.5rem; justify-items: start; } h2 { text-transform: none; margin: 0; } p { margin: 0; } }
    .products__img { width: 100%; aspect-ratio: 1; border-radius: var(--radius-s); img { width: 80px; } }
    .products__photo { display: block; object-fit: cover; }
    .products__price { font: 800 1.6rem var(--font-display); color: var(--sfc-blue); }
  `,
})
export class ShopComponent {
  private readonly content = inject(ContentService);
  protected readonly products = this.content.products();
  protected readonly notice = this.content.shopNotice();

  constructor() {
    inject(SeoService).set({ title: 'Loja', description: 'Equipamentos, t-shirts, casacos e merchandising oficial do Serrado FC.', path: '/loja' });
  }
}
