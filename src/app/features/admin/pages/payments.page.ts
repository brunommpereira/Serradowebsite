import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { ActivatedRoute } from '@angular/router';
import { ManualPaymentComponent } from './manual-payment.component';
import { QuotaPlansComponent } from './quota-plans.component';

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
  provider: 'stripe' | 'manual';
  note: string;
}

const SPORTS = [
  { slug: 'futsal', label: 'Escola de Futsal' },
  { slug: 'rugby', label: 'Escola de Rugby' },
];
const STATUS: Record<string, string> = { open: 'Em curso', paid: 'Pago', failed: 'Falhou', expired: 'Expirado' };
const METHOD: Record<string, string> = { card: 'Cartão', mb_way: 'MB WAY', multibanco: 'Multibanco', cash: 'Numerário', transfer: 'Transferência', cheque: 'Cheque' };
const RECEIPT: Record<string, string> = { none: '—', pending: 'Em emissão', failed: 'Falhou', issued: 'Emitido' };

/** Tesouraria: valores das mensalidades, geração mensal e pagamentos online com o estado do recibo (Moloni ON). */
@Component({
  selector: 'sfc-admin-payments',
  imports: [CurrencyPipe, DatePipe, IconComponent, OfflineNoticeComponent, ManualPaymentComponent, QuotaPlansComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Pagamentos</h1>
        <p>Quotas e mensalidades pagas online (Stripe) ou na secretaria, e faturas-recibo emitidas no Moloni ON.</p>
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

      @if (manage) {
        <sfc-manual-payment [initial]="registar" (recorded)="notice.set($event); load()" />
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
              @if (manage) {
                <button class="btn btn--primary btn--sm" type="submit">Guardar</button>
              }
            </form>
          }
        </div>
        @if (manage) {
        <form class="plan" (submit)="$event.preventDefault(); generate(month.value)">
          <strong>Gerar mensalidades e quotas</strong>
          <label>Mês <input #month type="month" [value]="thisMonth" required /></label>
          <button class="btn btn--outline btn--sm" type="submit">Gerar agora</button>
          <span class="caption">Repetir não duplica.</span>
        </form>
        }
      </section>

      <sfc-quota-plans [manage]="manage" />

      <section class="adm-panel block">
        <h2>Pagamentos e faturas-recibo</h2>
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
                  <td>{{ status(p.status) }}@if (p.method) {<br /><span class="caption">{{ method(p.method) }}{{ p.provider === 'manual' ? ' · secretaria' : '' }}</span>}@if (p.note) {<br /><span class="caption">{{ p.note }}</span>}</td>
                  <td>
                    @if (p.hasReceipt) {
                      <a [href]="api.baseUrl + '/admin/payments/' + p.id + '/receipt'" download><sfc-icon name="download" size="16" /> {{ p.receiptNumber }}</a>
                    } @else {
                      {{ receipt(p.receiptStatus) }}
                      @if (p.receiptStatus === 'failed') {
                        <br /><span class="caption">{{ p.receiptError }} ({{ p.receiptAttempts }} tentativas)</span>
                        @if (manage) {
                          <br /><button type="button" class="btn btn--outline btn--sm" (click)="retry(p.id)">Tentar outra vez</button>
                        }
                      }
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="caption">Ainda não há pagamentos.</td></tr>
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
  /** Tesouraria (payments.manage): altera valores, gera mensalidades e repete recibos; os outros só consultam */
  protected readonly manage = inject(AuthService).can('payments.manage');
  protected readonly sports = SPORTS;
  protected readonly thisMonth = new Date().toISOString().slice(0, 7);
  /** ?registar=<n.º de sócio>: vem da ficha do sócio, já com a pesquisa feita */
  protected readonly registar = inject(ActivatedRoute).snapshot.queryParamMap.get('registar') ?? '';
  protected readonly plans = signal<FeePlan[]>([]);
  protected readonly payments = signal<AdminPayment[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  constructor() {
    if (this.api.enabled) this.load();
  }

  protected async load() {
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
      const out = await this.api.post<{ created: number; quotas: number }>('/admin/fees/generate', { month });
      this.notice.set(`${out.created} mensalidades e ${out.quotas} quotas criadas para ${month}.`);
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
