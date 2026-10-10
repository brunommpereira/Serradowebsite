import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { DialogComponent } from '../../../shared/dialog.component';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

type Kind = 'socio' | 'atleta' | 'rgpd' | 'imagem';

type Status = 'por_confirmar' | 'pendente' | 'aceite' | 'recusada';

interface Registration {
  id: string;
  kind: 'member' | 'athlete';
  status: Status;
  data: Record<string, unknown>;
  proposerNumber: string | null;
  proposerName: string | null;
  reviewNote: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  confirmedAt: string | null;
  hasPdf: boolean;
  signedAt: string;
  name: string;
  signerName: string;
  signerEmail: string;
  signerRole: 'titular' | 'encarregado';
  imageConsent: boolean;
  memberNumber: string | null;
  athleteCode: string | null;
  evidenceSha256: string;
}

interface LegalState {
  kinds: { kind: Kind; label: string }[];
  current: Partial<Record<Kind, { version: number; title: string; body: string }>>;
  history: { kind: Kind; version: number; title: string; sha256: string; createdAt: string; createdBy: string | null; registrations: number }[];
  templates: Record<Kind, { title: string; body: string }>;
}

/** Campos da proposta, pela ordem em que se mostram */
const FIELDS: [string, string][] = [
  ['email', 'Email'],
  ['phone', 'Telemóvel'],
  ['birthDate', 'Data de nascimento'],
  ['taxNumber', 'NIF'],
  ['idNumber', 'N.º do CC'],
  ['idExpiry', 'Validade do CC'],
  ['gender', 'Género'],
  ['sport', 'Modalidade'],
  ['category', 'Categoria'],
  ['address', 'Morada'],
  ['postalCode', 'Código postal'],
  ['city', 'Localidade'],
  ['emergencyName', 'Emergência'],
  ['emergencyPhone', 'Tel. emergência'],
  ['shirtSize', 'T-shirt'],
];
const STATUS: { key: Status | ''; label: string }[] = [
  { key: 'pendente', label: 'Por decidir' },
  { key: 'aceite', label: 'Aceites' },
  { key: 'recusada', label: 'Recusadas' },
  { key: 'por_confirmar', label: 'À espera do email' },
  { key: '', label: 'Todas' },
];

