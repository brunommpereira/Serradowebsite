import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IconComponent } from '../../shared/icon.component';
import { CapitalizePipe } from '../../shared/capitalize.pipe';
import { Rsvp, Session } from '../../core/data/athletes-data';

const RSVP_LABEL: Record<string, string> = { vou: 'Vou', 'nao-vou': 'Não vou' };

/** Cartão de sessão (treino, jogo, torneio) — agenda e histórico. */
@Component({
  selector: 'sfc-session-card',
  imports: [DatePipe, IconComponent, CapitalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = session();
    <article class="ss" [attr.data-type]="s.type" [attr.data-status]="s.status" [attr.aria-label]="ariaLabel()">
      <header class="ss__band">
        <div class="ss__date">
          <span class="ss__wd">{{ s.date | date: 'EEEE' | cap }}</span>
          <span class="ss__day">{{ s.date | date: 'dd/MM' }}</span>
        </div>
        <div class="ss__time"><sfc-icon name="clock" size="18" />{{ s.date | date: "HH'h'mm" }}</div>
        <div class="ss__main">
          <span class="ss__badge">{{ s.status === 'Cancelado' ? 'Cancelado' : s.type }}</span>
          <h3 class="ss__title">{{ s.title }}</h3>
          <p class="ss__sub">{{ s.status }} · {{ level() }} · {{ s.location }}</p>
        </div>
        <div class="ss__mins" [attr.aria-label]="s.minutes + ' minutos planeados'">
          <strong>{{ s.minutes }}</strong><span>min</span>
        </div>
      </header>

      <div class="ss__body">
        @if (mode() === 'agenda') {
          <div class="ss__rsvp" role="group" [attr.aria-label]="'Presença em ' + s.title">
            <button type="button" class="rsvp rsvp--yes" [attr.aria-pressed]="s.rsvp === 'vou'" (click)="answer.emit(s.rsvp === 'vou' ? null : 'vou')">
              <sfc-icon name="check" size="18" /> Vou
            </button>
            <button type="button" class="rsvp rsvp--no" [attr.aria-pressed]="s.rsvp === 'nao-vou'" (click)="answer.emit(s.rsvp === 'nao-vou' ? null : 'nao-vou')">
              <sfc-icon name="close" size="18" /> Não vou
            </button>
          </div>
          <p class="ss__answer" aria-live="polite">Resposta atual: <strong>{{ rsvpLabel(s.rsvp) }}</strong></p>
        } @else {
          <div class="ss__hist">
            <p class="ss__answer">
              Resposta registada: <strong>{{ rsvpLabel(s.rsvp) }}</strong>
              @if (s.status === 'Terminado') {
                <span class="pres" [class.pres--ok]="s.attended">
                  <sfc-icon [name]="s.attended ? 'check' : 'close'" size="14" />{{ s.attended ? 'Presente' : 'Falta' }}
                </span>
              }
            </p>
            @if (s.plan?.length) {
              <button type="button" class="btn btn--outline btn--sm" (click)="openPlan.emit()"><sfc-icon name="file" size="16" />Ver plano de treino</button>
            }
          </div>
        }
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .ss { border: 1px solid var(--color-line); border-radius: var(--radius); overflow: hidden; background: #fff; }
    .ss__band {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: center;
      gap: 0.6rem 1.4rem;
      padding: 1rem 1.3rem;
      color: #fff;
      background:
        repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.05) 0 2px, transparent 2px 14px),
        linear-gradient(110deg, var(--sfc-blue-900), var(--sfc-blue));
    }
    [data-type='Torneio'] .ss__band, [data-type='Jogo'] .ss__band {
      background:
        repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.06) 0 2px, transparent 2px 14px),
        linear-gradient(110deg, #5c4500, #a77f00);
    }
    [data-status='Cancelado'] .ss__band {
      background:
        repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.05) 0 2px, transparent 2px 14px),
        linear-gradient(110deg, #5d1414, #8f2323);
    }
    .ss__date { display: grid; line-height: 1; padding-right: 1.4rem; border-right: 1px solid rgba(255, 255, 255, 0.25); }
    .ss__wd { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 0.3rem; }
    .ss__day { font: 800 2.3rem/1 var(--font-display); }
    .ss__time { display: inline-flex; align-items: center; gap: 0.35rem; font: 700 1.4rem var(--font-display); }
    .ss__main { min-width: 0; }
    .ss__badge {
      display: inline-block; font: 700 0.75rem/1 var(--font-body); letter-spacing: 0.08em; text-transform: uppercase;
      padding: 0.35em 0.7em; border-radius: 999px; background: #fff; color: var(--sfc-blue-900); margin-bottom: 0.35rem;
    }
    .ss__title { margin: 0; font: 800 1.35rem/1.1 var(--font-display); text-transform: uppercase; }
    .ss__sub { margin: 0.2rem 0 0; font-size: 0.85rem; opacity: 0.88; }
    .ss__mins { text-align: right; line-height: 1; strong { display: block; font: 800 1.6rem var(--font-display); } span { font-size: 0.75rem; opacity: 0.85; } }
    .ss__body { padding: 1rem 1.3rem 1.1rem; }
    .ss__rsvp { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .rsvp {
      min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
      border: 1.5px solid var(--color-line); border-radius: var(--radius-s); background: #fff;
      font: 700 0.98rem var(--font-body); color: var(--color-text); cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
      &:hover { border-color: var(--sfc-blue); }
    }
    .rsvp--yes[aria-pressed='true'] { background: var(--sfc-yellow); border-color: var(--sfc-yellow); color: var(--color-on-accent); }
    .rsvp--no[aria-pressed='true'] { background: var(--sfc-ink); border-color: var(--sfc-ink); color: #fff; }
    .ss__answer { margin: 0.7rem 0 0; font-size: 0.85rem; color: var(--color-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; strong { color: var(--color-text); } }
    .ss__hist { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.8rem; .ss__answer { margin: 0; } }
    .pres {
      display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2em 0.6em; border-radius: 999px;
      font-size: 0.75rem; font-weight: 700; background: #fde7e5; color: var(--color-danger);
      &--ok { background: #e3f4e7; color: var(--color-success); }
    }
    @media (max-width: 640px) {
      .ss__band { grid-template-columns: auto 1fr auto; padding: 0.9rem 1rem; }
      .ss__date { grid-row: span 2; }
      .ss__time { grid-column: 2; font-size: 1.15rem; }
      .ss__main { grid-column: 2 / -1; }
      .ss__mins { grid-row: 1; grid-column: 3; }
      .ss__day { font-size: 1.9rem; }
      .ss__body { padding: 0.9rem 1rem 1rem; }
    }
  `,
})
export class SessionCardComponent {
  readonly session = input.required<Session>();
  readonly level = input.required<string>();
  readonly mode = input<'agenda' | 'historico'>('agenda');
  readonly answer = output<Rsvp>();
  readonly openPlan = output<void>();

  protected readonly rsvpLabel = (r: Rsvp) => (r ? RSVP_LABEL[r] : 'Sem resposta');
  protected readonly ariaLabel = computed(() => {
    const s = this.session();
    return `${s.type} ${s.title}, ${s.status}`;
  });
}
