import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppPushService } from '../core/services/app-push.service';
import { IconComponent } from './icon.component';

const DISMISSED = 'sfc.installBanner.dismissed';
// Nas áreas reservadas e na própria página da app não aparece
const HIDDEN = /^\/(app|admin|area-socio|area-atletas|entrar|propostas)(\/|$|\?|#)/;

/** Aviso discreto no telemóvel para instalar a app (só para quem ainda não a instalou; fechado, não volta). */
@Component({
  selector: 'sfc-install-banner',
  imports: [IconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <aside class="banner" aria-label="Instalar a app">
        <img src="brand/icon-192.png" alt="" width="36" height="36" />
        <div class="text">
          <strong>App Serrado FC</strong>
          <span>Jogos e avisos no telemóvel</span>
        </div>
        @if (push.installPrompt()) {
          <button type="button" class="btn btn--primary btn--sm" (click)="install()">
            Instalar
          </button>
        } @else {
          <a class="btn btn--primary btn--sm" routerLink="/app" (click)="dismiss()">Instalar</a>
        }
        <button type="button" class="close" aria-label="Fechar" (click)="dismiss()">
          <sfc-icon name="close" size="18" />
        </button>
      </aside>
    }
  `,
  styles: `
    .banner {
      position: fixed;
      left: 12px;
      right: 84px; /* não tapa o botão do WhatsApp */
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 89;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.55rem 0.4rem 0.55rem 0.6rem;
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0, 20, 50, 0.18);
      animation: up 0.25s ease-out;
    }
    img {
      border-radius: 10px;
      flex: none;
    }
    .text {
      display: grid;
      line-height: 1.2;
      min-width: 0;
      strong {
        font-size: 0.9rem;
      }
      span {
        font-size: 0.78rem;
        color: var(--color-muted);
      }
    }
    .btn {
      flex: none;
      margin-left: auto;
    }
    .close {
      flex: none;
      display: inline-grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-muted);
      cursor: pointer;
    }
    @keyframes up {
      from {
        transform: translateY(120%);
      }
    }
    @media print {
      .banner {
        display: none;
      }
    }
  `,
})
export class InstallBannerComponent {
  protected readonly push = inject(AppPushService);
  private readonly url = toSignal(
    inject(Router).events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: '' },
  );
  private readonly eligible = signal(false);
  private readonly closed = signal(false);
  protected readonly show = computed(
    () =>
      this.eligible() &&
      !this.closed() &&
      !this.push.installed() &&
      !HIDDEN.test(this.url()) &&
      (!!this.push.installPrompt() || this.push.ios),
  );

  constructor() {
    // Só no browser, em ecrãs de telemóvel, e se ainda não o fechou
    afterNextRender(() => {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISSED) === '1';
      } catch {
        /* sem armazenamento: mostra */
      }
      this.eligible.set(!dismissed && !!window.matchMedia?.('(max-width: 720px)').matches);
    });
  }

  protected async install() {
    if (await this.push.install()) this.closed.set(true);
  }

  protected dismiss() {
    this.closed.set(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      /* sem armazenamento: fica só nesta visita */
    }
  }
}
