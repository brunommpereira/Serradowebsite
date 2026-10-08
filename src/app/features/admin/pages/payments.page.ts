import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiClient } from '../../../core/api/api-client';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

interface FeePlan {
  sport: string;
  amount: number;
  active: boolean;
}

interface AdminPayment {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amount: number;
  status: 'open' | 'paid' | 'failed' | 'expired';
  method: string | null;
  payerName: string;
  payerNif: string;
  receiptNumber: string | null;
  receiptStatus: 'none' | 'pending' | 'issued' | 'failed';
  receiptError: string | null;
  receiptAttempts: number;
  hasReceipt: boolean;
  items: string[];
}

const SPORTS = [
  { slug: 'futsal', label: 'Escola de Futsal' },
  { slug: 'rugby', label: 'Escola de Rugby' },
];
const STATUS: Record<string, string> = { open: 'Em curso', paid: 'Pago', failed: 'Falhou', expired: 'Expirado' };
const METHOD: Record<string, string> = { card: 'Cartão', mb_way: 'MB WAY', multibanco: 'Multibanco' };
const RECEIPT: Record<string, string> = { none: '—', pending: 'Em emissão', failed: 'Falhou', issued: 'Emitido' };

/** Secretaria: valores das mensalidades, geração mensal e pagamentos online com o estado do recibo (Moloni ON). */
@Component({
  selector: 'sfc-admin-payments',
  imports: [CurrencyPipe, DatePipe, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Pagamentos</h1>
        <p>Quotas e mensalidades pagas online (Stripe) e faturas-recibo emitidas no Moloni ON.</p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="Os pagamentos online funcionam com o site ligado à API (VPS). No modo demonstração não há pagamentos." />
    } @else {
      @if (error()) {
        <p class="alert alert--warning adm-error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="alert alert--success" role="status">{{ notice() }}</p>
      }

      <section class="adm-panel block">
        <h2>Valor mensal das escolas</h2>
        <p class="caption">No dia 1 de cada mês é criada a mensalidade de cada atleta destas modalidades (vence a dia 8).</p>
        <div class="plans">
          @for (s of sports; track s.slug) {
            <form class="plan" (submit)="$event.preventDefault(); savePlan(s.slug, amount.value, active.checked)">
              <strong>{{ s.label }}</strong>
              <label>Valor (€) <input #amount type="number" min="1" max="999" step="0.5" [value]="plan(s.slug)?.amount ?? ''" required /></label>
              <label class="check"><input #active type="checkbox" [checked]="plan(s.slug)?.active ?? true" /> Ativa</label>
              <button class="btn btn--primary btn--sm" type="submit">Guardar</button>
            </form>
          }
        </div>
        <form class="plan" (submit)="$event.preventDefault(); generate(month.value)">
          <strong>Gerar mensalidades</strong>
          <label>Mês <input #month type="month" [value]="thisMonth" required /></label>
          <button class="btn btn--outline btn--sm" type="submit">Gerar agora</button>
          <span class="caption">Repetir não duplica.</span>
        </form>
      </section>

      <section class="adm-panel block">
        <h2>Pagamentos online</h2>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th scope="col">Data</th><th scope="col">Quem pagou</th><th scope="col">Descrição</th><th scope="col" class="num">Valor</th>
                <th scope="col">Estado</th><th scope="col">Fatura-recibo</th>
              </tr>
            </thead>
            <tbody>
              @for (p of payments(); track p.id) {
                <tr>
                  <td class="nowrap">{{ p.paidAt ?? p.createdAt | date: 'dd/MM/y HH:mm' }}</td>
                  <td>{{ p.payerName }}<br /><span class="caption">NIF {{ p.payerNif }}</span></td>
                  <td>{{ p.items.join(' · ') }}</td>
                  <td class="num">{{ p.amount | currency: 'EUR' }}</td>
                  <td>{{ status(p.status) }}@if (p.method) {<br /><span class="caption">{{ method(p.method) }}</span>}</td>
                  <td>
                    @if (p.hasReceipt) {
                      <a [href]="api.baseUrl + '/admin/payments/' + p.id + '/receipt'" download><sfc-icon name="download" size="16" /> {{ p.receiptNumber }}</a>
                    } @else {
                      {{ receipt(p.receiptStatus) }}
                      @if (p.receiptStatus === 'failed') {
                        <br /><span class="caption">{{ p.receiptError }} ({{ p.receiptAttempts }} tentativas)</span>
                        <br /><button type="button" class="btn btn--outline btn--sm" (click)="retry(p.id)">Tentar outra vez</button>
                      }
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="caption">Ainda não há pagamentos online.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: `
    .plans {
      display: grid;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .plan {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      padding: 0.5rem 0;
    }
    .plan strong {
      min-width: 10rem;
    }
    .plan input[type='number'],
    .plan input[type='month'] {
      margin-left: 0.35rem;
      width: 9rem;
    }
  `,
})
export class PaymentsPage {
  protected readonly api = inject(ApiClient);
  protected readonly sports = SPORTS;
  protected readonly thisMonth = new Date().toISOString().slice(0, 7);
  protected readonly plans = signal<FeePlan[]>([]);
  protected readonly payments = signal<AdminPayment[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    if (this.api.enabled) this.load();
  }

  private async load() {
    try {
      const [plans, payments] = await Promise.all([this.api.get<FeePlan[]>('/admin/fee-plans'), this.api.get<AdminPayment[]>('/admin/payments')]);
      this.plans.set(plans);
      this.payments.set(payments);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro ao carregar');
    }
  }

  protected plan(slug: string) {
    return this.plans().find((p) => p.sport === slug);
  }

  protected async savePlan(sport: string, amount: string, active: boolean) {
    this.notice.set(null);
    try {
      await this.api.put(`/admin/fee-plans/${sport}`, { amount: Number(amount), active });
      this.notice.set('Valor guardado.');
      this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro ao guardar');
    }
  }

  protected async generate(month: string) {
    this.notice.set(null);
    try {
      const out = await this.api.post<{ created: number }>('/admin/fees/generate', { month });
      this.notice.set(`${out.created} mensalidades criadas para ${month}.`);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro ao gerar');
    }
  }

  protected async retry(id: string) {
    try {
      await this.api.post(`/admin/payments/${id}/retry-receipt`);
      this.notice.set('O recibo volta a ser tentado nos próximos 2 minutos.');
      this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro');
    }
  }

  protected status(s: string) {
    return STATUS[s] ?? s;
  }
  protected method(m: string) {
    return METHOD[m] ?? m;
  }
  protected receipt(s: string) {
    return RECEIPT[s] ?? s;
  }
}