/** Propostas de sócio e de atleta feitas no site (com o PDF assinado): aceitar ou recusar; e os documentos legais, com versões. */
@Component({
  selector: 'sfc-admin-registrations',
  imports: [DatePipe, FormsModule, IconComponent, OfflineNoticeComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Propostas</h1>
        <p>
          Propostas de sócio e de inscrição de atleta feitas no site, aceites pela pessoa e confirmadas por email. Ao <strong>aceitar</strong>, a pessoa passa a sócio (com o n.º
          seguinte) ou a atleta, recebe um email e uma ligação para entrar no site. Os documentos legais têm versões: cada proposta guarda a que foi aceite.
        </p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="O registo online funciona com o site ligado à API (VPS)." />
    } @else {
      <div class="chips" role="tablist" aria-label="Secções">
        <button type="button" class="chip" role="tab" [attr.aria-selected]="tab() === 'regs'" [attr.aria-pressed]="tab() === 'regs'" (click)="tab.set('regs')">
          Propostas
          @if (pendingCount()) {
            <span class="st st--warn">{{ pendingCount() }} por decidir</span>
          }
        </button>
        <button type="button" class="chip" role="tab" [attr.aria-selected]="tab() === 'docs'" [attr.aria-pressed]="tab() === 'docs'" (click)="tab.set('docs')">
          Documentos legais
          @if (missingDocs().length) {
            <span class="st st--bad">{{ missingDocs().length }} em falta</span>
          }
        </button>
      </div>

      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status" aria-live="polite">{{ m.text }}</p>
      }

      @if (tab() === 'regs') {
        @if (missingDocs().length) {
          <p class="alert alert--warning">O registo online está desligado até publicares: {{ missingDocs().join(', ') }}. Vai a «Documentos legais».</p>
        }
        <div class="chips filters" role="group" aria-label="Estado">
          @for (st of statuses; track st.key) {
            <button type="button" class="chip" [attr.aria-pressed]="status() === st.key" (click)="status.set(st.key)">
              {{ st.label }} ({{ count(st.key) }})
            </button>
          }
        </div>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Registo</th>
                <th scope="col" class="hide-sm">Assinou</th>
                <th scope="col">Estado</th>
                <th scope="col" class="act">Ações</th>
              </tr>
            </thead>
            <tbody>
              @for (r of shown(); track r.id) {
                <tr>
                  <td class="nowrap">{{ r.signedAt | date: 'dd/MM/y HH:mm' }}</td>
                  <td>
                    <strong>{{ r.name }}</strong>
                    <span class="caption sub">{{ label(r) }}</span>
                  </td>
                  <td class="hide-sm">{{ r.signerName }} <span class="caption sub">{{ r.signerRole === 'encarregado' ? 'encarregado' : 'titular' }} · {{ r.signerEmail }}</span></td>
                  <td>
                    <span class="st" [class]="'st ' + (r.status === 'aceite' ? 'st--ok' : r.status === 'recusada' ? 'st--bad' : r.status === 'por_confirmar' ? 'st--muted' : 'st--warn')">{{
                      statusLabel(r.status)
                    }}</span>
                  </td>
                  <td class="act">
                    <span class="row-act">
                      <button type="button" class="btn btn--sm" [class.btn--primary]="r.status === 'pendente'" [class.btn--outline]="r.status !== 'pendente'" (click)="open(r)">
                        {{ r.status === 'pendente' ? 'Analisar' : 'Ver' }}
                      </button>
                      @if (r.hasPdf) {
                        <a class="btn btn--outline btn--sm" [href]="pdfUrl(r.id)" download [attr.aria-label]="'PDF da proposta de ' + r.name"><sfc-icon name="download" size="16" />PDF</a>
                      }
                    </span>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="adm-empty">{{ status() === 'pendente' ? 'Não há propostas por decidir.' : 'Sem propostas.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
        <sfc-dialog [heading]="current() ? titleOf(current()!) : 'Proposta'" [open]="!!current()" (closed)="current.set(null)">
          @if (current(); as r) {
            <dl class="dl">
              @for (f of fieldsOf(r); track f[0]) {
                <div><dt>{{ f[0] }}</dt><dd>{{ f[1] }}</dd></div>
              }
              @if (r.kind === 'member') {
                <div><dt>Sócio proponente</dt><dd>{{ r.proposerNumber ? 'n.º ' + r.proposerNumber + (r.proposerName ? ' · ' + r.proposerName : '') : '—' }}</dd></div>
              }
              @if (guardianOf(r); as g) {
                <div class="wide"><dt>Encarregado</dt><dd>{{ g }}</dd></div>
              }
              <div><dt>Imagem</dt><dd>{{ r.imageConsent ? 'Autoriza' : 'Não autoriza' }}</dd></div>
              <div class="wide">
                <dt>Aceite por</dt>
                <dd>
                  {{ r.signerName }} ({{ r.signerRole }}) · {{ r.signerEmail }} · {{ r.signedAt | date: 'dd/MM/y HH:mm' }}
                  {{ r.confirmedAt ? '· email confirmado a ' + (r.confirmedAt | date: 'dd/MM/y HH:mm') : '· email ainda por confirmar' }}
                </dd>
              </div>
            </dl>
            @if (r.status === 'por_confirmar') {
              <p class="alert alert--warning">A pessoa ainda não abriu a ligação de confirmação enviada por email. Só se pode decidir depois de confirmar.</p>
            } @else if (r.status === 'pendente') {
              <form class="decide" (submit)="$event.preventDefault()">
                @if (r.kind === 'member') {
                  <div class="field">
                    <label for="d-num">N.º de sócio</label>
                    <input id="d-num" name="num" [(ngModel)]="decision.memberNumber" inputmode="numeric" maxlength="8" pattern="\\d{1,8}" />
                    <span class="caption">Proposto: o maior n.º que existe + 1. Podes mudar (tem de estar livre).</span>
                  </div>
                  <div class="field">
                    <label for="d-cat">Categoria de sócio</label>
                    <input id="d-cat" name="cat" [(ngModel)]="decision.category" maxlength="40" />
                  </div>
                }
                <div class="field">
                  <label for="d-note">Nota para a pessoa (vai no email)</label>
                  <textarea id="d-note" name="note" rows="3" maxlength="2000" [(ngModel)]="decision.note" placeholder="Obrigatória para recusar (ex.: falta o sócio proponente)"></textarea>
                </div>
                <div class="actions">
                  <button type="button" class="btn btn--primary btn--sm" [disabled]="busy()" (click)="decide(r, 'approve')">
                    {{ r.kind === 'member' ? 'Aceitar: passa a sócio' : 'Aceitar: passa a atleta' }}
                  </button>
                  <button type="button" class="btn btn--outline btn--sm danger" [disabled]="busy() || !decision.note.trim()" (click)="decide(r, 'reject')">Recusar</button>
                </div>
              </form>
            } @else {
              <p class="caption">
                {{ r.status === 'aceite' ? 'Aceite' : 'Recusada' }}{{ r.reviewedBy ? ' por ' + r.reviewedBy : '' }}{{ r.reviewedAt ? ' a ' + (r.reviewedAt | date: 'dd/MM/y HH:mm') : '' }}.
                {{ r.reviewNote ? 'Nota: ' + r.reviewNote : '' }}
              </p>
            }
          }
        </sfc-dialog>
      } @else if (legal(); as l) {
        <div class="docs">
          @for (k of l.kinds; track k.kind) {
            <section class="adm-panel">
              <header class="doc-head">
                <h2>{{ k.label }}</h2>
                @if (l.current[k.kind]; as cur) {
                  <span class="st st--ok">em vigor: versão {{ cur.version }}</span>
                } @else {
                  <span class="st st--bad">por publicar</span>
                }
              </header>

              @if (editing() === k.kind) {
                <form class="edit" (submit)="$event.preventDefault(); publish(k.kind)">
                  <div class="field">
                    <label [for]="'t-' + k.kind">Título</label>
                    <input [id]="'t-' + k.kind" name="title" [(ngModel)]="draft.title" required minlength="3" maxlength="160" />
                  </div>
                  <div class="field">
                    <label [for]="'b-' + k.kind">Texto (parágrafos separados por uma linha em branco)</label>
                    <textarea [id]="'b-' + k.kind" name="body" rows="16" [(ngModel)]="draft.body" required minlength="20"></textarea>
                  </div>
                  <p class="caption">Publicar cria a versão {{ (l.current[k.kind]?.version ?? 0) + 1 }}. As versões anteriores ficam guardadas tal como estavam e os registos já feitos continuam a apontar para a versão que foi aceite.</p>
                  <div class="actions">
                    <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy()">Publicar versão nova</button>
                    <button type="button" class="btn btn--outline btn--sm" (click)="editing.set(null)">Cancelar</button>
                  </div>
                </form>
              } @else {
                @if (l.current[k.kind]; as cur) {
                  <details>
                    <summary>{{ cur.title }} · ver o texto</summary>
                    <div class="body">
                      @for (p of paras(cur.body); track $index) {
                        <p>{{ p }}</p>
                      }
                    </div>
                  </details>
                  <button type="button" class="btn btn--outline btn--sm" (click)="edit(k.kind, cur)">Alterar (versão nova)</button>
                } @else {
                  <p class="caption">Há um modelo para começar. <strong>Revê-o com a direção</strong> (e, se possível, com um jurista) antes de publicar.</p>
                  <button type="button" class="btn btn--primary btn--sm" (click)="edit(k.kind, l.templates[k.kind])">Começar pelo modelo</button>
                }
              }

              @if (history(k.kind).length) {
                <table class="hist">
                  <thead><tr><th scope="col">Versão</th><th scope="col">Publicada</th><th scope="col" class="hide-sm">Por</th><th scope="col" class="num">Registos</th></tr></thead>
                  <tbody>
                    @for (h of history(k.kind); track h.version) {
                      <tr>
                        <td>{{ h.version }}</td>
                        <td>{{ h.createdAt | date: 'dd/MM/y HH:mm' }}</td>
                        <td class="hide-sm">{{ h.createdBy ?? '—' }}</td>
                        <td class="num">{{ h.registrations }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </section>
          }
        </div>
      }
    }
  `,
  styles: `
    .filters {
      margin: 0 0 1rem;
    }
    .row-act {
      display: inline-flex;
      gap: 0.4rem;
    }
    .dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem 1rem;
      margin: 0 0 1rem;
      dt {
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .wide {
        grid-column: 1 / -1;
      }
    }
    .decide {
      display: grid;
      gap: 0.6rem;
      textarea,
      input {
        width: 100%;
        font: inherit;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .danger {
        color: var(--color-danger);
        border-color: currentColor;
      }
    }
    .chips {
      margin-bottom: 1rem;
    }
    .chip .st {
      margin-left: 0.4rem;
    }
    .alert {
      margin-bottom: 1rem;
    }
    .sub {
      display: block;
    }
    .nowrap {
      white-space: nowrap;
    }
    .docs {
      display: grid;
      gap: 1rem;
    }
    .doc-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.6rem;
      flex-wrap: wrap;
      margin-bottom: 0.6rem;
      h2 {
        margin: 0;
      }
    }
    details {
      margin-bottom: 0.8rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .body {
      max-height: 18rem;
      overflow: auto;
      padding: 0.6rem 0.8rem;
      margin-top: 0.5rem;
      background: #f6f7fb;
      border-radius: var(--radius-s);
      font-size: 0.9rem;
    }
    .edit textarea {
      width: 100%;
      font: inherit;
      line-height: 1.45;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
    }
    .hist {
      width: 100%;
      margin-top: 1rem;
      border-collapse: collapse;
      font-size: 0.88rem;
      th,
      td {
        text-align: left;
        padding: 0.3rem 0.4rem;
        border-top: 1px solid var(--color-line);
      }
      .num {
        text-align: right;
      }
    }
    @media (max-width: 640px) {
      .hide-sm {
        display: none;
      }
    }
  `,
})
export class RegistrationsPage {
  protected readonly api = inject(ApiClient);
  protected readonly tab = signal<'regs' | 'docs'>('regs');
  protected readonly regs = signal<Registration[]>([]);
  protected readonly statuses = STATUS;
  protected readonly status = signal<Status | ''>('pendente');
  protected readonly shown = computed(() => this.regs().filter((r) => !this.status() || r.status === this.status()));
  protected readonly pendingCount = computed(() => this.regs().filter((r) => r.status === 'pendente').length);
  protected readonly current = signal<Registration | null>(null);
  protected decision = { note: '', category: '', memberNumber: '' };
  protected readonly legal = signal<LegalState | null>(null);
  protected readonly editing = signal<Kind | null>(null);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected draft = { title: '', body: '' };
  protected readonly missingDocs = computed(() => {
    const l = this.legal();
    return l ? l.kinds.filter((k) => !l.current[k.kind]).map((k) => k.label) : [];
  });

  constructor() {
    if (this.api.enabled) this.load();
  }

  protected count(st: Status | '') {
    return st ? this.regs().filter((r) => r.status === st).length : this.regs().length;
  }

  protected statusLabel(st: Status) {
    return { por_confirmar: 'À espera do email', pendente: 'Por decidir', aceite: 'Aceite', recusada: 'Recusada' }[st];
  }

  protected label(r: Registration) {
    if (r.kind === 'member') return r.memberNumber ? `Sócio n.º ${r.memberNumber}` : 'Proposta de sócio';
    return r.athleteCode ? `Atleta ${r.athleteCode}` : `Inscrição de atleta · ${String(r.data['sport'] ?? '')}`;
  }

  protected titleOf(r: Registration) {
    return `${r.kind === 'member' ? 'Proposta de sócio' : 'Inscrição de atleta'}: ${r.name}`;
  }

  protected fieldsOf(r: Registration): [string, string][] {
    return FIELDS.filter(([k]) => r.data[k] != null && r.data[k] !== '').map(([k, l]) => [l, String(r.data[k])]);
  }

  protected guardianOf(r: Registration) {
    const g = r.data['guardian'] as Record<string, string> | null | undefined;
    return g ? `${g['name']} (${g['relation'] ?? 'encarregado'}) · ${g['email']} · ${g['phone']}` : null;
  }

  async open(r: Registration) {
    this.decision = { note: '', category: String(r.data['category'] ?? ''), memberNumber: '' };
    this.current.set(r);
    if (r.kind === 'member' && r.status === 'pendente') {
      const next = await this.api.get<{ memberNumber: string }>('/admin/registrations/next-member-number').catch(() => null);
      if (next && this.current() === r && !this.decision.memberNumber) this.decision = { ...this.decision, memberNumber: next.memberNumber };
    }
  }

  async decide(r: Registration, action: 'approve' | 'reject') {
    if (action === 'reject' && !confirm(`Recusar a proposta de ${r.name}? A pessoa recebe um email com a nota.`)) return;
    this.busy.set(true);
    try {
      const body: Record<string, string> = { note: this.decision.note.trim() };
      if (action === 'approve' && r.kind === 'member' && this.decision.category.trim()) body['category'] = this.decision.category.trim();
      if (action === 'approve' && r.kind === 'member' && /^\d{1,8}$/.test(this.decision.memberNumber.trim())) body['memberNumber'] = this.decision.memberNumber.trim();
      const out = await this.api.post<{ memberNumber?: string; code?: string }>(`/admin/registrations/${r.id}/${action}`, body);
      this.current.set(null);
      this.message.set({
        ok: true,
        text:
          action === 'reject'
            ? `Proposta de ${r.name} recusada; enviámos o email com a nota.`
            : out.memberNumber
              ? `${r.name} é agora o sócio n.º ${out.memberNumber}. Enviámos o email com o convite.`
              : `${r.name} inscrito como atleta (${out.code}). Enviámos o email com o convite.`,
      });
      await this.load();
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }

  private async load() {
    try {
      const [regs, legal] = await Promise.all([this.api.get<Registration[]>('/admin/registrations'), this.api.get<LegalState>('/admin/legal')]);
      this.regs.set(regs);
      this.legal.set(legal);
      if (legal.kinds.some((k) => !legal.current[k.kind]) && !regs.length) this.tab.set('docs');
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  protected pdfUrl(id: string) {
    return `${this.api.baseUrl}/admin/registrations/${id}/pdf`;
  }

  protected paras(body: string) {
    return body.split(/\n\s*\n/).filter((p) => p.trim());
  }

  protected history(kind: Kind) {
    return this.legal()?.history.filter((h) => h.kind === kind) ?? [];
  }

  edit(kind: Kind, from: { title: string; body: string }) {
    this.draft = { title: from.title, body: from.body };
    this.editing.set(kind);
    this.message.set(null);
  }

  async publish(kind: Kind) {
    if (this.busy()) return;
    if (!confirm('Publicar esta versão? Passa a ser a que as pessoas aceitam a partir de agora.')) return;
    this.busy.set(true);
    try {
      const out = await this.api.post<{ version: number }>(`/admin/legal/${kind}`, { title: this.draft.title.trim(), body: this.draft.body.trim() });
      this.editing.set(null);
      this.message.set({ ok: true, text: `Versão ${out.version} publicada.` });
      await this.load();
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }
}
