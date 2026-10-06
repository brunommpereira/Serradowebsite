import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** QR Code em SVG (cartão de sócio, inscrições em eventos, check-in). */
@Component({
  selector: 'sfc-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()' },
  template: `<span class="qr" [innerHTML]="svg()"></span>`,
  styles: `
    :host { display: inline-block; }
    .qr { display: block; width: 100%; line-height: 0; }
    .qr ::ng-deep svg { width: 100%; height: auto; }
  `,
})
export class QrCodeComponent {
  readonly data = input.required<string>();
  readonly label = input('QR Code');
  readonly color = input('#0b2350');

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly svg = signal<SafeHtml>('');

  constructor() {
    effect(async () => {
      const value = this.data();
      const dark = this.color();
      // 'qrcode' é CommonJS: usar o export por omissão (destructuring de toString apanharia Object.prototype.toString).
      const mod = await import('qrcode');
      const QRCode = (mod as unknown as { default?: typeof mod }).default ?? mod;
      const markup = await QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark, light: '#ffffff' } });
      // SVG gerado localmente pela biblioteca a partir de dados do próprio site.
      this.svg.set(this.sanitizer.bypassSecurityTrustHtml(markup));
    });
  }
}
