import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

@Component({
  selector: 'ar-sent-notice',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sent" role="status">
      <span class="sent__icon"><ar-icon name="check" size="28" /></span>
      <h2>{{ title() }}</h2>
      <p>{{ text() }}</p>
      <p class="notice">
        <ar-icon name="info" size="18" />Protótipo: o pedido não foi enviado. No site real chega à
        associação e recebes um email de confirmação.
      </p>
    </div>
  `,
  styles: `
    .sent {
      text-align: center;
      padding: 2rem 1rem;
    }
    .sent__icon {
      display: inline-grid;
      place-items: center;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--color-tint);
      color: var(--color-accent-text);
      margin-bottom: 1rem;
    }
    .notice {
      text-align: left;
      max-width: 52ch;
      margin: 1.5rem auto 0;
    }
  `,
})
export class SentNoticeComponent {
  readonly title = input.required<string>();
  readonly text = input<string>('');
}
