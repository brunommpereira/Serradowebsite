import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RoleDef } from '../../../core/permissions';
import { AdminSource, AdminUser } from '../data/admin-source';

/** Utilizadores e os seus papéis no backoffice (permissão users.manage). */
@Component({
  selector: 'sfc-admin-users',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Utilizadores</h1>
        <p>Papéis de acesso ao backoffice. Uma conta sem papéis só usa o site (sócio, atleta, encarregado). O que cada papel pode fazer define-se em <a routerLink="/admin/papeis">Papéis e permissões</a>.</p>
      </div>
    </div>

    <ul class="legend">
      @for (r of roles(); track r.key) {
        <li><strong>{{ r.name }}</strong> — {{ r.description }}</li>
      }
    </ul>

    @if (message(); as m) {
      <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status" aria-live="polite">{{ m.text }}</p>
    }

    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th scope="col">Utilizador</th>
            @for (r of roles(); track r.key) {
              <th scope="col" class="c">{{ r.name }}</th>
            }
            <th scope="col" class="act"><span class="visually-hidden">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          @for (u of users(); track u.id) {
            <tr>
              <td>
                <strong>{{ u.name }}</strong>
                <span class="caption sub">{{ u.email }}{{ u.member ? ' · sócio ' + u.member.memberNumber : '' }}</span>
              </td>
              @for (r of roles(); track r.key) {
                <td class="c">
                  <input type="checkbox" [checked]="draft[u.id].includes(r.key)" (change)="toggle(u.id, r.key)" [attr.aria-label]="r.name + ' — ' + u.name" />
                </td>
              }
              <td class="act">
                <button type="button" class="btn btn--outline btn--sm" [disabled]="!changed(u)" (click)="save(u)">Guardar</button>
                <button type="button" class="btn btn--outline btn--sm" (click)="invite(u)" title="Envia por email uma ligação para definir a password">Enviar convite</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem 1.4rem;
      margin: 0 0 1rem;
      padding: 0;
      list-style: none;
      font-size: 0.86rem;
      color: var(--color-muted);
    }
    .alert {
      margin-bottom: 1rem;
    }
    .c {
      text-align: center !important;
      input {
        width: 20px;
        height: 20px;
        accent-color: var(--sfc-blue);
      }
    }
    .sub {
      display: block;
    }
    /* Com muitos papéis a tabela desliza na horizontal: o nome fica sempre visível */
    th:first-child,
    td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      background: var(--color-surface);
      box-shadow: 1px 0 0 var(--color-line);
    }
    .act {
      white-space: nowrap;
    }
  `,
})
export class UsersPage {
  private readonly source = inject(AdminSource);
  protected readonly roles = signal<RoleDef[]>([]);
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected draft: Record<string, string[]> = {};

  constructor() {
    this.load();
  }

  protected toggle(id: string, role: string) {
    const cur = this.draft[id];
    this.draft = { ...this.draft, [id]: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] };
    this.users.set([...this.users()]); // força nova verificação do botão «Guardar»
  }

  protected changed(u: AdminUser) {
    return [...this.draft[u.id]].sort().join() !== [...u.roles].sort().join();
  }

  async save(u: AdminUser) {
    try {
      await this.source.setRoles(u.id, this.draft[u.id]);
      this.message.set({ ok: true, text: `Papéis de ${u.name} atualizados.` });
      await this.load();
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  async invite(u: AdminUser) {
    try {
      await this.source.invite(u.id);
      this.message.set({ ok: true, text: `Convite enviado para ${u.email}. A ligação vale 7 dias.` });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  private async load() {
    try {
      const [list, roles] = await Promise.all([this.source.users(), this.source.roles()]);
      this.roles.set(roles);
      this.draft = Object.fromEntries(list.map((u) => [u.id, [...u.roles]]));
      this.users.set(list);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }
}
