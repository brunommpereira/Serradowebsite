import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { isValidNif } from '../../../core/validators';
import { PAY_METHODS, PendingItem, RegistryApi } from '../data/registry';

/**
 * Registar um pagamento feito na secretaria (numerário, transferência, MB WAY ao balcão…):
 * escolhem-se as quotas/mensalidades por pagar, quem pagou e se se emite a fatura-recibo no Moloni.
 */
@Component({
  selector: 'sfc-manual-payment',
  imports: [CurrencyPipe, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="adm-panel block">
      <h2>Registar pagamento feito na secretaria</h2>
      <form class="search" (submit)="$event.preventDefault(); search()">
        <label class="visually-hidden" for="mp-q">Procurar</label>
        <input id="mp-q" class="adm-search" type="search" name="q" [(ngModel)]="q" placeholder="Nome, n.º de sócio ou código do atleta…" />
        <button type="submit" class="btn btn--outline btn--sm">Procurar</button>
      </form>

      @if (searched()) {
        <ul class="items">
          @for (i of items(); track i.kind + i.id) {
            <li [class.off]="i.inProgress">
              <label>
                <input type="checkbox" [checked]="selected().has(key(i))" [disabled]="i.inProgress" (change)="toggle(i)" />
                <span>
                  <strong>{{ i.label }}</strong> · {{ i.who }}{{ i.memberNumber ? ' (sócio ' + i.memberNumber + ')' : '' }}
                  <small>vence {{ i.dueDate | date: 'dd/MM/y' }}{{ i.inProgress ? ' · pagamento online em curso' : '' }}</small>
                </span>
              </label>
              <span class="amt">{{ i.amount | currency: 'EUR' }}</span>
            </li>
          } @empty {
            <li class="caption">Nada por pagar com esta pesquisa.</li>
          }
        </ul>
      }

      @if (chosen().length) {
        <form class="grid" (submit)="$event.preventDefault(); record()">
          <div class="field">
            <label for="mp-method">Como pagou</label>
            <select id="mp-method" name="method" [(ngModel)]="method">
              @for (m of methods; track m[0]) {
                <option [value]="m[0]">{{ m[1] }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="mp-date">Data</label>
            <input id="mp-date" name="date" type="date" [(ngModel)]="paidOn" required [max]="today" />
          </div>
          <div class="field">
            <label for="mp-name">Quem pagou</label>
            <input id="mp-name" name="name" [(ngModel)]="payerName" required minlength="2" />
          </div>
          <div class="field">
            <label for="mp-nif">NIF (vazio = consumidor final)</label>
            <input id="mp-nif" name="nif" [(ngModel)]="payerNif" inputmode="numeric" maxlength="9" [attr.aria-invalid]="nifInvalid()" />
          </div>
          <div class="field">
            <label for="mp-email">Email para a fatura-recibo</label>
            <input id="mp-email" name="email" type="email" [(ngModel)]="payerEmail" />
          </div>
          <div class="field">
            <label for="mp-note">Nota</label>
            <input id="mp-note" name="note" [(ngModel)]="note" maxlength="300" placeholder="ex.: transferência de 03/03" />
          </div>
          <label class="check wide">
            <input type="checkbox" name="receipt" [(ngModel)]="receipt" />
            Emitir a fatura-recibo no Moloni{{ payerEmail ? ' e enviá-la por email' : '' }}
          </label>
          @if (error(); as e) {
            <p class="alert alert--warning wide" role="alert">{{ e }}</p>
          }
          <div class="wide">
            <button type="submit" class="btn btn--primary" [disabled]="busy() || nifInvalid()">Registar {{ total() | currency: 'EUR' }} como pago</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .search {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 0.6rem;
    }
    .items {
      list-style: none;
      padding: 0;
      margin: 0 0 1rem;
      li {
        display: flex;
        justify-content: space-between;
        gap: 0.8rem;
        align-items: center;
        padding: 0.5rem 0;
        border-top: 1px solid var(--color-line);
      }
      label {
        display: flex;
        gap: 0.6rem;
        align-items: flex-start;
      }
      input {
        margin-top: 0.25rem;
        width: 1.1rem;
        height: 1.1rem;
      }
      small {
        display: block;
        color: var(--color-muted);
      }
      .off {
        opacity: 0.6;
      }
    }
    .amt {
      font-weight: 700;
      white-space: nowrap;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.2rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
    .check {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin: 0.4rem 0 0.8rem;
    }
  `,
})
export class ManualPaymentComponent implements OnInit {
  private readonly api = inject(RegistryApi);
  /** Pesquisa inicial (ex.: vindo da ficha do sócio) */
  readonly initial = input('');
  readonly recorded = output<string>();

  protected readonly methods = PAY_METHODS;
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected q = '';
  protected method = 'cash';
  protected paidOn = this.today;
  protected payerName = '';
  protected payerNif = '';
  protected payerEmail = '';
  protected note = '';
  protected receipt = true;
  protected readonly items = signal<PendingItem[]>([]);
  protected readonly searched = signal(false);
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly chosen = computed(() => this.items().filter((i) => this.selected().has(this.key(i))));
  protected readonly total = computed(() => this.chosen().reduce((s, i) => s + i.amount, 0));
  private started = false;

  ngOnInit() {
    if (this.initial() && !this.started) {
      this.started = true;
      this.q = this.initial();
      this.search();
    }
  }

  protected key(i: PendingItem) {
    return `${i.kind}:${i.id}`;
  }

  protected nifInvalid() {
    return !!this.payerNif.trim() && !isValidNif(this.payerNif.trim());
  }

  async search() {
    this.error.set(null);
    try {
      this.items.set(await this.api.pending(this.q.trim() || undefined));
      this.selected.set(new Set());
      this.searched.set(true);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  toggle(i: PendingItem) {
    const s = new Set(this.selected());
    if (s.has(this.key(i))) s.delete(this.key(i));
    else s.add(this.key(i));
    this.selected.set(s);
    // Sugere quem paga a partir do primeiro item escolhido
    const first = this.chosen()[0];
    if (first && !this.payerName) {
      this.payerName = first.payerName;
      this.payerEmail = first.payerEmail;
      this.payerNif = first.payerNif ?? '';
    }
  }

  async record() {
    if (this.busy() || !this.chosen().length) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const out = await this.api.recordPayment({
        items: this.chosen().map((i) => ({ kind: i.kind, id: i.id })),
        method: this.method,
        paidOn: this.paidOn,
        payerName: this.payerName.trim(),
        payerEmail: this.payerEmail.trim(),
        payerNif: this.payerNif.trim() || null,
        note: this.note.trim(),
        receipt: this.receipt,
      });
      this.recorded.emit(out.receiptStatus === 'pending' ? 'Pagamento registado. A fatura-recibo é emitida nos próximos 2 minutos.' : 'Pagamento registado (sem fatura-recibo).');
      this.payerName = this.payerNif = this.payerEmail = this.note = '';
      await this.search();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
