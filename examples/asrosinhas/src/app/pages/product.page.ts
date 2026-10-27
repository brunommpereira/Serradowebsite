import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ALL_PRODUCTS, euro, POLICIES } from '../core/content';
import { SeoService } from '../core/seo.service';
import { AddressFieldsComponent } from '../shared/address-fields.component';
import { DemoForm } from '../shared/demo-form';
import { IconComponent } from '../shared/icon.component';
import { ProductCardComponent } from '../shared/product-card.component';
import { SentNoticeComponent } from '../shared/sent-notice.component';

@Component({
  selector: 'ar-product',
  imports: [
    RouterLink,
    IconComponent,
    AddressFieldsComponent,
    ProductCardComponent,
    SentNoticeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (product(); as p) {
      <div class="container">
        <nav aria-label="Estás aqui" class="crumbs">
          <a routerLink="/">Início</a><span aria-hidden="true">/</span
          ><a routerLink="/loja">Loja solidária</a><span aria-hidden="true">/</span
          ><span aria-current="page">{{ p.name }}</span>
        </nav>
      </div>
      <section class="container pd">
        <div class="pd__media">
          <img
            [src]="p.image"
            [alt]="p.name"
            width="900"
            height="900"
            fetchpriority="high"
            [style.object-position]="p.focus ?? 'center'"
          />
        </div>
        <div class="pd__info">
          <p class="eyebrow">
            {{ p.kind === 'soutien' ? 'Soutien para prótese · Simel' : 'Merchandising' }}
          </p>
          <h1>{{ p.name }}</h1>
          @if (p.ref) {
            <p class="ref">Ref. {{ p.ref }}</p>
          }
          <p class="price">{{ price(p.price) }}</p>
          <p>{{ p.description }}</p>

          @if (form.sent()) {
            <ar-sent-notice
              title="Encomenda registada"
              [text]="
                'Pediste ' + p.name + ' (' + color() + ', ' + size() + '). ' + policies.payment
              "
            />
          } @else {
            <form class="order" (submit)="form.submit($event)" novalidate>
              <fieldset>
                <legend>
                  Cor <span class="sel">{{ color() }}</span>
                </legend>
                <div class="chips">
                  @for (c of p.colors; track c) {
                    <button
                      type="button"
                      class="chip"
                      [attr.aria-pressed]="color() === c"
                      (click)="color.set(c)"
                    >
                      {{ c }}
                    </button>
                  }
                </div>
              </fieldset>
              <fieldset>
                <legend>
                  Tamanho <span class="sel">{{ size() || 'escolhe um' }}</span>
                </legend>
                <div class="chips">
                  @for (s of p.sizes; track s) {
                    <button
                      type="button"
                      class="chip"
                      [attr.aria-pressed]="size() === s"
                      (click)="size.set(s)"
                    >
                      {{ s }}
                    </button>
                  }
                </div>
                <!-- Obriga a escolher o tamanho antes de enviar -->
                <input
                  class="visually-hidden"
                  tabindex="-1"
                  aria-hidden="true"
                  name="tamanho"
                  [value]="size()"
                  required
                />
                @if (p.kind === 'soutien') {
                  <details class="sizes">
                    <summary><ar-icon name="ruler" size="18" />Tabela de tamanhos</summary>
                    <img
                      src="img/loja/tamanhos.webp"
                      alt="Tabela de tamanhos dos soutiens Simel: medida do peito e da base do peito para cada tamanho"
                      width="900"
                      height="600"
                      loading="lazy"
                    />
                  </details>
                }
              </fieldset>

              <h2 class="h3">Os teus dados</h2>
              <div class="form-grid">
                <div class="field">
                  <label for="nome">Nome</label>
                  <input id="nome" name="nome" autocomplete="name" required />
                </div>
                <div class="field">
                  <label for="email">Email</label>
                  <input id="email" name="email" type="email" autocomplete="email" required />
                </div>
                <ar-address-fields />
              </div>
              <label class="check">
                <input type="checkbox" required />
                <span>Li as condições de entrega e de trocas.</span>
              </label>
              <button class="btn btn--primary btn--block" type="submit">
                <ar-icon name="bag" size="18" />Encomendar · {{ price(p.price) }}
              </button>
            </form>
          }

          <ul class="pol">
            <li>
              <ar-icon name="truck" size="18" /><span>{{ policies.delivery }}</span>
            </li>
            <li>
              <ar-icon name="refresh" size="18" /><span>{{ policies.returns }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="section more">
        <div class="container">
          <h2>Também podes gostar</h2>
          <div class="grid">
            @for (o of others(); track o.slug) {
              <ar-product-card [product]="o" />
            }
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .crumbs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      padding: 1.6rem 0 1.2rem;
      font-size: 0.88rem;
      color: var(--color-muted);
      a {
        color: var(--color-muted);
      }
    }
    .pd {
      display: grid;
      gap: clamp(1.5rem, 4vw, 3.5rem);
      grid-template-columns: 1fr;
      align-items: start;
    }
    @media (min-width: 900px) {
      .pd {
        grid-template-columns: 1.05fr 1fr;
      }
      .pd__media {
        position: sticky;
        top: calc(var(--header-h) + 1rem);
      }
    }
    .pd__media img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--radius-l);
      background: var(--sand-100);
    }
    h1 {
      font-size: clamp(2rem, 4vw, 3rem);
      margin-bottom: 0.3rem;
    }
    .ref {
      color: var(--color-muted);
      font-size: 0.9rem;
      margin-bottom: 0.4rem;
    }
    .price {
      font: 600 1.8rem/1 var(--font-display);
      color: var(--rose-800);
      margin: 0.8rem 0 1rem;
    }
    .order {
      display: grid;
      gap: 1.4rem;
      margin-top: 1.6rem;
      padding: clamp(1.2rem, 3vw, 1.8rem);
      background: #fff;
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-s);
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0;
    }
    legend {
      font-weight: 600;
      margin-bottom: 0.6rem;
    }
    .sel {
      font-weight: 400;
      color: var(--color-muted);
      margin-left: 0.4rem;
    }
    .h3 {
      font-size: 1.25rem;
      margin: 0;
    }
    .sizes {
      margin-top: 0.9rem;
      summary {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-height: 44px;
        cursor: pointer;
        color: var(--color-primary);
        font-weight: 600;
      }
      img {
        margin-top: 0.6rem;
        border-radius: var(--radius-m);
      }
    }
    .check {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      font-size: 0.95rem;
      input {
        width: 20px;
        height: 20px;
        margin-top: 0.15rem;
        accent-color: var(--rose-700);
      }
    }
    .pol {
      list-style: none;
      padding: 0;
      margin: 1.6rem 0 0;
      display: grid;
      gap: 0.8rem;
      font-size: 0.9rem;
      color: var(--color-muted);
      li {
        display: flex;
        gap: 0.6rem;
      }
      ar-icon {
        color: var(--rose-700);
        flex: none;
        margin-top: 0.15rem;
      }
    }
    .grid {
      display: grid;
      gap: 1.4rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    }
  `,
})
export class ProductPage {
  readonly slug = input<string>('');
  protected readonly product = computed(() => ALL_PRODUCTS.find((p) => p.slug === this.slug()));
  protected readonly others = computed(() => {
    const p = this.product();
    return ALL_PRODUCTS.filter((o) => o.kind === p?.kind && o.slug !== p?.slug).slice(0, 4);
  });
  protected readonly color = signal('');
  protected readonly size = signal('');
  protected readonly form = new DemoForm();
  protected readonly policies = POLICIES;
  protected readonly price = euro;
  private readonly seo = inject(SeoService);

  constructor() {
    effect(() => {
      const p = this.product();
      if (!p) return;
      this.color.set(p.colors[0]);
      this.size.set(p.sizes.length === 1 ? p.sizes[0] : '');
      this.form.sent.set(false);
      this.seo.set({
        title: p.name,
        description: `${p.description} ${euro(p.price)}. Loja solidária As Rosinhas.`,
        image: p.image,
      });
    });
  }
}
