import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/services/auth.service';
import { DialogComponent } from '../../../shared/dialog.component';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { toCsv } from '../../../shared/tabular';

type Status = 'pedido' | 'aprovado_nucleo' | 'aprovado' | 'pago' | 'rejeitado' | 'anulado';
type Action = 'nucleo' | 'final' | 'pay' | 'cancel' | 'invoice' | 'upload';
type Tab = 'todo' | 'mine' | 'all' | 'nucleos';

interface Option {
  key: string;
  label: string;
}
interface Meta {
  nucleos: Option[];
  categories: string[];
  methods: Option[];
  fileKinds: Option[];
  myNucleos: string[];
  me: string;
}
interface Expense {
  id: number;
  number: string;
  nucleo: string;
  category: string;
  title: string;
  supplier: string;
  amount: string;
  dueDate: string | null;
  status: Status;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  nucleoAt: string | null;
  nucleoAmount: string | null;
  nucleoByName: string | null;
  finalAt: string | null;
  finalByName: string | null;
  paidOn: string | null;
  paidAmount: string | null;
  paidMethod: string | null;
  accountCode: string;
  docNumber: string;
  invoiceReceivedAt: string | null;
  rejectedAt: string | null;
  files: number;
  actions: Action[];
}
interface ExpenseDetail extends Omit<Expense, 'files'> {
  purpose: string;
  supplierNif: string | null;
  paymentInfo: string;
  nucleoNote: string;
  finalNote: string;
  rejectReason: string;
  files: {
    id: string;
    kind: string;
    name: string;
    size: number;
    createdAt: string;
    uploadedBy: string | null;
  }[];
  events: { at: string; action: string; note: string; by: string | null }[];
}
interface Person {
  id: string;
  name: string;
  email: string;
}
interface Approvers {
  nucleos: (Option & { approvers: Person[] })[];
  candidates: Person[];
}
interface FileIn {
  name: string;
  data: string;
}

const STATUS: Record<Status, string> = {
  pedido: 'À espera do núcleo',
  aprovado_nucleo: 'À espera da tesouraria',
  aprovado: 'Aprovado, por pagar',
  pago: 'Pago',
  rejeitado: 'Rejeitado',
  anulado: 'Anulado',
};
const EVENTS: Record<string, string> = {
  pedido: 'Pedido feito',
  aprovado_nucleo: 'Aprovado pelo núcleo',
  rejeitado_nucleo: 'Rejeitado pelo núcleo',
  aprovado: 'Aprovação final (tesouraria)',
  rejeitado: 'Rejeitado pela tesouraria',
  pago: 'Pago',
  anulado: 'Anulado por quem pediu',
  anexo: 'Anexo',
  fatura_recebida: 'Fatura/recibo final recebida',
  fatura_em_falta: 'Fatura/recibo final marcada em falta',
};
const MAX_FILE = 10 * 1024 * 1024;
const today = () => new Date().toISOString().slice(0, 10);

function readFile(file: File): Promise<FileIn> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE) return reject(new Error(`«${file.name}» tem mais de 10 MB`));
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, data: String(r.result).split(',')[1] ?? '' });
    r.onerror = () => reject(new Error(`Não foi possível ler «${file.name}»`));
    r.readAsDataURL(file);
  });
}

/**
 * Pedidos de gasto: o elemento da direção pede, o tesoureiro do núcleo aprova e o tesoureiro da direção
 * dá a aprovação final e regista o pagamento. Cada passo envia o email correspondente.
 */
