import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { AthleteAreaService } from '../core/services/athlete-area.service';
import { IconComponent } from './icon.component';

/**
 * Alternância entre a Área de Sócio e a Área de Atletas, para quem tem os
 * dois perfis (sócio que é também atleta ou encarregado de educação).
 */
@Component({
  selector: 'sfc-area-switch',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <nav class="switch" [class.switch--dark]="tone() === 'dark'" aria-label="Mudar de área">
        <a routerLink="/area-socio" [class.on]="current() === 'socio'" [attr.aria-current]="current() === 'socio' ? 'page' : null">
          <sfc-icon name="card" size="16" />Sócio
        </a>
        <a routerLink="/area-atletas" [class.on]="current() === 'atleta'" [attr.aria-current]="current() === 'atleta' ? 'page' : null">
          <sfc-icon name="run" size="16" />{{ athleteLabel() }}
        </a>
      </nav>
    }
  `,
  styles: `
    .switch {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border-radius: 999px;
      background: var(--color-bg-soft);
      border: 1px solid var(--color-line);
    }
    a {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 36px;
      padding: 0 0.9rem;
      border-radius: 999px;
      font-weight: 700;
      font-size: 0.86rem;
      color: var(--color-text);
      text-decoration: none;
      white-space: nowrap;
      &:hover {
        color: var(--sfc-blue);
      }
      &.on {
        background: var(--sfc-blue);
        color: #fff;
      }
      &:focus-visible {
        outline: 3px solid var(--sfc-yellow);
        outline-offset: 1px;
      }
    }
    .switch--dark {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
      a {
        color: #fff;
      }
      a.on {
        background: #fff;
        color: var(--sfc-blue-900);
      }
    }
  `,
})
export class AreaSwitchComponent {
  readonly current = input.required<'socio' | 'atleta'>();
  readonly tone = input<'light' | 'dark'>('light');

  private readonly auth = inject(AuthService);
  private readonly area = inject(AthleteAreaService);

  /** Só aparece quando a conta é de sócio e tem (ou está na) área de atletas. */
  protected readonly visible = computed(() => this.auth.isMember() && (this.current() === 'atleta' || this.area.athletes().length > 0));
  protected readonly athleteLabel = computed(() => (this.area.role() === 'atleta' ? 'Atleta' : 'Atletas'));
}
