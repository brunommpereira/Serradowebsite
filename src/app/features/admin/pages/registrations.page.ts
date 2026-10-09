import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

type Kind = 'socio' | 'atleta' | 'rgpd' | 'imagem';

interface Registration {
  id: string;
  kind: 'member' | 'athlete';
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

/** Registos online assinados (com o PDF) e os documentos legais que as pessoas aceitam, com versões. */
@Component({
  selector: 'sfc-admin-registrations',
  imports: [DatePipe, FormsModule, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Registos online</h1>
        <p>Inscrições de sócios e atletas feitas no site, com os documentos aceites e a assinatura. Os documentos legais têm versões: cada registo guarda a que foi aceite.</p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="O registo online funciona com o site ligado à API (VPS)." />
    } @else {
      <div class="chips" role="tablist" aria-label="Secções">
        <button type="button" class="chip" role="tab" [attr.aria-selected]="tab() === 'regs'" [attr.aria-pressed]="tab() === 'regs'" (click)="tab.set('regs')">Registos</button>
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
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Registo</th>
                <th scope="col" class="hide-sm">Assinou</th>
                <th scope="col">Imagem</th>
                <th scope="col" class="act">PDF</th>
              </tr>
            </thead>
            <tbody>
              @for (r of regs(); track r.id) {
                <tr>
                  <td class="nowrap">{{ r.signedAt | date: 'dd/MM/y HH:mm' }}</td>
                  <td>
                    <strong>{{ r.name }}</strong>
                    <span class="caption sub">{{ r.kind === 'member' ? 'Sócio n.º ' + r.memberNumber : 'Atleta ' + (r.athleteCode ?? '') }}</span>
                  </td>
                  <td class="hide-sm">{{ r.signerName }} <span class="caption sub">{{ r.signerRole === 'encarregado' ? 'encarregado' : 'titular' }} · {{ r.signerEmail }}</span></td>
                  <td>
                    <span class="st" [class]="'st ' + (r.imageConsent ? 'st--ok' : 'st--muted')">{{ r.imageConsent ? 'Autoriza' : 'Não autoriza' }}</span>
                  </td>
                  <td class="act">
                    <a class="btn btn--outline btn--sm" [href]="pdfUrl(r.id)" download><sfc-icon name="download" size="16" />PDF</a>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="adm-empty">Ainda não há registos online.</td></tr>
              }
            </tbody>
          </table>
        </div>
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
