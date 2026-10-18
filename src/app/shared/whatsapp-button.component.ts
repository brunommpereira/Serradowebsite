import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { ContentService, whatsappUrl } from '../core/services/content.service';
import { IconComponent } from './icon.component';

// Nas áreas reservadas e nos formulários de entrada o botão tapava ações da página
const HIDDEN = /^\/(admin|area-socio|area-atletas|entrar|propostas)(\/|$|\?)/;

/** Botão flutuante «Falar connosco» pelo WhatsApp (só uma ligação wa.me: sem scripts nem cookies). */
@Component({
  selector: 'sfc-whatsapp-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (href(); as url) {
      <a class="wa" [href]="url" target="_blank" rel="noopener" aria-label="Falar com o clube pelo WhatsApp" title="Falar connosco pelo WhatsApp">
        <sfc-icon name="whatsapp" size="30" />
        <span class="wa__label">Falar connosco</span>
      </a>
    }
  `,
  styles: `
    .wa {
      position: fixed;
      right: max(16px, env(safe-area-inset-right));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 90;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      height: 56px;
      min-width: 56px;
      padding: 0 13px;
      border-radius: 28px;
      background: #1f8f4e;
      color: #fff;
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .wa:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.26);
    }
    .wa:focus-visible {
      outline: 3px solid var(--sfc-yellow);
      outline-offset: 3px;
    }
    .wa__label {
      padding-right: 6px;
    }
    @media (max-width: 720px) {
      .wa__label {
        display: none;
      }
    }
    @media print {
      .wa {
        display: none;
      }
    }
  `,
})
export class WhatsappButtonComponent {
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly href = computed(() => {
    if (HIDDEN.test(this.url())) return null;
    const c = this.content.club;
    return whatsappUrl(c.whatsapp, c.whatsappMessage);
  });
}
