import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { DialogComponent } from '../../../shared/dialog.component';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { AthleteSuggestion, MEMBER_STATUS, MemberDetail, MemberRow, RegistryApi } from '../data/registry';

type Draft = Partial<MemberDetail> & { memberNumber?: string };

const EMPTY: Draft = { name: '', email: '', phone: '', taxNumber: '', birthDate: '', address: '', postalCode: '', city: '', category: 'Efetivo', status: 'Ativo', joinedOn: '', notes: '' };

/** Sócios: lista, ficha, criar e alterar, conta no site e quotas. */
@Component({
  selector: 'sfc-admin-members',
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, DialogComponent, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Sócios</h1>
        <p>{{ list().length }} sócio(s){{ status() ? ' · ' + status() : '' }}. A conta no site liga-se pelo email.</p>
      </div>
      @if (api.enabled && auth.can('members.manage')) {
        <div class="quick">
          <a class="btn btn--outline btn--sm" routerLink="/admin/importar" [queryParams]="{ tipo: 'socios' }"><sfc-icon name="upload" size="16" />Importar ficheiro</a>
          <button type="button" class="btn btn--primary btn--sm" (click)="startNew()">Novo sócio</button>
        </div>
      }
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="A gestão de sócios funciona com o site ligado à API (VPS). No modo demonstração não há sócios para gerir." />
    } @else {
      <div class="adm-toolbar">
        <label class="visually-hidden" for="m-q">Pesquisar sócio</label>
        <input id="m-q" class="adm-search" type="search" placeholder="Nome, email ou n.º de sócio…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        <label class="visually-hidden" for="m-st">Estado</label>
        <select id="m-st" class="sel" [ngModel]="status()" (ngModelChange)="status.set($event)">
          <option value="">Todos os estados</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
      </div>

      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status" aria-live="polite">{{ m.text }}</p>
      }

      <div class="adm-table-wrap">
        <table class="adm-table">
          <caption class="visually-hidden">Sócios</caption>
          <thead>
            <tr>
              <th scope="col">N.º</th>
              <th scope="col">Sócio</th>
              <th scope="col" class="hide-sm">Categoria</th>
              <th scope="col">Estado</th>
              <th scope="col" class="hide-sm">Quotas</th>
              <th scope="col" class="act"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (m of list(); track m.memberNumber) {
              <tr>
                <td class="mono">{{ m.memberNumber }}</td>
                <td>
                  <strong>{{ m.name }}</strong>
                  <span class="caption sub">{{ m.email || 'sem email' }}{{ m.hasAccount ? ' · conta no site' : '' }}{{ m.athletes ? ' · ' + m.athletes + ' atleta(s)' : '' }}</span>
                </td>
                <td class="hide-sm">{{ m.category }}</td>
                <td><span class="st" [class]="'st ' + statusClass(m.status)">{{ m.status }}</span></td>
                <td class="hide-sm">
                  @if (m.overdue) {
                    <span class="st st--bad">{{ m.overdue }} em atraso</span>
                  } @else {
                    <span class="caption">em dia</span>
                  }
                </td>
                <td class="act"><button type="button" class="btn btn--outline btn--sm" (click)="open(m.memberNumber)">Abrir</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="adm-empty">{{ loading() ? 'A carregar…' : 'Nenhum sócio com estes filtros.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }

    <!-- Ficha -->
    <sfc-dialog [heading]="detail() ? 'Sócio n.º ' + detail()!.memberNumber : 'Sócio'" [open]="!!detail() && !draft()" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="sum">
          <div>
            <strong class="sum__name">{{ d.name }}</strong>
            <span class="caption">{{ d.category }} · sócio desde {{ d.joinedOn | date: 'dd/MM/y' }}</span>
          </div>
          <span class="st" [class]="'st ' + statusClass(d.status)">{{ d.status }}</span>
        </div>
        <dl class="dl">
          <div><dt>Email</dt><dd>{{ d.email || '—' }}</dd></div>
          <div><dt>Telemóvel</dt><dd>{{ d.phone || '—' }}</dd></div>
          <div><dt>NIF</dt><dd>{{ d.taxNumber || '—' }}</dd></div>
          <div><dt>Nascimento</dt><dd>{{ d.birthDate ? (d.birthDate | date: 'dd/MM/y') : '—' }}</dd></div>
          <div class="wide"><dt>Morada</dt><dd>{{ [d.address, d.postalCode, d.city].filter(isSet).join(', ') || '—' }}</dd></div>
          @if (d.notes) {
            <div class="wide"><dt>Notas</dt><dd>{{ d.notes }}</dd></div>
          }
        </dl>

        <h3 class="h-s">Conta no site</h3>
        @if (d.userId) {
          <p>
            {{ d.accountEmail }} ·
            @if (d.accountHasPassword) {
              <span class="st st--ok">ativa</span>{{ d.accountLastLogin ? ' · última entrada ' + (d.accountLastLogin | date: 'dd/MM/y') : '' }}
            } @else {
              <span class="st st--warn">ainda sem password</span>
            }
          </p>
          @if (auth.can('members.manage')) {
            <button type="button" class="btn btn--outline btn--sm" (click)="invite(d)">Enviar convite por email</button>
          }
        } @else {
          <p class="caption">Sem conta. Indica um email na ficha para criar a conta e enviar o convite.</p>
        }

        <h3 class="h-s">Atletas ligados a este sócio</h3>
        <ul class="plain links">
          @for (a of d.athletes; track a.id) {
            <li>
              <span>{{ a.name }} <span class="caption">{{ a.code }} · {{ a.sport }}{{ a.category ? ' · ' + a.category : '' }}</span></span>
              @if (canLink()) {
                <button type="button" class="btn btn--outline btn--sm" [disabled]="linkBusy()" (click)="unlink(d, a.id, a.name)">Desligar</button>
              }
            </li>
          } @empty {
            <li class="caption">Nenhum atleta ligado.</li>
          }
        </ul>

        @if (canLink()) {
          <div class="sugg">
            <h3 class="h-s">Sugestões de ligação</h3>
            <p class="caption">Atletas com o mesmo nome, o mesmo apelido ou de quem este sócio é encarregado no site. Confirma antes de ligar: o n.º de sócio passa para a ficha do atleta.</p>
            <form class="sugg__search" (submit)="$event.preventDefault(); loadSuggestions(d, sq)">
              <label class="visually-hidden" for="sugg-q">Procurar atleta pelo nome</label>
              <input id="sugg-q" name="sq" [(ngModel)]="sq" placeholder="Procurar atleta pelo nome" maxlength="80" />
              <button type="submit" class="btn btn--outline btn--sm">Procurar</button>
              @if (sq) {
                <button type="button" class="btn btn--ghost btn--sm" (click)="sq = ''; loadSuggestions(d)">Ver sugestões</button>
              }
            </form>
            <ul class="plain links">
              @for (s of suggestions() ?? []; track s.id) {
                <li>
                  <span>
                    {{ s.name }}
                    <span class="caption">{{ s.code }} · {{ s.sport }}{{ s.category ? ' · ' + s.category : '' }}{{ s.birthDate ? ' · ' + (s.birthDate | date: 'dd/MM/y') : '' }}</span>
                    <span class="caption sub">
                      <span class="st" [class]="'st ' + (s.score >= 80 ? 'st--ok' : 'st--warn')">{{ s.reason }}</span>
                      @if (s.memberNumber) {
                        · já ligado ao sócio n.º {{ s.memberNumber }}
                      }
                    </span>
                  </span>
                  <button type="button" class="btn btn--primary btn--sm" [disabled]="linkBusy()" (click)="link(d, s)">Ligar</button>
                </li>
              } @empty {
                <li class="caption">{{ suggestions() === null ? 'A procurar…' : sq ? 'Nenhum atleta com esse nome.' : 'Sem sugestões. Procura o atleta pelo nome.' }}</li>
              }
            </ul>
          </div>
        }

        <h3 class="h-s">Quotas</h3>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr><th scope="col">Período</th><th scope="col" class="num">Valor</th><th scope="col">Estado</th><th scope="col" class="hide-sm">Recibo</th></tr>
            </thead>
            <tbody>
              @for (q of d.quotas; track q.id) {
                <tr>
                  <td>{{ q.period }} <span class="caption sub">vence {{ q.dueDate | date: 'dd/MM/y' }}</span></td>
                  <td class="num">{{ q.amount | currency: 'EUR' }}</td>
                  <td>
                    <span class="st" [class]="'st ' + (q.status === 'Pago' ? 'st--ok' : q.status === 'Em atraso' ? 'st--bad' : 'st--warn')">{{ q.status }}</span>
                    @if (q.paidAt) {
                      <span class="caption sub">{{ q.paidAt | date: 'dd/MM/y' }} · {{ q.paymentMethod }}</span>
                    }
                  </td>
                  <td class="hide-sm">{{ q.receiptNumber || '—' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="adm-empty">Sem quotas.</td></tr>
              }
            </tbody>
          </table>
        </div>

        @if (auth.can('payments.manage')) {
          <form class="row-form" (submit)="$event.preventDefault(); addQuota(d)">
            <strong>Nova quota avulsa</strong>
            <label>Período <input name="qp" [(ngModel)]="quota.period" placeholder="ex.: Joia 2026" required maxlength="40" /></label>
            <label>Valor (€) <input name="qa" type="number" min="0.5" max="999" step="0.5" [(ngModel)]="quota.amount" required /></label>
            <label>Vence a <input name="qd" type="date" [(ngModel)]="quota.dueDate" required /></label>
            <button type="submit" class="btn btn--outline btn--sm">Acrescentar</button>
          </form>
          <p class="caption">Para registar um pagamento feito na secretaria: <a routerLink="/admin/pagamentos" [queryParams]="{ registar: d.memberNumber }">Pagamentos → Registar pagamento</a>.</p>
        }

        @if (auth.can('members.manage')) {
          <div class="actions">
            <button type="button" class="btn btn--primary btn--sm" (click)="edit(d)">Alterar dados</button>
          </div>
        }
      }
    </sfc-dialog>

    <!-- Criar / alterar -->
    <sfc-dialog [heading]="editing() ? 'Alterar sócio n.º ' + editing() : 'Novo sócio'" [open]="!!draft()" (closed)="draft.set(null)">
      @if (draft(); as f) {
        <form class="grid" (submit)="$event.preventDefault(); save()">
          @if (!editing()) {
            <div class="field">
              <label for="f-num">N.º de sócio</label>
              <input id="f-num" name="num" [(ngModel)]="f.memberNumber" inputmode="numeric" pattern="\\d{1,8}" placeholder="automático" />
            </div>
          }
          <div class="field wide">
            <label for="f-name">Nome completo <span class="req">*</span></label>
            <input id="f-name" name="name" [(ngModel)]="f.name" required minlength="3" maxlength="160" />
          </div>
          <div class="field">
            <label for="f-email">Email</label>
            <input id="f-email" name="email" type="email" [(ngModel)]="f.email" autocomplete="off" />
          </div>
          <div class="field">
            <label for="f-phone">Telemóvel</label>
            <input id="f-phone" name="phone" [(ngModel)]="f.phone" inputmode="tel" />
          </div>
          <div class="field">
            <label for="f-nif">NIF</label>
            <input id="f-nif" name="nif" [(ngModel)]="f.taxNumber" inputmode="numeric" maxlength="9" />
          </div>
          <div class="field">
            <label for="f-birth">Data de nascimento</label>
            <input id="f-birth" name="birth" type="date" [(ngModel)]="f.birthDate" />
          </div>
          <div class="field wide">
            <label for="f-addr">Morada</label>
            <input id="f-addr" name="addr" [(ngModel)]="f.address" maxlength="300" />
          </div>
          <div class="field">
            <label for="f-cp">Código postal</label>
            <input id="f-cp" name="cp" [(ngModel)]="f.postalCode" placeholder="0000-000" />
          </div>
          <div class="field">
            <label for="f-city">Localidade</label>
            <input id="f-city" name="city" [(ngModel)]="f.city" maxlength="100" />
          </div>
          <div class="field">
            <label for="f-cat">Categoria</label>
            <input id="f-cat" name="cat" [(ngModel)]="f.category" list="cats" required maxlength="40" />
            <datalist id="cats">
              @for (c of categories(); track c) {
                <option [value]="c"></option>
              }
            </datalist>
          </div>
          <div class="field">
            <label for="f-st">Estado</label>
            <select id="f-st" name="st" [(ngModel)]="f.status">
              @for (s of statuses; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="f-join">Sócio desde</label>
            <input id="f-join" name="join" type="date" [(ngModel)]="f.joinedOn" />
          </div>
          <div class="field wide">
            <label for="f-notes">Observações</label>
            <textarea id="f-notes" name="notes" rows="2" [(ngModel)]="f.notes" maxlength="1000"></textarea>
          </div>
          @if (formError(); as e) {
            <p class="alert alert--warning wide" role="alert">{{ e }}</p>
          }
          <p class="caption wide">Com email, a conta no site fica ligada (ou é criada, sem password). A pessoa define a password com o convite.</p>
          <div class="actions wide">
            <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy()">{{ editing() ? 'Guardar' : 'Criar sócio' }}</button>
            <button type="button" class="btn btn--outline btn--sm" (click)="draft.set(null)">Cancelar</button>
          </div>
        </form>
      }
    </sfc-dialog>
  `,
  styles: `
    .links li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.6rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--color-border, #e3e6ee);
      .sub {
        display: block;
        margin-top: 0.15rem;
      }
    }
    .sugg {
      margin-top: 1rem;
    }
    .sugg__search {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin: 0.5rem 0;
      input {
        flex: 1;
        min-width: 180px;
        font: inherit;
        padding: 0.4rem 0.6rem;
        border: 1.5px solid #c9cfdb;
        border-radius: var(--radius-s);
      }
    }
    .quick {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .sel {
      min-height: 42px;
      padding: 0 0.7rem;
      border: 1.5px solid #c9cfdb;
      border-radius: var(--radius-s);
      font: inherit;
      background: #fff;
    }
    .alert {
      margin-bottom: 1rem;
    }
    .sub {
      display: block;
    }
    .mono {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
    .sum {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 0.8rem;
      .caption {
        display: block;
      }
    }
    .sum__name {
      font-size: 1.1rem;
    }
    .dl {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.4rem 1rem;
      margin: 0 0 1rem;
      div {
        display: grid;
        grid-template-columns: 6.5rem 1fr;
        gap: 0.5rem;
      }
      .wide {
        grid-column: 1 / -1;
      }
      dt {
        color: var(--color-muted);
        font-size: 0.85rem;
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
    }
    .h-s {
      margin: 1rem 0 0.5rem;
    }
    .plain {
      margin: 0 0 0.5rem;
      padding-left: 1.1rem;
    }
    .row-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.8rem;
      align-items: flex-end;
      margin: 0.8rem 0 0.4rem;
      label {
        display: grid;
        gap: 0.2rem;
        font-size: 0.85rem;
      }
      input {
        min-height: 38px;
        padding: 0 0.5rem;
        border: 1.5px solid #c9cfdb;
        border-radius: var(--radius-s);
        font: inherit;
        width: 9rem;
      }
      strong {
        width: 100%;
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.2rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.8rem;
    }
    @media (max-width: 640px) {
      .hide-sm {
        display: none;
      }
    }
  `,
})
export class MembersPage {
  protected readonly api = inject(RegistryApi);
  protected readonly auth = inject(AuthService);
  protected readonly statuses = MEMBER_STATUS;
  protected readonly q = signal('');
  protected readonly status = signal('');
  protected readonly list = signal<MemberRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly detail = signal<MemberDetail | null>(null);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly editing = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly categories = computed(() => [...new Set(['Efetivo', 'Familiar', 'Jovem', ...this.list().map((m) => m.category)])].sort());
  protected quota = { period: '', amount: 0, dueDate: '' };
  /** Ligar atletas ao sócio: quem gere sócios e atletas (secretaria) */
  protected readonly canLink = computed(() => this.auth.can('members.manage') && this.auth.can('athletes.manage'));
  protected readonly suggestions = signal<AthleteSuggestion[] | null>(null);
  protected readonly linkBusy = signal(false);
  protected sq = '';
  protected readonly isSet = (v: unknown) => !!v;
  private reloads = signal(0);

  constructor() {
    effect(() => {
      this.reloads();
      const filter = { q: this.q().trim() || undefined, status: this.status() || undefined };
      if (!this.api.enabled) return;
      this.loading.set(true);
      this.api
        .members(filter)
        .then((l) => this.list.set(l))
        .catch((e: Error) => this.message.set({ ok: false, text: e.message }))
        .finally(() => this.loading.set(false));
    });
  }

  protected statusClass(s: string) {
    return s === 'Ativo' ? 'st--ok' : s === 'Suspenso' ? 'st--bad' : 'st--warn';
  }

  async open(number: string) {
    try {
      const d = await this.api.member(number);
      this.detail.set(d);
      this.sq = '';
      if (this.canLink()) void this.loadSuggestions(d);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  async loadSuggestions(d: MemberDetail, q?: string) {
    this.suggestions.set(null);
    try {
      this.suggestions.set(await this.api.athleteSuggestions(d.memberNumber, q?.trim() || undefined));
    } catch (e) {
      this.suggestions.set([]);
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  async link(d: MemberDetail, s: AthleteSuggestion) {
    if (s.memberNumber && !confirm(`${s.name} está ligado ao sócio n.º ${s.memberNumber}. Passar para o sócio n.º ${d.memberNumber}?`)) return;
    await this.changeLink(d, () => this.api.linkAthlete(d.memberNumber, s.id, !!s.memberNumber), `${s.name} ligado ao sócio n.º ${d.memberNumber}.`);
  }

  async unlink(d: MemberDetail, id: string, name: string) {
    if (!confirm(`Desligar ${name} do sócio n.º ${d.memberNumber}?`)) return;
    await this.changeLink(d, () => this.api.unlinkAthlete(d.memberNumber, id), `${name} desligado.`);
  }

  private async changeLink(d: MemberDetail, call: () => Promise<MemberDetail>, ok: string) {
    this.linkBusy.set(true);
    try {
      this.detail.set(await call());
      this.message.set({ ok: true, text: ok });
      this.reloads.update((n) => n + 1);
      await this.loadSuggestions(d, this.sq);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.linkBusy.set(false);
    }
  }

  startNew() {
    this.editing.set(null);
    this.formError.set(null);
    this.draft.set({ ...EMPTY });
  }

  edit(d: MemberDetail) {
    this.editing.set(d.memberNumber);
    this.formError.set(null);
    this.draft.set({ ...d });
  }

  async save() {
    const f = this.draft();
    if (!f || this.busy()) return;
    const body: Record<string, unknown> = {};
    for (const k of ['memberNumber', 'name', 'email', 'phone', 'taxNumber', 'birthDate', 'address', 'postalCode', 'city', 'category', 'status', 'joinedOn', 'notes'] as const) {
      const v = f[k];
      if (k === 'memberNumber' && this.editing()) continue;
      body[k] = typeof v === 'string' ? v.trim() || null : (v ?? null);
    }
    body['notes'] = body['notes'] ?? '';
    this.busy.set(true);
    this.formError.set(null);
    try {
      const out = this.editing() ? await this.api.updateMember(this.editing()!, body) : await this.api.createMember(body);
      this.draft.set(null);
      this.detail.set(out);
      this.message.set({ ok: true, text: `Sócio n.º ${out.memberNumber} guardado.` });
      this.reloads.update((n) => n + 1);
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async invite(d: MemberDetail) {
    if (!d.userId) return;
    try {
      await this.api.invite(d.userId);
      this.message.set({ ok: true, text: `Convite enviado para ${d.accountEmail}.` });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
    this.detail.set(null);
  }

  async addQuota(d: MemberDetail) {
    try {
      await this.api.addQuota(d.memberNumber, { period: this.quota.period.trim(), amount: Number(this.quota.amount), dueDate: this.quota.dueDate });
      this.quota = { period: '', amount: 0, dueDate: '' };
      this.detail.set(await this.api.member(d.memberNumber));
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
      this.detail.set(null);
    }
  }
}
