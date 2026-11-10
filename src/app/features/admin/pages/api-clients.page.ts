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
  nucleos: string[];
  scopes: string[];
  active: boolean;
  createdAt: string;
  secretRotatedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requests: number;
}
interface Meta {
  clients: Client[];
  nucleos: { key: string; label: string }[];
  scopes: { key: string; label: string }[];
}

/**
 * Credenciais das APIs técnicas (sistemas externos que registam pedidos de gasto e decidem o passo do tesoureiro
 * do núcleo): criar, trocar o segredo e revogar. O segredo só é mostrado uma vez; no servidor fica apenas o hash.
 */
@Component({
  selector: 'sfc-admin-api-clients',
  imports: [FormsModule, DatePipe, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>APIs técnicas</h1>
        <p>
          Credenciais para sistemas externos registarem pedidos de gasto, decidirem o passo do
          tesoureiro do núcleo e consultarem o estado. Cada pedido indica o email de quem pede (e
          cada decisão, o de quem decide), com as mesmas regras de «Pedidos de gasto». Documentação
          para quem integra:
          <code>docs/API-TECNICAS.md</code>.
        </p>
      </div>
    </div>
    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="As APIs técnicas funcionam com o site ligado à API (VPS)."
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
          <fieldset class="wide">
            <legend>O que pode fazer <span class="req">*</span></legend>
            <div class="checks">
              @for (sc of meta()?.scopes ?? []; track sc.key) {
                <label
                  ><input
                    type="checkbox"
                    [checked]="f.scopes.includes(sc.key)"
                    (change)="toggleScope(sc.key)"
                  />
                  {{ sc.label }}</label
                >
              }
            </div>
          </fieldset>
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
              [disabled]="busy() || !f.scopes.length || f.name.trim().length < 3"
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
              <th scope="col">Pode</th>
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
                <td>{{ scopeLabels(c.scopes) }}</td>
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
  protected f = { name: '', nucleos: [] as string[], scopes: ['expenses.create'] };

  constructor() {
    if (this.api.enabled) void this.load();
  }

  protected labels(keys: string[]) {
    const all = this.meta()?.nucleos ?? [];
    return keys.map((k) => all.find((n) => n.key === k)?.label ?? k).join(', ');
  }

  protected scopeLabels(keys: string[]) {
    const all = this.meta()?.scopes ?? [];
    return keys.map((k) => all.find((x) => x.key === k)?.label ?? k).join(' · ');
  }

  protected toggleScope(key: string) {
    this.f.scopes = this.f.scopes.includes(key)
      ? this.f.scopes.filter((k) => k !== key)
      : [...this.f.scopes, key];
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
      this.f = { name: '', nucleos: [], scopes: ['expenses.create'] };
      form.resetForm({ name: '' });
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
