import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { StaffRole } from '../../../core/models';
import { AdminSource, AdminUser } from '../data/admin-source';

const ROLES: { id: StaffRole; label: string; hint: string }[] = [
  { id: 'admin', label: 'Admin', hint: 'Tudo, incluindo utilizadores' },
  { id: 'editor', label: 'Editor', hint: 'Conteúdos do site (CMS)' },
  { id: 'secretaria', label: 'Secretaria', hint: 'Atletas, validações, resultados' },
  { id: 'treinador', label: 'Treinador', hint: 'Consulta de atletas (sem dados sensíveis)' },
];

/** Utilizadores e papéis do backoffice (só admin). */
@Component({
  selector: 'sfc-admin-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Utilizadores</h1>
        <p>Papéis de acesso ao backoffice. Uma conta sem papéis só usa o site (sócio, atleta, encarregado).</p>
      </div>
    </div>

    <ul class="legend">
      @for (r of roles; track r.id) {
        <li><strong>{{ r.label }}</strong> — {{ r.hint }}</li>
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
            @for (r of roles; track r.id) {
              <th scope="col" class="c">{{ r.label }}</th>
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
              @for (r of roles; track r.id) {
                <td class="c">
                  <input type="checkbox" [checked]="draft[u.id].includes(r.id)" (change)="toggle(u.id, r.id)" [attr.aria-label]="r.label + ' — ' + u.name" />
                </td>
              }
              <td class="act">
                <button type="button" class="btn btn--outline btn--sm" [disabled]="!changed(u)" (click)="save(u)">Guardar</button>
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
  `,
})
export class UsersPage {
  private readonly source = inject(AdminSource);
  protected readonly roles = ROLES;
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected draft: Record<string, StaffRole[]> = {};

  constructor() {
    this.load();
  }

  protected toggle(id: string, role: StaffRole) {
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

  private async load() {
    try {
      const list = await this.source.users();
      this.draft = Object.fromEntries(list.map((u) => [u.id, [...u.roles]]));
      this.users.set(list);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }
}
