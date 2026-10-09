import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { AdminSource, AuditEntry } from '../data/admin-source';
import { actionLabel } from './labels';

/** Registo de auditoria: todas as escritas (quem, o quê, quando). */
@Component({
  selector: 'sfc-admin-audit',
  imports: [DatePipe, JsonPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Auditoria</h1>
        <p>{{ auth.can('audit.all') ? 'Todas as alterações feitas no backoffice e nas áreas reservadas.' : 'As tuas alterações (o registo completo é visível para quem tem a permissão de auditoria).' }}</p>
      </div>
    </div>
    @if (error()) {
      <p class="alert alert--warning adm-error" role="alert">{{ error() }}</p>
    }
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr><th scope="col">Quando</th><th scope="col">Quem</th><th scope="col">Ação</th><th scope="col">Detalhes</th></tr>
        </thead>
        <tbody>
          @for (l of log(); track l.id) {
            <tr>
              <td class="nowrap">{{ l.at | date: 'dd/MM/y HH:mm' }}</td>
              <td>{{ l.actor ?? 'Sistema' }}</td>
              <td>{{ label(l.action) }}</td>
              <td><code class="det">{{ l.details | json }}</code></td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="adm-empty">Sem registos.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .nowrap {
      white-space: nowrap;
    }
    .det {
      display: block;
      max-width: 420px;
      font-size: 0.78rem;
      color: var(--color-muted);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class AuditPage {
  protected readonly auth = inject(AuthService);
  private readonly source = inject(AdminSource);
  protected readonly log = signal<AuditEntry[]>([]);
  protected readonly error = signal('');
  protected readonly label = actionLabel;

  constructor() {
    this.source
      .audit()
      .then((l) => this.log.set(l))
      .catch((e: Error) => this.error.set(e.message));
  }
}
