import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Cabeçalho das páginas interiores: migalhas, título e introdução. */
@Component({
  selector: 'ar-page-head',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ph">
      <div class="container">
        <nav aria-label="Estás aqui" class="crumbs">
          <a routerLink="/">Início</a>
          @for (c of crumbs(); track c.label) {
            <span aria-hidden="true">/</span>
            @if (c.link) {
              <a [routerLink]="c.link">{{ c.label }}</a>
            } @else {
              <span aria-current="page">{{ c.label }}</span>
            }
          }
        </nav>
        @if (eyebrow()) {
          <p class="eyebrow">{{ eyebrow() }}</p>
        }
        <h1>{{ title() }}</h1>
        @if (lead()) {
          <p class="lead">{{ lead() }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .ph {
      padding: clamp(2.5rem, 6vw, 4.5rem) 0 clamp(2rem, 4vw, 3rem);
      background: radial-gradient(50rem 22rem at 90% 0%, var(--rose-100), transparent 65%);
    }
    .crumbs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-bottom: 1.4rem;
      font-size: 0.88rem;
      color: var(--color-muted);
      a {
        color: var(--color-muted);
      }
    }
    h1 {
      max-width: 18ch;
    }
  `,
})
export class PageHeadComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input<string>('');
  readonly lead = input<string>('');
  readonly crumbs = input<{ label: string; link?: string }[]>([]);
}
