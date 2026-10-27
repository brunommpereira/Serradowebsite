import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ALL_PRODUCTS, POLICIES } from '../core/content';
import { SeoService } from '../core/seo.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { ProductCardComponent } from '../shared/product-card.component';

type Filter = 'todos' | 'soutien' | 'merch';

@Component({
  selector: 'ar-shop',
  imports: [IconComponent, PageHeadComponent, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      title="Cada compra envia mais Rosinhas."
      lead="Soutiens para prótese, feitos com a Simel, e merchandising d’As Rosinhas. O valor ajuda a continuar a enviar as Rosinhas gratuitamente."
      [crumbs]="[{ label: 'Loja solidária' }]"
    />
    <section class="section shop">
      <div class="container">
        <div class="bar">
          <div class="chips" role="group" aria-label="Filtrar artigos">
            @for (f of filters; track f.id) {
              <button
                type="button"
                class="chip"
                [attr.aria-pressed]="filter() === f.id"
                (click)="filter.set(f.id)"
              >
                {{ f.label }} <span class="n">{{ count(f.id) }}</span>
              </button>
            }
          </div>
          <p class="bar__note" aria-live="polite">{{ list().length }} artigos</p>
        </div>
        <div class="grid">
          @for (p of list(); track p.slug) {
            <ar-product-card [product]="p" />
          }
        </div>

        <div class="policies">
          <div>
            <ar-icon name="truck" size="22" />
            <h3>Entrega</h3>
            <p>{{ policies.delivery }}</p>
          </div>
          <div>
            <ar-icon name="refresh" size="22" />
            <h3>Trocas</h3>
            <p>{{ policies.returns }}</p>
          </div>
          <div>
            <ar-icon name="info" size="22" />
            <h3>Pagamento</h3>
            <p>{{ policies.payment }}</p>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    .shop {
      padding-top: 1rem;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.8rem;
    }
    .bar__note {
      margin: 0;
      color: var(--color-muted);
      font-size: 0.92rem;
    }
    .n {
      opacity: 0.7;
      font-size: 0.85em;
      margin-left: 0.25rem;
    }
    .grid {
      display: grid;
      gap: 1.4rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
    }
    .policies {
      margin-top: clamp(3rem, 7vw, 5rem);
      display: grid;
      gap: 1.2rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
      > div {
        background: var(--color-surface);
        border-radius: var(--radius-l);
        padding: 1.5rem;
        box-shadow: var(--shadow-s);
        color: var(--color-muted);
        font-size: 0.95rem;
      }
      ar-icon {
        color: var(--color-accent-text);
      }
      h3 {
        color: var(--color-text);
        margin: 0.6rem 0 0.4rem;
        font-size: 1.15rem;
      }
      p {
        margin: 0;
      }
    }
  `,
})
export class ShopPage {
  protected readonly policies = POLICIES;
  protected readonly filters: { id: Filter; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'soutien', label: 'Soutiens' },
    { id: 'merch', label: 'Merchandising' },
  ];
  protected readonly filter = signal<Filter>('todos');
  protected readonly list = computed(() =>
    this.filter() === 'todos' ? ALL_PRODUCTS : ALL_PRODUCTS.filter((p) => p.kind === this.filter()),
  );
  protected count(f: Filter): number {
    return f === 'todos' ? ALL_PRODUCTS.length : ALL_PRODUCTS.filter((p) => p.kind === f).length;
  }

  constructor() {
    inject(SeoService).set({
      title: 'Loja solidária',
      description:
        'Soutiens para prótese As Rosinhas × Simel e merchandising solidário. Cada compra ajuda a enviar Rosinhas gratuitamente.',
      image: 'img/loja/0123883.webp',
    });
  }
}
