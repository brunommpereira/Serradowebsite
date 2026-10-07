import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource, DOC_LABELS, DocumentToReview, FIELD_LABELS, IdentityRequest } from '../data/admin-source';

/** Validações da secretaria: pedidos de alteração de identificação e documentos de inscrição. */
@Component({
  selector: 'sfc-admin-reviews',
  imports: [DatePipe, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Validações</h1>
        <p>{{ requests().length }} pedido(s) de alteração · {{ documents().length }} documento(s) por validar</p>
      </div>
    </div>

    @if (message(); as m) {
      <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status" aria-live="polite">{{ m.text }}</p>
    }

    <section class="adm-panel block">
      <h2>Pedidos de alteração de identificação</h2>
      <p class="caption">Ao aprovar, a alteração é aplicada à ficha do atleta. Confirma com o documento de identificação.</p>
      @for (r of requests(); track r.id) {
        <article class="req">
          <header>
            <strong>{{ r.athleteName }}</strong>
            <span class="caption">{{ r.athleteCode }} · pedido por {{ r.requestedBy ?? '—' }} a {{ r.requestedAt | date: 'dd/MM/y' }}</span>
          </header>
          <table class="adm-table diff">
            <thead>
              <tr><th scope="col">Campo</th><th scope="col">Atual</th><th scope="col">Pedido</th></tr>
            </thead>
            <tbody>
              @for (c of entries(r.changes); track c[0]) {
                <tr>
                  <th scope="row">{{ label(c[0]) }}</th>
                  <td><del>{{ r.current[c[0]] ?? '—' }}</del></td>
                  <td><ins>{{ c[1] }}</ins></td>
                </tr>
              }
            </tbody>
          </table>
          <div class="decide">
            <button type="button" class="btn btn--primary btn--sm" [disabled]="busy()" (click)="resolve(r, true)"><sfc-icon name="check" size="16" />Aprovar e aplicar</button>
            <label class="visually-hidden" [for]="'note-r-' + r.id">Motivo da rejeição</label>
            <input class="note" [id]="'note-r-' + r.id" placeholder="Motivo (para rejeitar)" [(ngModel)]="notes[key('r', r.id)]" />
            <button type="button" class="btn btn--outline btn--sm" [disabled]="busy() || !notes[key('r', r.id)]" (click)="resolve(r, false)">Rejeitar</button>
          </div>
        </article>
      } @empty {
        <p class="adm-empty"><sfc-icon name="check" size="18" /> Sem pedidos pendentes.</p>
      }
    </section>

    <section class="adm-panel block">
      <h2>Documentos por validar</h2>
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr><th scope="col">Atleta</th><th scope="col">Documento</th><th scope="col" class="act">Decisão</th></tr>
          </thead>
          <tbody>
            @for (d of documents(); track d.id) {
              <tr>
                <td><strong>{{ d.athleteName }}</strong><span class="caption sub">{{ d.athleteCode }}</span></td>
                <td>{{ docLabel(d.kind) }}</td>
                <td class="act">
                  <div class="decide decide--row">
                    <button type="button" class="btn btn--primary btn--sm" [disabled]="busy()" (click)="review(d, true)">Aprovar</button>
                    <label class="visually-hidden" [for]="'note-d-' + d.id">Motivo da rejeição</label>
                    <input class="note" [id]="'note-d-' + d.id" placeholder="Motivo" [(ngModel)]="notes[key('d', d.id)]" />
                    <button type="button" class="btn btn--outline btn--sm" [disabled]="busy() || !notes[key('d', d.id)]" (click)="review(d, false)">Rejeitar</button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="adm-empty">Sem documentos por validar.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .block {
      margin-bottom: 1rem;
    }
    .alert {
      margin-bottom: 1rem;
    }
    .req {
      padding: 1rem 0;
      border-top: 1px solid var(--color-line);
      header {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem 0.8rem;
        align-items: baseline;
        margin-bottom: 0.6rem;
      }
    }
    .diff {
      max-width: 640px;
      margin-bottom: 0.8rem;
      del {
        color: var(--color-danger);
      }
      ins {
        color: var(--color-success);
        text-decoration: none;
        font-weight: 700;
      }
    }
    .decide {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      &--row {
        justify-content: flex-end;
      }
    }
    .note {
      min-height: 36px;
      width: 200px;
      max-width: 100%;
      padding: 0 0.7rem;
      border: 1.5px solid #c9cfdb;
      border-radius: var(--radius-s);
      font: inherit;
      font-size: 0.88rem;
    }
    .sub {
      display: block;
    }
  `,
})
export class ReviewsPage {
  private readonly source = inject(AdminSource);
  protected readonly requests = signal<IdentityRequest[]>([]);
  protected readonly documents = signal<DocumentToReview[]>([]);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected notes: Record<string, string> = {};

  protected readonly entries = (c: Record<string, string>) => Object.entries(c);
  protected readonly label = (k: string) => FIELD_LABELS[k] ?? k;
  protected readonly docLabel = (k: string) => DOC_LABELS[k] ?? k;
  protected readonly key = (p: string, id: number | string) => `${p}:${id}`;

  constructor() {
    this.reload();
  }

  async resolve(r: IdentityRequest, approve: boolean) {
    await this.run(() => this.source.resolveChange(r.id, approve, this.notes[this.key('r', r.id)]), approve ? `Alteração de ${r.athleteName} aprovada e aplicada.` : `Pedido de ${r.athleteName} rejeitado.`);
  }

  async review(d: DocumentToReview, approve: boolean) {
    await this.run(() => this.source.reviewDocument(d.id, approve, this.notes[this.key('d', d.id)]), `${this.docLabel(d.kind)} de ${d.athleteName}: ${approve ? 'aprovado' : 'rejeitado'}.`);
  }

  private async run(fn: () => Promise<void>, ok: string) {
    this.busy.set(true);
    try {
      await fn();
      this.message.set({ ok: true, text: ok });
      await this.reload();
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }

  private async reload() {
    try {
      const [r, d] = await Promise.all([this.source.changeRequests(), this.source.documents()]);
      this.requests.set(r);
      this.documents.set(d);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }
}
