import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ADMIN_ROLE, ALL_PERMISSIONS, Permission, PERMISSION_GROUPS, PERMISSIONS, RoleDef } from '../../../core/permissions';
import { AuthService } from '../../../core/services/auth.service';
import { AdminSource } from '../data/admin-source';

const EMPTY: RoleDef = { key: '', name: '', description: '', builtin: false, permissions: [] };

/**
 * Papéis e permissões (users.manage): o que cada papel pode fazer no backoffice.
 * As alterações valem logo no pedido seguinte de quem tem o papel (o servidor lê-as a cada pedido).
 */
@Component({
  selector: 'sfc-admin-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Papéis e permissões</h1>
        <p>Cada utilizador pode ter vários papéis; fica com a soma das permissões. O papel Administração tem sempre tudo.</p>
      </div>
      <button type="button" class="btn btn--primary btn--sm" (click)="startNew()">Novo papel</button>
    </div>

    @if (message(); as m) {
      <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status" aria-live="polite">{{ m.text }}</p>
    }

    <div class="layout">
      <ul class="roles" aria-label="Papéis">
        @for (r of roles(); track r.key) {
          <li>
            <button type="button" class="role" [class.role--on]="editing()?.key === r.key && !isNew()" (click)="edit(r)" [attr.aria-pressed]="editing()?.key === r.key && !isNew()">
              <strong>{{ r.name }}</strong>
              <small>{{ r.users ?? 0 }} utilizador(es) · {{ r.key === admin ? 'todas' : r.permissions.length }} permissões{{ r.builtin ? '' : ' · criado no backoffice' }}</small>
            </button>
          </li>
        }
      </ul>

      @if (editing(); as e) {
        <form class="adm-panel editor" (submit)="$event.preventDefault(); save()">
          <h2>{{ isNew() ? 'Novo papel' : e.name }}</h2>
          @if (isNew()) {
            <div class="field">
              <label for="r-key">Identificador</label>
              <input id="r-key" [value]="e.key" (input)="patch({ key: $any($event.target).value.trim().toLowerCase() })" pattern="[a-z][a-z0-9\-]{1,30}" required autocomplete="off" />
              <span class="caption">Letras minúsculas, números e hífens (ex.: coordenacao-tecnica). Não muda depois.</span>
            </div>
          }
          <div class="field">
            <label for="r-name">Nome</label>
            <input id="r-name" [value]="e.name" (input)="patch({ name: $any($event.target).value })" minlength="2" maxlength="60" required />
          </div>
          <div class="field">
            <label for="r-desc">Descrição</label>
            <input id="r-desc" [value]="e.description" (input)="patch({ description: $any($event.target).value })" maxlength="300" />
          </div>

          @if (e.key === admin) {
            <p class="alert alert--info">A Administração tem sempre todas as permissões (assim nunca se perde o acesso ao backoffice).</p>
          } @else {
            @for (g of groups; track g.prefix) {
              <fieldset class="group">
                <legend>{{ g.title }}</legend>
                @for (p of g.items; track p) {
                  <label class="perm" [class.perm--off]="!grantable(p)">
                    <input type="checkbox" [checked]="e.permissions.includes(p)" [disabled]="!grantable(p)" (change)="toggle(p)" />
                    <span><code>{{ p }}</code> {{ describe(p) }}</span>
                  </label>
                }
              </fieldset>
            }
            @if (!auth.roles().includes(admin)) {
              <p class="caption">Só podes dar permissões que tu próprio tens.</p>
            }
          }

          <div class="actions">
            <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy()">{{ isNew() ? 'Criar papel' : 'Guardar' }}</button>
            <button type="button" class="btn btn--outline btn--sm" (click)="editing.set(null)">Cancelar</button>
            @if (!isNew() && !e.builtin) {
              <button type="button" class="btn btn--outline btn--sm danger" (click)="remove(e)">Apagar papel</button>
            }
          </div>
        </form>
      } @else {
        <p class="adm-panel hint">Escolhe um papel para ver e alterar as permissões, ou cria um novo (por exemplo, «Coordenação técnica» só com a consulta de atletas).</p>
      }
    </div>
  `,
  styles: `
    .alert {
      margin-bottom: 1rem;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(14rem, 18rem) 1fr;
      gap: 1rem;
      align-items: start;
    }
    @media (max-width: 760px) {
      .layout {
        grid-template-columns: 1fr;
      }
    }
    .roles {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.4rem;
    }
    .role {
      width: 100%;
      text-align: left;
      display: grid;
      gap: 0.15rem;
      padding: 0.65rem 0.8rem;
      border: 1px solid var(--color-line);
      border-radius: 8px;
      background: var(--color-surface, #fff);
      cursor: pointer;
      font: inherit;
      color: inherit;
      small {
        color: var(--color-muted);
      }
    }
    .role--on {
      border-color: var(--sfc-blue);
      box-shadow: inset 3px 0 0 var(--sfc-blue);
    }
    .editor {
      display: grid;
      gap: 0.8rem;
    }
    .group {
      border: 1px solid var(--color-line);
      border-radius: 8px;
      padding: 0.5rem 0.8rem 0.7rem;
      margin: 0;
      legend {
        font-weight: 700;
        padding: 0 0.3rem;
      }
    }
    .perm {
      display: flex;
      gap: 0.55rem;
      align-items: flex-start;
      padding: 0.3rem 0;
      input {
        margin-top: 0.2rem;
        width: 18px;
        height: 18px;
        accent-color: var(--sfc-blue);
      }
      code {
        font-size: 0.78rem;
        color: var(--color-muted);
        margin-right: 0.3rem;
      }
    }
    .perm--off {
      opacity: 0.55;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .danger {
      margin-left: auto;
      color: var(--color-danger, #b42318);
    }
    .hint {
      color: var(--color-muted);
    }
  `,
})
export class RolesPage {
  protected readonly auth = inject(AuthService);
  private readonly source = inject(AdminSource);
  protected readonly admin = ADMIN_ROLE;
  protected readonly roles = signal<RoleDef[]>([]);
  protected readonly editing = signal<RoleDef | null>(null);
  protected readonly isNew = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly groups = PERMISSION_GROUPS.map((g) => ({ ...g, items: ALL_PERMISSIONS.filter((p) => p.startsWith(g.prefix)) }));
  private readonly mine = computed(() => new Set(this.auth.permissions()));

  constructor() {
    this.load();
  }

  protected describe(p: Permission) {
    return PERMISSIONS[p];
  }

  /** O servidor recusa dar permissões que quem edita não tem (exceto a administração). */
  protected grantable(p: Permission) {
    return this.auth.roles().includes(ADMIN_ROLE) || this.mine().has(p) || !!this.editing()?.permissions.includes(p);
  }

  protected startNew() {
    this.isNew.set(true);
    this.editing.set({ ...EMPTY, permissions: [] });
    this.message.set(null);
  }

  protected edit(r: RoleDef) {
    this.isNew.set(false);
    this.editing.set({ ...r, permissions: [...r.permissions] });
    this.message.set(null);
  }

  protected patch(change: Partial<RoleDef>) {
    const e = this.editing();
    if (e) this.editing.set({ ...e, ...change });
  }

  protected toggle(p: Permission) {
    const e = this.editing();
    if (!e) return;
    this.editing.set({ ...e, permissions: e.permissions.includes(p) ? e.permissions.filter((x) => x !== p) : [...e.permissions, p] });
  }

  async save() {
    const e = this.editing();
    if (!e || this.busy()) return;
    this.busy.set(true);
    try {
      await this.source.saveRole(e, this.isNew());
      const text = this.isNew() ? `Papel «${e.name}» criado. Atribui-o em Utilizadores.` : `Permissões de «${e.name}» guardadas. Valem já.`;
      await this.load(e.key);
      this.message.set({ ok: true, text });
    } catch (err) {
      this.message.set({ ok: false, text: (err as Error).message });
    } finally {
      this.busy.set(false);
    }
  }

  async remove(r: RoleDef) {
    if (!confirm(`Apagar o papel «${r.name}»? Quem o tem perde as permissões dele.`)) return;
    try {
      await this.source.deleteRole(r.key);
      this.editing.set(null);
      this.message.set({ ok: true, text: `Papel «${r.name}» apagado.` });
      await this.load();
    } catch (err) {
      this.message.set({ ok: false, text: (err as Error).message });
    }
  }

  private async load(select?: string) {
    try {
      const list = await this.source.roles();
      this.roles.set(list);
      const found = select ? list.find((r) => r.key === select) : null;
      if (found) this.edit(found);
    } catch (err) {
      this.message.set({ ok: false, text: (err as Error).message });
    }
  }
}
