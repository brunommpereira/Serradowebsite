import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { euro, Product } from '../core/content';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ar-product-card',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = product();
    <a class="pc" [routerLink]="['/loja', p.slug]">
      <div class="pc__img">
        <img
          [src]="p.image"
          [alt]="p.name"
          loading="lazy"
          width="600"
          height="600"
          [style.object-position]="p.focus ?? 'center'"
        />
        @if (p.kind === 'soutien') {
          <span class="pc__tag">Soutien para prótese</span>
        }
      </div>
      <div class="pc__body">
        <h3>{{ p.name }}</h3>
        <p>
          {{ p.colors.length > 1 ? p.colors.length + ' cores' : p.colors[0] }} ·
          {{ p.sizes.join(', ') }}
        </p>
        <div class="pc__foot">
          <strong>{{ price(p.price) }}</strong>
          <span class="pc__go">Ver <ar-icon name="arrow" size="16" /></span>
        </div>
      </div>
    </a>
  `,
  styles: `
    .pc {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--color-surface);
      border-radius: var(--radius-l);
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      box-shadow: var(--shadow-s);
      transition:
        transform 0.3s var(--ease),
        box-shadow 0.3s var(--ease);
    }
    .pc:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-m);
    }
    .pc__img {
      position: relative;
      aspect-ratio: 1;
      background: var(--color-surface-alt);
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.6s var(--ease);
      }
    }
    .pc:hover .pc__img img {
      transform: scale(1.04);
    }
    .pc__tag {
      position: absolute;
      left: 0.8rem;
      top: 0.8rem;
      padding: 0.35rem 0.7rem;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-surface) 92%, transparent);
      color: var(--color-accent-text);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .pc__body {
      display: flex;
      flex-direction: column;
      flex: 1;
      padding: 1.1rem 1.2rem 1.25rem;
      h3 {
        font-size: 1.15rem;
        margin-bottom: 0.35rem;
      }
      p {
        font-size: 0.88rem;
        color: var(--color-muted);
        margin-bottom: 0.9rem;
      }
    }
    .pc__foot {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      strong {
        font: 600 1.2rem/1 var(--font-display);
        color: var(--color-accent-text);
      }
    }
    .pc__go {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--color-link);
    }
  `,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  protected readonly price = euro;
}