@Component({
  selector: 'sfc-admin-expenses',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FormsModule,
    DialogComponent,
    IconComponent,
    OfflineNoticeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Pedidos de gasto</h1>
        <p>
          Pedido (direção) → aprovação do tesoureiro do núcleo → aprovação final e pagamento pela
          tesouraria. Cada passo envia um email.
        </p>
      </div>
      @if (api.enabled && canRequest) {
        <button type="button" class="btn btn--primary" (click)="openNew()">
          <sfc-icon name="card" size="18" /> Novo pedido
        </button>
      }
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="Os pedidos de gasto funcionam com o site ligado à API (VPS)."
      />
    } @else {
      @if (error()) {
        <p class="alert alert--warning adm-error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="alert alert--success" role="status">{{ notice() }}</p>
      }

      <div class="chips" role="group" aria-label="Vista">
        <button
          type="button"
          class="chip"
          [attr.aria-pressed]="tab() === 'todo'"
          (click)="go('todo')"
        >
          À espera de mim
        </button>
        @if (canRequest) {
          <button
            type="button"
            class="chip"
            [attr.aria-pressed]="tab() === 'mine'"
            (click)="go('mine')"
          >
            Os meus pedidos
          </button>
        }
        @if (canSeeAll) {
          <button
            type="button"
            class="chip"
            [attr.aria-pressed]="tab() === 'all'"
            (click)="go('all')"
          >
            {{ seesEverything ? 'Folha de controlo' : 'Do meu núcleo' }}
          </button>
        }
        @if (canNucleos) {
          <button
            type="button"
            class="chip"
            [attr.aria-pressed]="tab() === 'nucleos'"
            (click)="go('nucleos')"
          >
            Núcleos
          </button>
        }
      </div>

      @if (tab() === 'nucleos') {
        <section class="adm-panel block">
          <h2>Tesoureiros de cada núcleo</h2>
          <p class="caption">
            Recebem os pedidos do núcleo e fazem o 2.º passo. Só aparecem aqui as contas com o papel
            «Tesoureiro de núcleo» ou «Tesouraria» (Gestão → Utilizadores). Se quem pede for o único
            tesoureiro do núcleo, o 2.º passo passa para a tesouraria da direção.
          </p>
          @for (n of approvers()?.nucleos ?? []; track n.key) {
            <form class="nucleo" (submit)="$event.preventDefault(); saveApprovers(n.key)">
              <strong>{{ n.label }}</strong>
              <div class="people">
                @for (p of approvers()?.candidates ?? []; track p.id) {
                  <label class="check"
                    ><input
                      type="checkbox"
                      [checked]="picked(n.key, p.id)"
                      (change)="toggle(n.key, p.id)"
                    />
                    {{ p.name }}</label
                  >
                } @empty {
                  <span class="caption">Ainda ninguém tem o papel «Tesoureiro de núcleo».</span>
                }
              </div>
              <button class="btn btn--outline btn--sm" type="submit">Guardar</button>
            </form>
          }
        </section>
      } @else {
        <section class="adm-panel block">
          @if (tab() === 'all') {
            <div class="adm-toolbar">
              <label
                >Ano
                <select [ngModel]="year()" (ngModelChange)="year.set(+$event); load()">
                  @for (y of years; track y) {
                    <option [ngValue]="y">{{ y }}</option>
                  }
                </select></label
              >
              <span class="caption"
                >{{ rows().length }} pedidos · pagos {{ paidTotal() | currency: 'EUR' }}</span
              >
              <button type="button" class="btn btn--outline btn--sm" (click)="exportCsv()">
                <sfc-icon name="download" size="16" /> Exportar (Excel)
              </button>
            </div>
          }
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Data</th>
                  <th scope="col">Requerente</th>
                  <th scope="col">Descrição</th>
                  <th scope="col" class="num">Valor</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Aprovado por / data</th>
                  <th scope="col">Pago em</th>
                  <th scope="col">Fatura</th>
                </tr>
              </thead>
              <tbody>
                @for (e of rows(); track e.id) {
                  <tr class="row" (click)="open(e.id)" tabindex="0" (keydown.enter)="open(e.id)">
                    <td class="nowrap">
                      <strong>{{ e.number }}</strong>
                    </td>
                    <td class="nowrap">{{ e.requestedAt | date: 'dd/MM/y' }}</td>
                    <td>{{ e.requestedByName }}</td>
                    <td class="desc">
                      {{ e.title }}<br /><span class="caption"
                        >{{ e.supplier }} · {{ nucleoName(e.nucleo) }}</span
                      >
                    </td>
                    <td class="num nowrap">
                      {{ +(e.paidAmount ?? e.nucleoAmount ?? e.amount) | currency: 'EUR' }}
                    </td>
                    <td>
                      <span class="badge" [class]="'badge st-' + e.status">{{
                        status(e.status)
                      }}</span>
                    </td>
                    <td>
                      @if (e.nucleoByName) {
                        {{ e.nucleoByName }} · {{ e.nucleoAt | date: 'dd/MM/y' }}
                      }
                      @if (e.finalByName) {
                        <br />{{ e.finalByName }} · {{ e.finalAt | date: 'dd/MM/y' }}
                      }
                    </td>
                    <td class="nowrap">{{ e.paidOn ? (e.paidOn | date: 'dd/MM/y') : '—' }}</td>
                    <td>
                      {{ e.status === 'pago' ? (e.invoiceReceivedAt ? 'Sim' : 'Em falta') : '—' }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="9" class="caption">
                      {{ tab() === 'todo' ? 'Nada à sua espera.' : 'Sem pedidos.' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    }

    <!-- Novo pedido -->
    <sfc-dialog heading="Novo pedido de gasto" [open]="creating()" (closed)="creating.set(false)">
      @if (error()) {
        <p class="alert alert--warning" role="alert">{{ error() }}</p>
      }
      <form class="grid" (submit)="$event.preventDefault(); create()">
        <div class="field wide">
          <label for="x-title">Descrição breve <span class="req">*</span></label>
          <input
            id="x-title"
            name="title"
            [(ngModel)]="draft.title"
            required
            minlength="3"
            maxlength="120"
            placeholder="Ex.: Bolas de treino para os sub-16"
          />
        </div>
        <div class="field wide">
          <label for="x-purpose">Finalidade</label>
          <textarea
            id="x-purpose"
            name="purpose"
            [(ngModel)]="draft.purpose"
            rows="2"
            maxlength="2000"
          ></textarea>
        </div>
        <div class="field">
          <label for="x-supplier">Fornecedor <span class="req">*</span></label>
          <input
            id="x-supplier"
            name="supplier"
            [(ngModel)]="draft.supplier"
            required
            minlength="2"
            maxlength="160"
          />
        </div>
        <div class="field">
          <label for="x-nif">NIF do fornecedor</label>
          <input
            id="x-nif"
            name="nif"
            [(ngModel)]="draft.supplierNif"
            inputmode="numeric"
            maxlength="11"
          />
        </div>
        <div class="field">
          <label for="x-amount">Valor com IVA (€) <span class="req">*</span></label>
          <input
            id="x-amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            [(ngModel)]="draft.amount"
            required
          />
        </div>
        <div class="field">
          <label for="x-due">Data limite de pagamento</label>
          <input id="x-due" name="due" type="date" [min]="todayIso" [(ngModel)]="draft.dueDate" />
        </div>
        <div class="field">
          <label for="x-nucleo">Núcleo (centro de custo) <span class="req">*</span></label>
          <select id="x-nucleo" name="nucleo" [(ngModel)]="draft.nucleo" required>
            @for (n of meta()?.nucleos ?? []; track n.key) {
              <option [value]="n.key">{{ n.label }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="x-cat">Categoria <span class="req">*</span></label>
          <select id="x-cat" name="category" [(ngModel)]="draft.category" required>
            @for (c of meta()?.categories ?? []; track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </div>
        <div class="field wide">
          <label for="x-pay">Dados para pagamento</label>
          <input
            id="x-pay"
            name="paymentInfo"
            [(ngModel)]="draft.paymentInfo"
            maxlength="300"
            placeholder="IBAN, referência Multibanco… (se já os tiver)"
          />
        </div>
        <div class="field wide">
          <label for="x-files">Anexos (fatura, orçamento) — PDF ou imagem, até 3, 10 MB cada</label>
          <input
            id="x-files"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            (change)="pickFiles($event)"
          />
        </div>
        <div class="actions wide">
          <button class="btn btn--primary" type="submit" [disabled]="busy()">Enviar pedido</button>
          <button class="btn btn--ghost" type="button" (click)="creating.set(false)">
            Cancelar
          </button>
        </div>
      </form>
    </sfc-dialog>

    <!-- Detalhe e ações -->
    <sfc-dialog
      [heading]="d() ? 'Pedido ' + d()!.number : 'Pedido'"
      [open]="!!d()"
      (closed)="close()"
    >
      @if (d(); as e) {
        @if (error()) {
          <p class="alert alert--warning" role="alert">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="alert alert--success" role="status">{{ notice() }}</p>
        }
        <p>
          <span class="badge" [class]="'badge st-' + e.status">{{ status(e.status) }}</span>
        </p>
        <dl class="facts">
          <div>
            <dt>Requerente</dt>
            <dd>{{ e.requestedByName }} · {{ e.requestedAt | date: 'dd/MM/y HH:mm' }}</dd>
          </div>
          <div>
            <dt>Descrição</dt>
            <dd>
              {{ e.title }}
              @if (e.purpose) {
                <br /><span class="caption">{{ e.purpose }}</span>
              }
            </dd>
          </div>
          <div>
            <dt>Fornecedor</dt>
            <dd>
              {{ e.supplier }}
              @if (e.supplierNif) {
                · NIF {{ e.supplierNif }}
              }
            </dd>
          </div>
          <div>
            <dt>Valor (com IVA)</dt>
            <dd>
              {{ +e.amount | currency: 'EUR' }}
              @if (e.nucleoAmount && e.nucleoAmount !== e.amount) {
                · aprovado {{ +e.nucleoAmount | currency: 'EUR' }}
              }
            </dd>
          </div>
          <div>
            <dt>Centro de custo</dt>
            <dd>{{ nucleoName(e.nucleo) }} · {{ e.category }}</dd>
          </div>
          @if (e.dueDate) {
            <div>
              <dt>Data limite</dt>
              <dd>{{ e.dueDate | date: 'dd/MM/y' }}</dd>
            </div>
          }
          @if (e.paymentInfo) {
            <div>
              <dt>Dados para pagamento</dt>
              <dd>{{ e.paymentInfo }}</dd>
            </div>
          }
          @if (e.paidOn) {
            <div>
              <dt>Pagamento</dt>
              <dd>
                {{ +(e.paidAmount ?? 0) | currency: 'EUR' }} · {{ method(e.paidMethod) }} ·
                {{ e.paidOn | date: 'dd/MM/y' }}
              </dd>
            </div>
            <div>
              <dt>Registo contabilístico</dt>
              <dd>Conta {{ e.accountCode || '—' }} · Documento {{ e.docNumber || '—' }}</dd>
            </div>
            <div>
              <dt>Fatura/recibo final</dt>
              <dd>
                {{
                  e.invoiceReceivedAt
                    ? 'Recebida a ' + (e.invoiceReceivedAt | date: 'dd/MM/y')
                    : 'Em falta'
                }}
              </dd>
            </div>
          }
          @if (e.rejectReason) {
            <div>
              <dt>Motivo da rejeição</dt>
              <dd>{{ e.rejectReason }}</dd>
            </div>
          }
        </dl>

        <h3 class="h-sub">Anexos</h3>
        <ul class="files">
          @for (f of e.files; track f.id) {
            <li>
              <a [href]="api.baseUrl + '/admin/expenses/files/' + f.id" download
                ><sfc-icon name="download" size="16" /> {{ f.name }}</a
              >
              <span class="caption"
                >{{ kind(f.kind) }} · {{ f.size / 1024 | number: '1.0-0' }} KB</span
              >
            </li>
          } @empty {
            <li class="caption">Sem anexos.</li>
          }
        </ul>

        @if (has('nucleo')) {
          <form class="step" (submit)="$event.preventDefault()">
            <h3 class="h-sub">Decisão do núcleo</h3>
            <div class="grid">
              <div class="field">
                <label for="n-amount">Valor aprovado (€)</label>
                <input
                  id="n-amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  [max]="+e.amount"
                  [(ngModel)]="step.amount"
                />
              </div>
              <div class="field wide">
                <label for="n-note">Observações / condições (obrigatório para rejeitar)</label>
                <textarea
                  id="n-note"
                  name="note"
                  rows="2"
                  maxlength="1000"
                  [(ngModel)]="step.note"
                ></textarea>
              </div>
            </div>
            <div class="actions">
              <button
                class="btn btn--primary"
                type="button"
                [disabled]="busy()"
                (click)="act('nucleo', { approve: true, amount: step.amount, note: step.note })"
              >
                Aprovar
              </button>
              <button
                class="btn btn--outline"
                type="button"
                [disabled]="busy()"
                (click)="act('nucleo', { approve: false, note: step.note })"
              >
                Rejeitar
              </button>
            </div>
          </form>
        }

        @if (has('pay')) {
          <form class="step" (submit)="$event.preventDefault(); pay()">
            <h3 class="h-sub">{{ has('final') ? 'Aprovação final e pagamento' : 'Pagamento' }}</h3>
            <div class="grid">
              <div class="field">
                <label for="p-date">Data do pagamento <span class="req">*</span></label>
                <input
                  id="p-date"
                  name="paidOn"
                  type="date"
                  [max]="todayIso"
                  [(ngModel)]="step.paidOn"
                  required
                />
              </div>
              <div class="field">
                <label for="p-amount">Valor pago (€) <span class="req">*</span></label>
                <input
                  id="p-amount"
                  name="paid"
                  type="number"
                  min="0.01"
                  step="0.01"
                  [(ngModel)]="step.paidAmount"
                  required
                />
              </div>
              <div class="field">
                <label for="p-method">Meio <span class="req">*</span></label>
                <select id="p-method" name="method" [(ngModel)]="step.method" required>
                  @for (m of meta()?.methods ?? []; track m.key) {
                    <option [value]="m.key">{{ m.label }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="p-account">Conta (SNC)</label>
                <input
                  id="p-account"
                  name="account"
                  [(ngModel)]="step.accountCode"
                  maxlength="20"
                  placeholder="Ex.: 62"
                />
              </div>
              <div class="field">
                <label for="p-doc">N.º da fatura do fornecedor</label>
                <input id="p-doc" name="doc" [(ngModel)]="step.docNumber" maxlength="60" />
              </div>
              <div class="field">
                <label for="p-proof">Comprovativo</label>
                <input
                  id="p-proof"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  (change)="pickProof($event)"
                />
              </div>
              <div class="field wide">
                <label for="p-note">Observações</label>
                <textarea
                  id="p-note"
                  name="note"
                  rows="2"
                  maxlength="1000"
                  [(ngModel)]="step.note"
                ></textarea>
              </div>
            </div>
            <div class="actions">
              <button class="btn btn--primary" type="submit" [disabled]="busy()">
                {{ has('final') ? 'Aprovar e registar o pagamento' : 'Registar o pagamento' }}
              </button>
              @if (has('final')) {
                <button
                  class="btn btn--outline"
                  type="button"
                  [disabled]="busy()"
                  (click)="act('final', { approve: true, note: step.note })"
                >
                  Só aprovar (pagar depois)
                </button>
                <button
                  class="btn btn--ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="act('final', { approve: false, note: step.note })"
                >
                  Rejeitar
                </button>
              }
            </div>
          </form>
        }

        @if (has('upload')) {
          <form class="step inline" (submit)="$event.preventDefault(); upload()">
            <label>
              Juntar
              <select name="kind" [(ngModel)]="step.kind">
                @for (k of meta()?.fileKinds ?? []; track k.key) {
                  <option [value]="k.key">{{ k.label }}</option>
                }
              </select>
            </label>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              aria-label="Ficheiro a juntar"
              (change)="pickExtra($event)"
            />
            <button class="btn btn--outline btn--sm" type="submit" [disabled]="busy() || !extra">
              Juntar anexo
            </button>
          </form>
        }

        <div class="actions">
          @if (has('invoice')) {
            <button
              class="btn btn--outline btn--sm"
              type="button"
              [disabled]="busy()"
              (click)="act('invoice', { received: !e.invoiceReceivedAt })"
            >
              {{ e.invoiceReceivedAt ? 'Marcar fatura em falta' : 'Marcar fatura recebida' }}
            </button>
          }
          @if (has('cancel')) {
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              [disabled]="busy()"
              (click)="act('cancel', {})"
            >
              Anular o pedido
            </button>
          }
        </div>

        <h3 class="h-sub">Histórico</h3>
        <ol class="events">
          @for (ev of e.events; track $index) {
            <li>
              <span class="caption">{{ ev.at | date: 'dd/MM/y HH:mm' }}</span>
              {{ eventName(ev.action) }}
              @if (ev.by) {
                — {{ ev.by }}
              }
              @if (ev.note) {
                <br /><span class="caption">{{ ev.note }}</span>
              }
            </li>
          }
        </ol>
      }
    </sfc-dialog>
  `,
  styles: `
    .chips {
      margin-bottom: 1rem;
    }
    .row {
      cursor: pointer;
    }
    .desc {
      min-width: 14rem;
    }
    .row:hover,
    .row:focus-visible {
      background: var(--color-bg-soft);
    }
    .adm-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
      select {
        margin-left: 0.35rem;
      }
    }
    .st-pedido,
    .st-aprovado_nucleo {
      background: #fff4d6;
      color: #7a5200;
    }
    .st-aprovado {
      background: var(--sfc-blue-50);
      color: var(--sfc-blue);
    }
    .st-pago {
      background: #e3f4e7;
      color: var(--color-success);
    }
    .st-rejeitado,
    .st-anulado {
      background: #f3f4f6;
      color: var(--color-muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 0.6rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0.75rem 0;
    }
    .facts {
      display: grid;
      gap: 0.4rem;
      margin: 0.5rem 0 1rem;
      div {
        display: grid;
        grid-template-columns: 11rem 1fr;
        gap: 0.75rem;
      }
      dt {
        font-weight: 600;
        color: var(--color-muted);
      }
      dd {
        margin: 0;
      }
      @media (max-width: 560px) {
        div {
          grid-template-columns: 1fr;
          gap: 0;
        }
      }
    }
    .h-sub {
      font-size: 1rem;
      margin: 1rem 0 0.5rem;
    }
    .files,
    .events {
      margin: 0;
      padding-left: 1.1rem;
      display: grid;
      gap: 0.35rem;
    }
    .files a {
      display: inline-flex;
      gap: 0.35rem;
      align-items: center;
      margin-right: 0.5rem;
    }
    .step {
      border-top: 1px solid var(--color-line);
      margin-top: 1rem;
      padding-top: 0.25rem;
    }
    .step.inline {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      padding-top: 1rem;
    }
    .nucleo {
      display: grid;
      grid-template-columns: 11rem 1fr auto;
      gap: 1rem;
      align-items: center;
      padding: 0.6rem 0;
      border-top: 1px solid var(--color-line);
      @media (max-width: 720px) {
        grid-template-columns: 1fr;
        gap: 0.4rem;
      }
    }
    .people {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 1.2rem;
    }
    .check {
      display: inline-flex;
      gap: 0.4rem;
      align-items: center;
    }
  `,
})
export class ExpensesPage {
  protected readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  protected readonly canRequest = this.auth.can('expenses.request');
  protected readonly seesEverything = this.auth.can('expenses.view', 'expenses.pay');
  protected readonly canSeeAll = this.seesEverything || this.auth.can('expenses.approve');
  protected readonly canNucleos = this.auth.can('expenses.pay', 'users.manage');
  protected readonly todayIso = today();
  protected readonly years = Array.from(
    { length: new Date().getFullYear() - 2025 },
    (_, i) => new Date().getFullYear() - i,
  );

  protected readonly meta = signal<Meta | null>(null);
  protected readonly tab = signal<Tab>('todo');
  protected readonly year = signal(new Date().getFullYear());
  protected readonly rows = signal<Expense[]>([]);
  protected readonly d = signal<ExpenseDetail | null>(null);
  protected readonly approvers = signal<Approvers | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly creating = signal(false);
  protected readonly paidTotal = computed(() =>
    this.rows().reduce((s, e) => s + (e.status === 'pago' ? Number(e.paidAmount ?? 0) : 0), 0),
  );

  protected draft = this.emptyDraft();
  protected files: FileIn[] = [];
  protected proof: FileIn | null = null;
  protected extra: FileIn | null = null;
  protected step = this.emptyStep();
  private picks = new Map<string, Set<string>>();

  constructor() {
    if (!this.api.enabled) return;
    this.api.get<Meta>('/admin/expenses/meta').then(
      (m) => this.meta.set(m),
      (e) => this.fail(e),
    );
    this.load();
    // Ligação do email: ?id=12 abre o pedido
    const id = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('id'));
    if (id) this.open(id);
  }

  protected status(s: Status) {
    return STATUS[s];
  }
  protected eventName(a: string) {
    return EVENTS[a] ?? a;
  }
  protected nucleoName(k: string) {
    return this.meta()?.nucleos.find((n) => n.key === k)?.label ?? k;
  }
  protected method(k: string | null) {
    return this.meta()?.methods.find((m) => m.key === k)?.label ?? k ?? '';
  }
  protected kind(k: string) {
    return this.meta()?.fileKinds.find((m) => m.key === k)?.label ?? k;
  }
  protected has(a: Action) {
    return !!this.d()?.actions.includes(a);
  }

  protected go(t: Tab) {
    this.tab.set(t);
    if (t === 'nucleos') this.loadApprovers();
    else this.load();
  }

  protected async load() {
    const t = this.tab();
    if (t === 'nucleos') return;
    try {
      this.rows.set(
        await this.api.get<Expense[]>('/admin/expenses', {
          scope: t,
          year: t === 'all' ? this.year() : undefined,
        }),
      );
    } catch (e) {
      this.fail(e);
    }
  }

  protected async open(id: number) {
    this.error.set(null);
    try {
      const e = await this.api.get<ExpenseDetail>(`/admin/expenses/${id}`);
      this.step = this.emptyStep();
      this.step.amount = Number(e.amount);
      this.step.paidAmount = Number(e.nucleoAmount ?? e.amount);
      this.proof = null;
      this.extra = null;
      this.d.set(e);
    } catch (err) {
      this.fail(err);
    }
  }

  protected close() {
    this.d.set(null);
  }

  protected openNew() {
    this.draft = this.emptyDraft();
    this.files = [];
    this.creating.set(true);
  }

  protected async pickFiles(ev: Event) {
    const list = Array.from((ev.target as HTMLInputElement).files ?? []);
    if (list.length > 3) {
      this.error.set('No máximo 3 anexos.');
      return;
    }
    try {
      this.files = await Promise.all(list.map(readFile));
    } catch (e) {
      this.fail(e);
      (ev.target as HTMLInputElement).value = '';
    }
  }

  protected async pickProof(ev: Event) {
    this.proof = await this.pickOne(ev);
  }

  protected async pickExtra(ev: Event) {
    this.extra = await this.pickOne(ev);
  }

  private async pickOne(ev: Event): Promise<FileIn | null> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    try {
      return f ? await readFile(f) : null;
    } catch (e) {
      this.fail(e);
      input.value = '';
      return null;
    }
  }

  protected async create() {
    const x = this.draft;
    if (!x.title.trim() || !x.supplier.trim() || !(Number(x.amount) > 0)) {
      this.error.set('Preencha a descrição, o fornecedor e o valor.');
      return;
    }
    await this.run(async () => {
      const out = await this.api.post<{ id: number; number: string }>('/admin/expenses', {
        ...x,
        amount: Number(x.amount).toFixed(2),
        supplierNif: x.supplierNif.replace(/\s/g, '') || null,
        dueDate: x.dueDate || null,
        files: this.files,
      });
      this.creating.set(false);
      this.notice.set(`Pedido ${out.number} enviado ao tesoureiro do núcleo.`);
      this.go(this.canRequest ? 'mine' : 'todo');
    });
  }

  protected async act(
    action: 'nucleo' | 'final' | 'cancel' | 'invoice',
    body: Record<string, unknown>,
  ) {
    const e = this.d();
    if (!e) return;
    if ('amount' in body) body['amount'] = Number(body['amount']).toFixed(2);
    await this.run(async () => {
      await this.api.post(`/admin/expenses/${e.id}/${action}`, body);
      this.notice.set(
        {
          nucleo: body['approve']
            ? 'Pedido aprovado: seguiu para a tesouraria.'
            : 'Pedido rejeitado.',
          final: body['approve'] ? 'Aprovação final registada.' : 'Pedido rejeitado.',
          cancel: 'Pedido anulado.',
          invoice: 'Registado.',
        }[action],
      );
      await this.afterAction(e.id);
    });
  }

  protected async pay() {
    const e = this.d();
    if (!e) return;
    const s = this.step;
    await this.run(async () => {
      await this.api.post(`/admin/expenses/${e.id}/pay`, {
        paidOn: s.paidOn,
        amount: Number(s.paidAmount).toFixed(2),
        method: s.method,
        accountCode: s.accountCode,
        docNumber: s.docNumber,
        note: s.note,
        proof: this.proof,
      });
      this.notice.set(
        `Pagamento do pedido ${e.number} registado. Foi enviada a confirmação a quem pediu e ao Presidente.`,
      );
      await this.afterAction(e.id);
    });
  }

  protected async upload() {
    const e = this.d();
    if (!e || !this.extra) return;
    await this.run(async () => {
      await this.api.post(`/admin/expenses/${e.id}/files`, { kind: this.step.kind, ...this.extra });
      this.notice.set('Anexo junto ao pedido.');
      await this.afterAction(e.id);
    });
  }

  protected exportCsv() {
    const head = [
      'N.º',
      'Data',
      'Requerente',
      'Núcleo',
      'Categoria',
      'Descrição',
      'Fornecedor',
      'Valor pedido',
      'Estado',
      'Aprovado (núcleo) por / data',
      'Aprovação final por / data',
      'Pago em',
      'Valor pago',
      'Meio',
      'Conta',
      'Documento',
      'Fatura recebida',
    ];
    const eur = (v: string | null) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
    const dt = (v: string | null) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');
    const lines = this.rows().map((e) => [
      e.number,
      dt(e.requestedAt),
      e.requestedByName,
      this.nucleoName(e.nucleo),
      e.category,
      e.title,
      e.supplier,
      eur(e.amount),
      STATUS[e.status],
      e.nucleoByName ? `${e.nucleoByName} · ${dt(e.nucleoAt)}` : '',
      e.finalByName ? `${e.finalByName} · ${dt(e.finalAt)}` : '',
      dt(e.paidOn),
      eur(e.paidAmount),
      this.method(e.paidMethod),
      e.accountCode,
      e.docNumber,
      e.status === 'pago' ? (e.invoiceReceivedAt ? `Sim · ${dt(e.invoiceReceivedAt)}` : 'Não') : '',
    ]);
    const url = URL.createObjectURL(
      new Blob([toCsv([head, ...lines])], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos-de-gasto-${this.year()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------ núcleos
  protected async loadApprovers() {
    try {
      const a = await this.api.get<Approvers>('/admin/expenses-approvers');
      this.picks = new Map(a.nucleos.map((n) => [n.key, new Set(n.approvers.map((p) => p.id))]));
      this.approvers.set(a);
    } catch (e) {
      this.fail(e);
    }
  }
  protected picked(nucleo: string, id: string) {
    return !!this.picks.get(nucleo)?.has(id);
  }
  protected toggle(nucleo: string, id: string) {
    const s = this.picks.get(nucleo) ?? new Set<string>();
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.picks.set(nucleo, s);
  }
  protected async saveApprovers(nucleo: string) {
    await this.run(async () => {
      await this.api.put(`/admin/expenses-approvers/${nucleo}`, {
        userIds: [...(this.picks.get(nucleo) ?? [])],
      });
      this.notice.set(`Tesoureiros do núcleo ${this.nucleoName(nucleo)} guardados.`);
      await this.loadApprovers();
    });
  }

  // ------------------------------------------------------------ ajudas
  private async afterAction(id: number) {
    await this.load();
    await this.open(id);
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await fn();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(e: unknown) {
    this.error.set(e instanceof Error ? e.message : 'Não foi possível concluir o pedido');
  }

  private emptyDraft() {
    return {
      title: '',
      purpose: '',
      supplier: '',
      supplierNif: '',
      amount: null as number | null,
      dueDate: '',
      nucleo: 'direcao',
      category: 'Material e equipamentos',
      paymentInfo: '',
    };
  }

  private emptyStep() {
    return {
      amount: 0,
      note: '',
      paidOn: today(),
      paidAmount: 0,
      method: 'transferencia',
      accountCode: '',
      docNumber: '',
      kind: 'recibo',
    };
  }
}
