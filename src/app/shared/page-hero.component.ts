import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb {
  label: string;
  link?: string;
}

/** Cabeçalho das páginas interiores, com breadcrumbs. */
@Component({
  selector: 'sfc-page-hero',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="phero" [attr.data-sport]="sport()">
      <div class="container phero__inner">
        <nav aria-label="Caminho" class="crumbs">
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
        @if (subtitle()) {
          <p class="phero__sub">{{ subtitle() }}</p>
        }
        <ng-content />
      </div>
      <img class="phero__mark" src="brand/logo-white.svg" alt="" aria-hidden="true" />
    </section>
  `,
  styles: `
    .phero {
      position: relative;
      overflow: hidden;
      color: #fff;
      background:
        radial-gradient(900px 380px at 90% -10%, rgba(253, 210, 14, 0.28), transparent 60%),
        linear-gradient(135deg, var(--hero-a, var(--sfc-blue)) 0%, var(--hero-b, var(--sfc-blue-900)) 100%);
      &[data-sport='atletismo'] { --hero-a: #c9593d; --hero-b: #6e2414; }
      &[data-sport='rugby'] { --hero-a: #217632; --hero-b: #0c3d17; }
      &[data-sport='formacao'] { --hero-a: #19468e; --hero-b: #3d2a00; }
      &[data-sport='escola-de-desporto'] { --hero-a: #6a3fa0; --hero-b: #2d1450; }
    }
    .phero__inner {
      position: relative;
      z-index: 1;
      padding: clamp(2.2rem, 6vw, 4.2rem) 0 clamp(2.4rem, 6vw, 4rem);
    }
    .eyebrow { color: var(--sfc-yellow); }
    h1 { font-size: var(--fs-xl); margin-bottom: 0.3em; max-width: 18ch; }
    .phero__sub { font-size: 1.15rem; max-width: 56ch; opacity: 0.9; margin: 0; }
    .phero__mark {
      position: absolute;
      right: -40px;
      bottom: -70px;
      width: min(380px, 55vw);
      opacity: 0.08;
      pointer-events: none;
    }
    .crumbs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.82rem;
      margin-bottom: 1.4rem;
      opacity: 0.85;
      a { color: #fff; }
    }
  `,
})
export class PageHeroComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input<string>();
  readonly subtitle = input<string>();
  readonly sport = input<string>();
  readonly crumbs = input<Crumb[]>([]);
}
