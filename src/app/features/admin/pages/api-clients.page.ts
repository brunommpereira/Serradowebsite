import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

interface Client {
  id: string;
  clientId: string;
  name: string;
  secretHint: string;
  userId: string;
  userName: string;
  nucleos: string[];
  active: boolean;
  createdAt: string;
  secretRotatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requests: number;
}
interface Option {
  id: string;
  name: string;
  email: string;
}
interface Meta {
  clients: Client[];
  candidates: Option[];
  nucleos: { key: string; label: string }[];
}

/**
 * Credenciais da API de parceiros (sistemas externos que registam pedidos de gasto): criar, trocar o segredo e
 * revogar. O segredo só é mostrado uma vez; no servidor fica apenas o hash.
 */
@Component({
  selector: 'sfc-admin-api-clients',
  imports: [FormsModule, DatePipe, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>API de parceiros</h1>
        <p>
          Credenciais para sistemas externos registarem pedidos de gasto e consultarem o estado.
          Cada cliente faz os pedidos em nome de um responsável e entram no fluxo normal de
          aprovação, em «Pedidos de gasto». Documentação para quem integra:
          <code>docs/API-PARCEIROS.md</code>.
        </p>
      </div>
    </div>
    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="A API de parceiros funciona com o site ligado à API (VPS)."
      />
    } @else {
      @if (error()) {
        <p class="alert alert--warning" role="alert">{{ error() }}</p>
      }
      @if (secret(); as s) {
        <section class="adm-panel block secret" role="status" aria-live="polite">
          <h2>Credenciais de «{{ s.name }}»</h2>
          <p>
            <strong>Copie o segredo agora: não volta a ser mostrado.</strong> Envie-o a quem integra
            por um canal seguro (não por email simples).
          </p>
          <dl>
            <dt>client_id</dt>
            <dd>
              <code>{{ s.clientId }}</code>
              <button type="button" class="btn btn--outline btn--sm" (click)="copy(s.clientId)">
                Copiar
              </button>
            </dd>
            <dt>client_secret</dt>
            <dd>
              <code>{{ s.clientSecret }}</code>
              <button type="button" class="btn btn--outline btn--sm" (click)="copy(s.clientSecret)">
                Copiar
              </button>
            </dd>
          </dl>
          <button type="button" class="btn btn--primary btn--sm" (click)="secret.set(null)">
            Já guardei
          </button>
        </section>
      }
      <section class="adm-panel block">
        <h2>Novo cliente</h2>
        <form class="grid" #form="ngForm" (submit)="$event.preventDefault(); create(form)">
          <div class="field">
            <label for="c-name">Nome do sistema <span class="req">*</span></label>
            <input
              id="c-name"
              name="name"
              [(ngModel)]="f.name"
              required
              minlength="3"
              maxlength="80"
              placeholder="Ex.: ERP da contabilidade"
            />
          </div>
          <div class="field">
            <label for="c-user">Pedidos em nome de <span class="req">*</span></label>
            <select id="c-user" name="user" [(ngModel)]="f.userId" required>
              <option value="" disabled>Escolher…</option>
              @for (u of meta()?.candidates ?? []; track u.id) {
                <option [value]="u.id">{{ u.name }} ({{ u.email }})</option>
              }
            </select>
            <span class="caption"
              >Só contas que podem pedir gastos. Esta pessoa não pode aprovar os pedidos do
              cliente.</span
            >
          </div>
          <fieldset class="wide">
            <legend>Núcleos permitidos (nenhum marcado = todos)</legend>
            <div class="checks">
              @for (n of meta()?.nucleos ?? []; track n.key) {
                <label
                  ><input
                    type="checkbox"
                    [checked]="f.nucleos.includes(n.key)"
                    (change)="toggle(n.key)"
                  />
                  {{ n.label }}</label
                >
              }
            </div>
          </fieldset>
          <div class="wide">
            <button
              class="btn btn--primary"
              type="submit"
              [disabled]="busy() || !f.userId || f.name.trim().length < 3"
            >
              Criar credenciais
            </button>
          </div>
        </form>
      </section>

      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Em nome de</th>
              <th scope="col">Núcleos</th>
              <th scope="col">Pedidos</th>
              <th scope="col">Último uso</th>
              <th scope="col" class="act"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (c of meta()?.clients ?? []; track c.id) {
              <tr [class.off]="!c.active">
                <td>
                  <strong>{{ c.name }}</strong>
                  <span class="caption sub"
                    ><code>{{ c.clientId }}</code> · segredo …{{ c.secretHint }}</span
                  >
                  @if (!c.active) {
                    <span class="caption sub"
                      >Revogado em {{ c.revokedAt | date: 'dd/MM/yyyy HH:mm' }}</span
                    >
                  }
                </td>
                <td>{{ c.userName }}</td>
                <td>{{ c.nucleos.length ? labels(c.nucleos) : 'Todos' }}</td>
                <td>{{ c.requests }}</td>
                <td>{{ c.lastUsedAt ? (c.lastUsedAt | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}</td>
                <td class="act">
                  @if (c.active) {
                    <button
                      type="button"
                      class="btn btn--outline btn--sm"
                      [disabled]="busy()"
                      (click)="rotate(c)"
                    >
                      Novo segredo
                    </button>
                    <button
                      type="button"
                      class="btn btn--outline btn--sm"
                      [disabled]="busy()"
                      (click)="revoke(c)"
                    >
                      Revogar
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="caption">Ainda não há clientes da API.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      align-items: start;
      gap: 0.6rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
    fieldset {
      border: 0;
      padding: 0;
      margin: 0;
      legend {
        font-weight: 600;
        font-size: 0.92rem;
        margin-bottom: 0.2rem;
      }
    }
    .checks {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 1.2rem;
      label {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        min-height: 44px;
        input {
          width: 20px;
          height: 20px;
          accent-color: var(--sfc-blue);
        }
      }
    }
    .secret {
      border-left: 4px solid var(--sfc-yellow);
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.5rem 1rem;
        align-items: center;
        margin: 1rem 0;
      }
      dd {
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      code {
        overflow-wrap: anywhere;
      }
    }
    .sub {
      display: block;
    }
    tr.off td {
      opacity: 0.6;
    }
    .act {
      white-space: nowrap;
    }
  `,
})
export class ApiClientsPage {
  protected readonly api = inject(ApiClient);
  protected readonly meta = signal<Meta | null>(null);
  protected readonly secret = signal<(Client & { clientSecret: string }) | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected f = { name: '', userId: '', nucleos: [] as string[] };

  constructor() {
    if (this.api.enabled) void this.load();
  }

  protected labels(keys: string[]) {
    const all = this.meta()?.nucleos ?? [];
    return keys.map((k) => all.find((n) => n.key === k)?.label ?? k).join(', ');
  }

  protected toggle(key: string) {
    this.f.nucleos = this.f.nucleos.includes(key)
      ? this.f.nucleos.filter((k) => k !== key)
      : [...this.f.nucleos, key];
  }

  protected copy(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  private async load() {
    try {
      this.meta.set(await this.api.get<Meta>('/admin/api-clients'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro ao carregar');
    }
  }

  protected create(form: NgForm) {
    return this.run(async () => {
      this.secret.set(
        await this.api.post('/admin/api-clients', { ...this.f, name: this.f.name.trim() }),
      );
      this.f = { name: '', userId: '', nucleos: [] };
      form.resetForm({ name: '', user: '' });
    });
  }

  protected rotate(c: Client) {
    if (!confirm(`Gerar um novo segredo para «${c.name}»? O atual deixa de funcionar de imediato.`))
      return;
    return this.run(async () =>
      this.secret.set(await this.api.post(`/admin/api-clients/${c.id}/rotate`)),
    );
  }

  protected revoke(c: Client) {
    if (
      !confirm(
        `Revogar «${c.name}»? O sistema deixa de conseguir fazer pedidos. Os pedidos já feitos mantêm-se.`,
      )
    )
      return;
    return this.run(async () => {
      await this.api.post(`/admin/api-clients/${c.id}/revoke`);
    });
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      await this.load();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível concluir');
    } finally {
      this.busy.set(false);
    }
  }
}
