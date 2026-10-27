import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { IconComponent } from '../shared/icon.component';

const NAV = [
  { label: 'A associação', link: '/sobre' },
  { label: 'Eventos', link: '/eventos' },
  { label: 'Loja solidária', link: '/loja' },
  { label: 'Contactos', link: '/contactos' },
];

@Component({
  selector: 'ar-header',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  host: { '(window:scroll)': 'onScroll()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="proto" role="note">
      <ar-icon name="sparkles" size="15" />
      <span
        >Protótipo de redesign · proposta não oficial. O site atual está em
        <a href="https://www.asrosinhas.org" rel="noopener">asrosinhas.org</a></span
      >
    </div>
    <header class="bar" [class.bar--over]="over()">
      <div class="container bar__in">
        <a
          routerLink="/"
          class="brand"
          (click)="open.set(false)"
          aria-label="As Rosinhas, página inicial"
        >
          <picture>
            <source srcset="brand/logo-branco.png" media="(prefers-color-scheme: dark)" />
            <img src="brand/logo-rosa.png" alt="" width="150" height="50" />
          </picture>
        </a>
        <nav class="nav" [class.nav--open]="open()" id="menu" aria-label="Principal">
          @for (n of nav; track n.link) {
            <a [routerLink]="n.link" routerLinkActive="on" (click)="open.set(false)">{{
              n.label
            }}</a>
          }
          <a routerLink="/ajudar" class="btn btn--primary nav__cta" (click)="open.set(false)"
            ><ar-icon name="heart" size="18" />Quero ajudar</a
          >
        </nav>
        <!-- No telemóvel a ação principal fica sempre à vista, fora do menu -->
        <a routerLink="/ajudar" class="btn btn--primary bar__cta" (click)="open.set(false)"
          ><ar-icon name="heart" size="18" />Ajudar</a
        >
        <button
          type="button"
          class="burger"
          (click)="open.set(!open())"
          [attr.aria-expanded]="open()"
          aria-controls="menu"
        >
          <ar-icon [name]="open() ? 'close' : 'menu'" size="24" />
          <span class="visually-hidden">Menu</span>
        </button>
      </div>
    </header>
  `,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 50;
      display: block;
    }
    .proto {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      padding: 0.2rem 1rem;
      background: var(--color-band);
      color: #f6e3ea;
      font-size: 0.8rem;
      text-align: center;
      a {
        /* área de toque de 44 px sem aumentar a faixa */
        display: inline-block;
        padding: 0.75rem 0.25rem;
        margin-block: -0.6rem;
        color: #fff;
      }
    }
    .bar {
      transition:
        background-color 0.3s var(--ease),
        border-color 0.3s var(--ease);
      background: var(--color-header);
      backdrop-filter: saturate(160%) blur(12px);
      border-bottom: 1px solid var(--color-line);
    }
    /* Por cima da ilustração: translúcida, com o texto escuro legível sobre o rosa */
    .bar--over {
      background: rgb(255 246 244 / 42%);
      border-bottom-color: transparent;
      backdrop-filter: saturate(140%) blur(8px);
    }
    @media (prefers-color-scheme: dark) {
      .bar--over {
        background: rgb(28 14 21 / 55%);
      }
    }
    @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
      .bar--over {
        background: var(--color-header);
      }
    }
    .bar__in {
      height: var(--header-h);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .brand img {
      height: 46px;
      width: auto;
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      a:not(.btn) {
        padding: 0.6rem 0.85rem;
        border-radius: var(--radius-pill);
        color: var(--color-text);
        text-decoration: none;
        font-weight: 500;
        transition: background-color 0.2s var(--ease);
      }
      a:not(.btn):hover,
      a.on {
        background: var(--color-tint);
        color: var(--color-accent-text);
      }
    }
    .nav__cta {
      margin-left: 0.5rem;
      min-height: 44px;
      padding-block: 0.55rem;
    }
    .bar__cta {
      display: none;
    }
    .burger {
      display: none;
      width: 48px;
      height: 48px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text);
      cursor: pointer;
      place-items: center;
    }
    @media (max-width: 920px) {
      .burger {
        display: grid;
      }
      .nav {
        position: absolute;
        inset: 100% 0 auto 0;
        flex-direction: column;
        align-items: stretch;
        gap: 0.25rem;
        padding: 0.75rem 1rem 1.25rem;
        background: var(--color-bg);
        border-bottom: 1px solid var(--color-line);
        box-shadow: 0 20px 30px -20px rgb(46 22 33 / 30%);
        display: none;
        a:not(.btn) {
          padding: 0.9rem 1rem;
          font-size: 1.05rem;
        }
      }
      .nav--open {
        display: flex;
      }
      .nav__cta {
        display: none;
      }
      .bar__cta {
        display: inline-flex;
        margin-left: auto;
        min-height: 44px;
        padding: 0.55rem 1rem;
      }
    }
  `,
})
export class HeaderComponent {
  protected readonly nav = NAV;
  protected readonly open = signal(false);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly atTop = signal(true);
  /** Na página inicial, enquanto não se desce, a barra deixa ver a ilustração por trás */
  protected readonly over = computed(
    () => !this.open() && this.atTop() && this.url().split(/[?#]/)[0] === '/',
  );

  constructor() {
    afterNextRender(() => this.onScroll());
  }

  protected onScroll(): void {
    this.atTop.set(window.scrollY < 24);
  }
}
