import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Charges, PaymentsService, PayItem } from '../core/services/payments.service';
import { isValidNif } from '../core/validators';
import { IconComponent } from './icon.component';
import { OfflineNoticeComponent } from './offline-notice.component';

type Row = { key: string; item: PayItem; title: string; detail: string; amount: number; dueDate: string; status: string; inProgress: boolean };

const RECEIPT_LABEL: Record<string, string> = { pending: 'Recibo em emissão', failed: 'Recibo em emissão', none: '—', issued: '' };
const STATUS_LABEL: Record<string, string> = { open: 'A aguardar pagamento', paid: 'Pago', failed: 'Não concluído', expired: 'Expirado' };

/**
 * Pagar quotas e/ou mensalidades (Stripe: cartão, MB WAY ou Multibanco) e descarregar as faturas-recibo.
 * `kinds` escolhe o que aparece: Área de Sócio → quotas; Área de Atletas → mensalidades.
 */
@Component({
  selector: 'sfc-pay-panel',
  imports: [CurrencyPipe, DatePipe, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (result() === 'ok') {
      <p class="alert alert--success" role="status">
        <sfc-icon name="check" size="18" />
        <span>Obrigado! Se pagaste com cartão ou MB WAY, o pagamento fica registado em instantes e a fatura-recibo chega ao teu email. Com Multibanco, fica registado quando pagares a referência.</span>
      </p>
    } @else if (result() === 'cancelado') {
      <p class="alert alert--info" role="status"><sfc-icon name="info" size="18" /><span>O pagamento foi cancelado. Nada foi cobrado.</span></p>
    }

    @if (error(); as e) {
      <p class="alert alert--warning" role="alert"><sfc-icon name="warning" size="18" /><span>{{ e }}</span></p>
    }

    @if (data(); as d) {
      @if (!d.enabled) {
        <sfc-offline-notice title="Pagamentos online" text="Os pagamentos online ainda não estão disponíveis. Podes pagar na secretaria do clube (MB WAY, multibanco ou numerário)." />
      } @else if (rows().length) {
        <form class="pay card" (submit)="$event.preventDefault(); submit()">
          <h3 class="pay__title">Por pagar</h3>
          <ul class="pay__list">
            @for (r of rows(); track r.key) {
              <li [class.pay__row--off]="r.inProgress">
                <label class="check">
                  <input type="checkbox" [checked]="selected().has(r.key)" [disabled]="r.inProgress" (change)="toggle(r.key)" />
                  <span>
                    <strong>{{ r.title }}</strong>
                    <small>{{ r.detail }} · vence a {{ r.dueDate | date: 'd MMM y' }}</small>
                  </span>
                </label>
                <span class="pay__amount">{{ r.amount | currency: 'EUR' }}</span>
                @if (r.inProgress) {
                  <span class="badge badge--neutral">Pagamento em curso</span>
                } @else {
                  <span [class]="'badge badge--' + (r.status === 'Em atraso' ? 'danger' : 'warning')">{{ r.status }}</span>
                }
              </li>
            }
          </ul>
          <div class="field pay__nif">
            <label for="pay-nif">NIF para a fatura-recibo <span class="req">*</span></label>
            <input id="pay-nif" inputmode="numeric" maxlength="9" autocomplete="off" [value]="nif()" (input)="nif.set($any($event.target).value.trim())" [attr.aria-invalid]="nifInvalid()" />
            @if (nifInvalid()) {
              <span class="error">NIF inválido.</span>
            }
          </div>
          <button class="btn btn--accent btn--block" type="submit" [disabled]="!canPay() || busy()">
            {{ busy() ? 'A abrir o pagamento…' : 'Pagar ' + (total() | currency: 'EUR') }}
          </button>
          <p class="caption pay__methods"><sfc-icon name="shield" size="14" /> Pagamento seguro no Stripe: cartão, MB WAY ou Multibanco.</p>
        </form>
      } @else {
        <p class="alert alert--success pay__none"><sfc-icon name="check" size="18" /><span>Não há nada por pagar.</span></p>
      }

      @if (history().length) {
        <h3 class="pay__title">Pagamentos e faturas-recibo</h3>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th>Estado</th><th>Recibo</th></tr>
            </thead>
            <tbody>
              @for (p of history(); track p.id) {
                <tr>
                  <td>{{ p.paidAt ?? p.createdAt | date: 'dd/MM/y' }}</td>
                  <td>{{ p.items.join(' · ') }}@if (p.methodLabel) { <span class="caption"> · {{ p.methodLabel }}</span> }</td>
                  <td class="num">{{ p.amount | currency: 'EUR' }}</td>
                  <td><span [class]="'badge badge--' + (p.status === 'paid' ? 'success' : p.status === 'open' ? 'warning' : 'neutral')">{{ statusLabel(p.status) }}</span></td>
                  <td>
                    @if (p.hasReceipt) {
                      <a [href]="receiptUrl(p.id)" download><sfc-icon name="download" size="16" /> {{ p.receiptNumber }}</a>
                    } @else if (p.status === 'paid') {
                      <span class="caption">{{ receiptLabel(p.receiptStatus) }}</span>
                    } @else {
                      <span class="caption">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else if (!error()) {
      <p class="caption" aria-live="polite">A carregar…</p>
    }
  `,
  styles: `
    .pay {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .pay__title {
      font-size: 1.05rem;
      margin: 0.25rem 0 0.5rem;
    }
    .pay__list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .pay__list li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.25rem 0.75rem;
      align-items: center;
      padding: 0.6rem 0;
      border-top: 1px solid var(--color-line);
    }
    .pay__list .badge {
      grid-column: 1 / -1;
      justify-self: start;
    }
    .pay__row--off {
      opacity: 0.75;
    }
    .check {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
    }
    .check input {
      margin-top: 0.3rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    .check small {
      display: block;
      color: var(--color-muted);
    }
    .pay__amount {
      font-weight: 700;
      white-space: nowrap;
    }
    .pay__nif input {
      max-width: 14rem;
    }
    .pay__methods {
      display: flex;
      gap: 0.35rem;
      align-items: center;
      margin: 0;
    }
    .pay__none {
      margin-bottom: 1.5rem;
    }
  `,
})
export class PayPanelComponent {
  readonly kinds = input<'quota' | 'fee' | 'all'>('all');
  readonly returnPath = input<'/area-socio' | '/area-atletas'>('/area-socio');
  /** Área de Atletas: só as mensalidades deste atleta (vazio = todas as da conta) */
  readonly athleteId = input<string>('');

  private readonly payments = inject(PaymentsService);
  protected readonly result = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('pagamento'));
  protected readonly data = signal<Charges | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly nif = signal('');
  protected readonly selected = signal<Set<string>>(new Set());

  protected readonly rows = computed<Row[]>(() => {
    const d = this.data();
    if (!d) return [];
    const kinds = this.kinds();
    const quotas: Row[] = kinds === 'fee' ? [] : d.quotas.map((q) => ({
      key: `quota:${q.id}`,
      item: { kind: 'quota', id: q.id },
      title: `Quota ${q.period}`,
      detail: `Sócio n.º ${q.memberNumber}`,
      amount: q.amount,
      dueDate: q.dueDate,
      status: q.status,
      inProgress: q.inProgress,
    }));
    const fees: Row[] = kinds === 'quota' ? [] : d.fees
      .filter((f) => !this.athleteId() || f.athleteId === this.athleteId())
      .map((f) => ({
        key: `fee:${f.id}`,
        item: { kind: 'fee', id: f.id },
        title: `Mensalidade ${f.period}`,
        detail: `${f.sportLabel} · ${f.athleteName}`,
        amount: f.amount,
        dueDate: f.dueDate,
        status: f.status,
        inProgress: f.inProgress,
      }));
    return [...quotas, ...fees];
  });
  protected readonly history = computed(() => this.data()?.payments ?? []);
  protected readonly total = computed(() => this.rows().filter((r) => this.selected().has(r.key)).reduce((sum, r) => sum + r.amount, 0));
  protected readonly nifInvalid = computed(() => this.nif().length > 0 && !isValidNif(this.nif()));
  protected readonly canPay = computed(() => this.total() > 0 && isValidNif(this.nif()));

  constructor() {
    this.load();
  }

  private async load() {
    try {
      const d = await this.payments.charges();
      this.data.set(d);
      if (!this.nif() && d.suggestedNif) this.nif.set(d.suggestedNif);
      this.selected.set(new Set(this.rows().filter((r) => !r.inProgress).map((r) => r.key)));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível carregar os pagamentos.');
    }
  }

  protected toggle(key: string) {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected async submit() {
    if (!this.canPay() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const items = this.rows().filter((r) => this.selected().has(r.key)).map((r) => r.item);
      await this.payments.pay(items, this.nif(), this.returnPath());
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.');
      this.busy.set(false);
      this.load();
    }
  }

  protected receiptUrl(id: string) {
    return this.payments.receiptUrl(id);
  }

  protected statusLabel(s: string) {
    return STATUS_LABEL[s] ?? s;
  }

  protected receiptLabel(s: string) {
    return RECEIPT_LABEL[s] ?? '';
  }
}
