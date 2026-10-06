import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type PaymentMethod = 'MB WAY' | 'Referência Multibanco' | 'Cartão';

/**
 * Passo de pagamento — MODO DEMONSTRAÇÃO.
 * Na Fase 3 é ligado ao prestador de pagamentos (MB WAY, Multibanco, cartão,
 * débito direto) via POST /api/membership/payments e confirmação por webhook.
 */
@Component({
  selector: 'sfc-payment-step',
  imports: [CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pay">
      <div class="pay__summary">
        <span>{{ description() }}</span>
        <strong>{{ amount() | currency: 'EUR' }}</strong>
      </div>
      <fieldset>
        <legend>Método de pagamento</legend>
        <div class="pay__methods">
          @for (m of methods; track m) {
            <label class="pay__method" [class.sel]="method() === m">
              <input type="radio" name="method" [value]="m" [checked]="method() === m" (change)="method.set(m)" />
              <span>{{ m }}</span>
            </label>
          }
        </div>
        @switch (method()) {
          @case ('MB WAY') {
            <div class="field">
              <label for="mbway">Número de telemóvel associado ao MB WAY</label>
              <input id="mbway" type="tel" name="phone" [(ngModel)]="phone" placeholder="9XX XXX XXX" inputmode="tel" />
              <span class="hint">Vais receber um pedido de pagamento na app MB WAY.</span>
            </div>
          }
          @case ('Referência Multibanco') {
            <dl class="pay__ref">
              <div><dt>Entidade</dt><dd>00000</dd></div>
              <div><dt>Referência</dt><dd>{{ reference() }}</dd></div>
              <div><dt>Valor</dt><dd>{{ amount() | currency: 'EUR' }}</dd></div>
            </dl>
          }
          @case ('Cartão') {
            <p class="hint">Serás redirecionado para a página segura do prestador de pagamentos.</p>
          }
        }
      </fieldset>
      <p class="alert alert--warning"><span><strong>Demonstração:</strong> nenhum pagamento real é efetuado. Os pagamentos online serão ativados na Fase 3.</span></p>
      <button class="btn btn--accent btn--block" type="button" [disabled]="method() === 'MB WAY' && phone.replace(' ', '').length < 9" (click)="paid.emit(method())">
        {{ method() === 'Referência Multibanco' ? 'Já paguei (simular confirmação)' : 'Pagar ' }}{{ method() === 'Referência Multibanco' ? '' : (amount() | currency: 'EUR') }}
      </button>
    </div>
  `,
  styles: `
    .pay { display: grid; gap: 1rem; }
    .pay__summary { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.2rem; border-radius: var(--radius); background: var(--sfc-blue-50); strong { font: 800 1.6rem var(--font-display); color: var(--sfc-blue); } }
    .pay__methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.6rem; margin-bottom: 1rem; }
    .pay__method {
      display: flex; gap: 0.6rem; align-items: center; padding: 0.8rem 1rem; border: 1.5px solid var(--color-line); border-radius: var(--radius-s); cursor: pointer; font-weight: 600;
      &.sel { border-color: var(--sfc-blue); background: var(--sfc-blue-50); }
      input { accent-color: var(--sfc-blue); }
    }
    .pay__ref { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; margin: 0; div { background: var(--color-bg-soft); border-radius: var(--radius-s); padding: 0.7rem; } dt { font-size: 0.75rem; color: var(--color-muted); text-transform: uppercase; } dd { margin: 0; font: 700 1.1rem var(--font-body); font-variant-numeric: tabular-nums; } }
  `,
})
export class PaymentStepComponent {
  readonly amount = input.required<number>();
  readonly description = input.required<string>();
  readonly paid = output<PaymentMethod>();

  protected readonly methods: PaymentMethod[] = ['MB WAY', 'Referência Multibanco', 'Cartão'];
  protected readonly method = signal<PaymentMethod>('MB WAY');
  protected phone = '';
  protected readonly reference = computed(() => {
    const n = String(Math.round(this.amount() * 100) * 7919 + 123456789).slice(-9);
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  });
}
