import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogComponent } from '../../../shared/dialog.component';
import { AuthService } from '../../../core/services/auth.service';
import { AthleteAccess, RegistryApi, SPORT_OPTIONS } from '../data/registry';

type Draft = Record<string, string>;

const FIELDS = ['name', 'birthDate', 'gender', 'sport', 'category', 'memberNumber', 'idNumber', 'idExpiry', 'taxNumber', 'email', 'phone', 'address', 'postalCode', 'city'];
const ROLE_LABEL: Record<string, string> = { encarregado: 'Encarregado', 'co-encarregado': 'Co-encarregado', atleta: 'O próprio atleta' };

/**
 * Criar ou alterar um atleta no backoffice (athletes.manage) e gerir quem acede à ficha no site.
 * `athlete` null = novo. A identificação (nome, data, CC, NIF) pode ser corrigida aqui: fica na auditoria.
 */
@Component({
  selector: 'sfc-athlete-editor',
  imports: [FormsModule, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-dialog [heading]="id() ? 'Alterar ' + (draft()['name'] || 'atleta') : 'Novo atleta'" [open]="open()" (closed)="closed.emit()">
      <form class="grid" (submit)="$event.preventDefault(); save()">
        <div class="field wide">
          <label for="a-name">Nome completo <span class="req">*</span></label>
          <input id="a-name" name="name" [(ngModel)]="draft()['name']" required minlength="3" maxlength="160" />
        </div>
        <div class="field">
          <label for="a-birth">Data de nascimento</label>
          <input id="a-birth" name="birth" type="date" [(ngModel)]="draft()['birthDate']" />
        </div>
        <div class="field">
          <label for="a-gender">Género</label>
          <select id="a-gender" name="gender" [(ngModel)]="draft()['gender']">
            <option value="">—</option>
            <option value="Feminino">Feminino</option>
            <option value="Masculino">Masculino</option>
          </select>
        </div>
        <div class="field">
          <label for="a-sport">Modalidade</label>
          <select id="a-sport" name="sport" [(ngModel)]="draft()['sport']">
            @for (s of sports; track s[0]) {
              <option [value]="s[0]">{{ s[1] }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="a-cat">Escalão</label>
          <input id="a-cat" name="cat" [(ngModel)]="draft()['category']" maxlength="40" placeholder="ex.: Sub-11" />
        </div>
        <div class="field">
          <label for="a-member">N.º de sócio</label>
          <input id="a-member" name="member" [(ngModel)]="draft()['memberNumber']" inputmode="numeric" placeholder="se for sócio" />
        </div>
        <div class="field">
          <label for="a-cc">N.º do CC</label>
          <input id="a-cc" name="cc" [disabled]="!sensitive" [(ngModel)]="draft()['idNumber']" inputmode="numeric" maxlength="12" />
        </div>
        <div class="field">
          <label for="a-ccv">Validade do CC</label>
          <input id="a-ccv" name="ccv" [disabled]="!sensitive" type="date" [(ngModel)]="draft()['idExpiry']" />
        </div>
        <div class="field">
          <label for="a-nif">NIF</label>
          <input id="a-nif" name="nif" [disabled]="!sensitive" [(ngModel)]="draft()['taxNumber']" inputmode="numeric" maxlength="9" />
          @if (!sensitive) {
            <span class="hint">CC, NIF e morada: só quem tem acesso aos dados sensíveis.</span>
          }
        </div>
        <div class="field">
          <label for="a-email">Email (contacto)</label>
          <input id="a-email" name="email" type="email" [(ngModel)]="draft()['email']" />
        </div>
        <div class="field">
          <label for="a-phone">Telemóvel</label>
          <input id="a-phone" name="phone" [(ngModel)]="draft()['phone']" inputmode="tel" />
        </div>
        <div class="field wide">
          <label for="a-addr">Morada</label>
          <input id="a-addr" name="addr" [disabled]="!sensitive" [(ngModel)]="draft()['address']" maxlength="300" />
        </div>
        <div class="field">
          <label for="a-cp">Código postal</label>
          <input id="a-cp" name="cp" [disabled]="!sensitive" [(ngModel)]="draft()['postalCode']" placeholder="0000-000" />
        </div>
        <div class="field">
          <label for="a-city">Localidade</label>
          <input id="a-city" name="city" [(ngModel)]="draft()['city']" maxlength="100" />
        </div>
        @if (!id()) {
          <fieldset class="wide box">
            <legend>Encarregado de educação (acesso à ficha no site)</legend>
            <div class="grid">
              <div class="field">
                <label for="a-gname">Nome</label>
                <input id="a-gname" name="gname" [(ngModel)]="draft()['guardianName']" maxlength="160" />
              </div>
              <div class="field">
                <label for="a-gemail">Email</label>
                <input id="a-gemail" name="gemail" type="email" [(ngModel)]="draft()['guardianEmail']" />
              </div>
            </div>
          </fieldset>
        }
        @if (error(); as e) {
          <p class="alert alert--warning wide" role="alert">{{ e }}</p>
        }
        <div class="actions wide">
          <button type="submit" class="btn btn--primary btn--sm" [disabled]="busy()">{{ id() ? 'Guardar' : 'Criar atleta' }}</button>
          <button type="button" class="btn btn--outline btn--sm" (click)="closed.emit()">Cancelar</button>
        </div>
      </form>

      @if (id()) {
        <h3 class="h-s">Quem vê esta ficha no site</h3>
        <ul class="people">
          @for (p of access(); track p.userId) {
            <li>
              <span>
                <strong>{{ p.name }}</strong> · {{ roleLabel(p.role) }}
                <span class="caption sub">{{ p.email }}{{ p.hasPassword ? '' : ' · ainda sem password' }}</span>
              </span>
              <span class="btns">
                <button type="button" class="btn btn--outline btn--sm" (click)="invite(p)">Convite</button>
                <button type="button" class="btn btn--outline btn--sm" (click)="revoke(p)">Retirar</button>
              </span>
            </li>
          } @empty {
            <li class="caption">Ninguém. Acrescenta o encarregado (ou o próprio atleta, se for adulto).</li>
          }
        </ul>
        <form class="row-form" (submit)="$event.preventDefault(); grant()">
          <label>Nome <input name="pn" [(ngModel)]="person.name" required minlength="2" /></label>
          <label>Email <input name="pe" type="email" [(ngModel)]="person.email" required /></label>
          <label>
            Papel
            <select name="pr" [(ngModel)]="person.role">
              <option value="encarregado">Encarregado</option>
              <option value="co-encarregado">Co-encarregado</option>
              <option value="atleta">O próprio atleta</option>
            </select>
          </label>
          <button type="submit" class="btn btn--outline btn--sm">Dar acesso</button>
        </form>
        @if (notice(); as n) {
          <p class="caption" role="status">{{ n }}</p>
        }
      }
    </sfc-dialog>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 0.2rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
    .box {
      border: 1px solid var(--color-line);
      border-radius: var(--radius-s);
      padding: 0.4rem 0.8rem;
      legend {
        font-weight: 700;
        font-size: 0.9rem;
      }
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.4rem;
    }
    .h-s {
      margin: 1.2rem 0 0.5rem;
    }
    .people {
      list-style: none;
      padding: 0;
      margin: 0 0 0.6rem;
      li {
        display: flex;
        justify-content: space-between;
        gap: 0.6rem;
        align-items: center;
        padding: 0.5rem 0;
        border-top: 1px solid var(--color-line);
        flex-wrap: wrap;
      }
      .sub {
        display: block;
      }
    }
    .btns {
      display: flex;
      gap: 0.4rem;
    }
    .row-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.8rem;
      align-items: flex-end;
      label {
        display: grid;
        gap: 0.2rem;
        font-size: 0.85rem;
      }
      input,
      select {
        min-height: 38px;
        padding: 0 0.5rem;
        border: 1.5px solid #c9cfdb;
        border-radius: var(--radius-s);
        font: inherit;
        width: 11rem;
        background: #fff;
      }
    }
  `,
})
export class AthleteEditorComponent {
  private readonly api = inject(RegistryApi);
  /** CC, NIF e morada: só quem vê os dados sensíveis os pode preencher (o servidor recusa os outros) */
  protected readonly sensitive = inject(AuthService).can('athletes.sensitive');
  /** Ficha atual (do GET /admin/athletes/{id}) ou null para um atleta novo */
  readonly athlete = input<Record<string, unknown> | null>(null);
  readonly open = input(false);
  readonly closed = output<void>();
  readonly saved = output<string>();

  protected readonly sports = SPORT_OPTIONS;
  protected readonly draft = signal<Draft>({ sport: 'atletismo' });
  protected readonly id = signal<string | null>(null);
  protected readonly access = signal<AthleteAccess[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected person = { name: '', email: '', role: 'encarregado' };
  /** Campos que vieram na ficha (os outros não se enviam) */
  private shown = new Set<string>();

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const a = this.athlete();
      this.error.set(null);
      this.notice.set(null);
      if (a) {
        const d: Draft = {};
        const shown = new Set<string>();
        for (const k of FIELDS) {
          const src = k === 'sport' ? 'sportSlug' : k;
          // Sem athletes.sensitive, o CC, o NIF e a morada não vêm: não se mexe neles
          if (!(src in a)) continue;
          shown.add(k);
          const v = a[src];
          d[k] = v == null ? '' : String(v);
        }
        this.shown = shown;
        this.draft.set(d);
        this.id.set(String(a['id']));
        this.loadAccess();
      } else {
        this.draft.set({ sport: 'atletismo' });
        this.id.set(null);
        this.access.set([]);
      }
    });
  }

  protected roleLabel(r: string) {
    return ROLE_LABEL[r] ?? r;
  }

  private async loadAccess() {
    const id = this.id();
    if (id) this.access.set(await this.api.access(id).catch(() => []));
  }

  async save() {
    if (this.busy()) return;
    const body: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(this.draft())) {
      if (this.id() && !this.shown.has(k)) continue;
      const t = (v ?? '').trim();
      if (t) body[k] = t;
      else if (this.id() && this.shown.has(k) && k !== 'name' && k !== 'sport') body[k] = null;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.id()) {
        await this.api.updateAthlete(this.id()!, body);
        this.saved.emit(this.id()!);
      } else {
        const out = await this.api.createAthlete(body);
        this.saved.emit(out.id);
      }
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async grant() {
    const id = this.id();
    if (!id) return;
    try {
      await this.api.grantAccess(id, { name: this.person.name.trim(), email: this.person.email.trim().toLowerCase(), role: this.person.role });
      this.person = { name: '', email: '', role: 'encarregado' };
      this.notice.set('Acesso dado. Envia o convite para a pessoa definir a password.');
      await this.loadAccess();
    } catch (e) {
      this.notice.set((e as Error).message);
    }
  }

  async revoke(p: AthleteAccess) {
    const id = this.id();
    if (!id || !confirm(`Retirar o acesso de ${p.name} a esta ficha?`)) return;
    try {
      await this.api.revokeAccess(id, p.userId);
      await this.loadAccess();
    } catch (e) {
      this.notice.set((e as Error).message);
    }
  }

  async invite(p: AthleteAccess) {
    try {
      await this.api.invite(p.userId);
      this.notice.set(`Convite enviado para ${p.email}.`);
    } catch (e) {
      this.notice.set((e as Error).message);
    }
  }
}
