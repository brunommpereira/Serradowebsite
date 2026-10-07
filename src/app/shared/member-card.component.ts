import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { QrCodeComponent } from './qr-code.component';

/** Cartão de sócio digital (secção 13). */
@Component({
  selector: 'sfc-member-card',
  imports: [QrCodeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mcard">
      <div class="mcard__top">
        <img src="brand/logo-white.svg" alt="" class="mcard__logo" />
        <div>
          <p class="mcard__club">Serrado FC</p>
          <p class="mcard__type">Cartão de Sócio · {{ category() }}</p>
        </div>
      </div>
      <div class="mcard__main">
        <div>
          <p class="mcard__num">N.º {{ number() }}</p>
          <p class="mcard__name">{{ name() }}</p>
          <p class="mcard__since">Sócio desde {{ since() }}</p>
          <p class="mcard__status" [class.ok]="upToDate()">
            {{ upToDate() ? '✓ Sócio ativo · Quota em dia' : '! Quota por regularizar' }}
          </p>
        </div>
        <sfc-qr-code class="mcard__qr" [data]="'SFC|SOCIO|' + number()" [label]="'QR Code do sócio n.º ' + number()" />
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .mcard {
      position: relative;
      overflow: hidden;
      border-radius: 20px;
      padding: 1.4rem 1.5rem;
      color: #fff;
      background:
        radial-gradient(circle at 110% -10%, rgba(255, 211, 24, 0.55), transparent 45%),
        repeating-conic-gradient(from 0deg at 105% 110%, rgba(255, 255, 255, 0.06) 0 5deg, transparent 5deg 12deg),
        linear-gradient(135deg, var(--sfc-blue), var(--sfc-blue-900));
      box-shadow: 0 24px 40px -18px rgba(11, 35, 80, 0.7);
      aspect-ratio: 1.586;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      p { margin: 0; }
    }
    .mcard__top { display: flex; gap: 0.8rem; align-items: center; }
    .mcard__logo { width: 46px; }
    .mcard__club { font: 800 1.4rem/1 var(--font-display); text-transform: uppercase; }
    .mcard__type { font-size: 0.72rem; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; }
    .mcard__main { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; }
    .mcard__num { font: 800 1.9rem/1 var(--font-display); color: var(--sfc-yellow); letter-spacing: 0.04em; }
    .mcard__name { font: 700 1.25rem/1.2 var(--font-display); text-transform: uppercase; margin-top: 0.2rem !important; }
    .mcard__since { font-size: 0.75rem; opacity: 0.8; }
    .mcard__status { font-size: 0.75rem; font-weight: 700; margin-top: 0.5rem !important; color: #ffd0c7; &.ok { color: #b8f0c6; } }
    .mcard__qr { width: 92px; flex: none; border-radius: 8px; overflow: hidden; }
    @media (max-width: 380px) { .mcard__qr { width: 72px; } .mcard__num { font-size: 1.5rem; } }
  `,
})
export class MemberCardComponent {
  readonly number = input.required<string>();
  readonly name = input.required<string>();
  readonly category = input('Sénior');
  readonly since = input.required<string>();
  readonly upToDate = input(true);
}
