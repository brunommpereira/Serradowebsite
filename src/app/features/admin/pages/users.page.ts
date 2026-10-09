import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RoleDef } from '../../../core/permissions';
import { DialogComponent } from '../../../shared/dialog.component';
import { AdminSource, AdminUser, NewAdminUser } from '../data/admin-source';

/** Utilizadores e os seus papéis no backoffice (permissão users.manage). */
@Component({
  selector: 'sfc-admin-users',
  imports: [FormsModule, RouterLink, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Utilizadores</h1>
        <p>Papéis de acesso ao backoffice. Uma conta sem papéis só usa o site (sócio, atleta, encarregado). O que cada papel pode fazer define-se em <a routerLink="/admin/papeis">Papéis e permissões</a>.</p>
      </div>
      <button type="button" class="btn btn--primary btn--sm" (click)="startNew()">Novo utilizador</button>
    </div>

    <sfc-dialog heading="Novo utilizador" [open]="!!newUser()" (closed)="newUser.set(null)">
      @if (newUser(); as f) {
        <form (submit)="$event.preventDefault(); create()">
          <div class="field">
            <label for="u-name">Nome <span class="req">*</span></label>
            <input id="u-name" name="name" [(ngModel)]="f.name" required minlength="3" maxlength="160" autocomplete="off" />
          </div>
          <div class="field">
            <label for="u-email">Email <span class="req">*</span></label>
            <input id="u-email" name="email" type="email" [(ngModel)]="f.email" required maxlength="200" autocomplete="off" />
          </div>
          <fieldset>
            <legend>Papéis</legend>
            @for (r of roles(); track r.key) {
              <label class="check">
                <input type="checkbox" [checked]="f.roles.includes(r.key)" (change)="toggleNew(r.key)" />
                <span>
                  <strong>{{ r.name }}</strong>
                  <span class="caption desc">{{ r.description }}</span>
                </span>
              </label>
            }
          </fieldset>
          <label class="check">
            <input type="checkbox" name="invite" [(ngModel)]="f.invite" />
            <span>Enviar já o convite por email (a pessoa define a password; a ligação vale 7 dias)</span>
          </label>
          @if (formError(); as e) {
            <p class="alert alert--warning" role="alert">{{ e }}</p>
          }
          <div class="actions">
            <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy()">Criar utilizador</button>
            <button type="button" class="btn btn--outline btn--sm" (click)="newUser.set(null)">Cancelar</button>
          </div>
        </form>
      }
    </sfc-dialog>

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
    .adm-head {
      align-items: flex-start;
      gap: 1rem;
    }
    fieldset {
      border: 0;
      margin: 0.6rem 0;
      padding: 0;
      legend {
        font-weight: 600;
        margin-bottom: 0.3rem;
      }
    }
    .desc {
      display: block;
    }
    .check {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin: 0.3rem 0;
      font-weight: 400;
      input {
        margin: 0.15rem 0 0;
        padding: 0;
        width: 18px;
        height: 18px;
        min-height: 0;
        flex: none;
        accent-color: var(--sfc-blue);
      }
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.8rem;
    }
  `,
})
export class UsersPage {
  private readonly source = inject(AdminSource);
  protected readonly roles = signal<RoleDef[]>([]);
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected draft: Record<string, string[]> = {};
  protected readonly newUser = signal<NewAdminUser | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal(false);

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

  protected startNew() {
    this.formError.set(null);
    this.newUser.set({ name: '', email: '', roles: [], invite: true });
  }

  protected toggleNew(role: string) {
    const f = this.newUser();
    if (f) f.roles = f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role];
  }

  async create() {
    const f = this.newUser();
    if (!f || this.busy()) return;
    if (f.name.trim().length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      this.formError.set('Preenche o nome e um email válido.');
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      const out = await this.source.createUser({ ...f, name: f.name.trim(), email: f.email.trim() });
      this.newUser.set(null);
      const who = f.email.trim().toLowerCase();
      this.message.set({
        ok: true,
        text: out.invited
          ? `Conta criada. O convite foi enviado para ${who} (vale 7 dias).`
          : f.invite
            ? 'Conta criada, mas o envio de emails não está ligado. Liga-o no servidor e depois usa «Enviar convite».'
            : 'Conta criada. Quando quiseres, usa «Enviar convite» para a pessoa definir a password.',
      });
      await this.load();
    } catch (e) {
      this.formError.set((e as Error).message);
    } finally {
      this.busy.set(false);
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
