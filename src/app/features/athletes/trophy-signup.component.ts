import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../core/api/api-client';
import { DialogComponent } from '../../shared/dialog.component';
import { IconComponent } from '../../shared/icon.component';

interface TrophyRace {
  round: number;
  name: string;
  raceDate: string;
  location: string | null;
  infoUrl: string | null;
}

interface Trophy {
  edition: {
    id: number;
    season: string;
    name: string;
    opensOn: string | null;
    closesOn: string | null;
    open: boolean;
  } | null;
  races: TrophyRace[];
  signup: {
    id: number;
    status: 'pedido' | 'validado' | 'inscrito' | 'erro' | 'cancelado';
    message: string;
    requestedAt: string;
    sentAt: string | null;
  } | null;
  /** birthDate · gender · idNumber · emergency */
  missing: string[];
  canSignup: boolean;
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'info' | 'muted' }> = {
  pedido: { label: 'Pedido enviado — a inscrever na Xistarca', tone: 'info' },
  validado: {
    label: 'Dados aceites pela Xistarca — falta a confirmação final do clube',
    tone: 'info',
  },
  inscrito: { label: 'Inscrito no Troféu', tone: 'ok' },
  erro: { label: 'Não foi possível inscrever', tone: 'warn' },
  cancelado: { label: 'Pedido cancelado', tone: 'muted' },
};

/** Cartão «Troféu de Almada» da área do atleta: provas da época e inscrição direta (enviada à Xistarca pelo clube). */
@Component({
  selector: 'sfc-trophy-signup',
  imports: [DatePipe, FormsModule, DialogComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as t) {
      @if (t.edition; as e) {
        <section class="trophy card" aria-labelledby="trophy-title">
          <div class="trophy__head">
            <div>
              <h3 id="trophy-title" class="h-s">{{ e.name }}</h3>
              <p class="caption">
                Uma inscrição vale para todas as provas da época.
                @if (e.closesOn) {
                  Inscrições até {{ e.closesOn | date: 'd MMM y' }}.
                }
              </p>
            </div>
            @if (t.signup && t.signup.status !== 'cancelado') {
              <span [class]="'pill pill--' + status(t.signup.status).tone">{{
                status(t.signup.status).label
              }}</span>
            } @else if (t.canSignup) {
              <button type="button" class="btn btn--primary" (click)="openForm()">
                <sfc-icon name="run" size="18" />Inscrever no Troféu
              </button>
            } @else if (!e.open) {
              <span class="pill pill--muted">Inscrições fechadas</span>
            }
          </div>

          @if (t.signup?.status === 'erro') {
            <p class="alert alert--warning" role="status">
              {{ t.signup!.message || 'A Xistarca recusou os dados.' }} A secretaria já foi avisada;
              podes corrigir a ficha e pedir de novo.
              @if (t.canSignup) {
                <button type="button" class="link-btn" (click)="openForm()">Pedir de novo</button>
              }
            </p>
          }
          @if (
            t.signup &&
            (t.signup.status === 'pedido' ||
              t.signup.status === 'validado' ||
              t.signup.status === 'erro')
          ) {
            <button type="button" class="link-btn" [disabled]="busy()" (click)="cancel()">
              Cancelar o pedido
            </button>
          }
          @if (message(); as m) {
            <p
              class="alert"
              [class.alert--success]="m.ok"
              [class.alert--warning]="!m.ok"
              role="status"
            >
              {{ m.text }}
            </p>
          }

          @if (t.races.length) {
            <ol class="races">
              @for (r of t.races; track r.round) {
                <li [class.past]="r.raceDate < today">
                  <span class="races__date">{{ r.raceDate | date: 'd MMM' }}</span>
                  <span class="races__name">
                    {{ r.round }}.ª · {{ r.name }}
                    @if (r.location) {
                      <span class="caption">· {{ r.location }}</span>
                    }
                  </span>
                  @if (r.infoUrl) {
                    <a [href]="r.infoUrl" target="_blank" rel="noopener" class="caption"
                      >Regulamento</a
                    >
                  }
                </li>
              }
            </ol>
          }
        </section>

        <sfc-dialog
          [heading]="'Inscrever no ' + e.name"
          [open]="formOpen()"
          (closed)="formOpen.set(false)"
        >
          <form (submit)="$event.preventDefault(); send()" class="form">
            <p class="caption">
              O clube inscreve o atleta na Xistarca (a organizadora) com os dados da ficha: nome,
              data de nascimento, género, n.º do CC, telefone, localidade e contacto de emergência.
              A inscrição não tem custo.
            </p>
            @if (need('gender')) {
              <div class="field">
                <label for="ts-gender">Género <span class="req">*</span></label>
                <select id="ts-gender" name="gender" [(ngModel)]="f.gender" required>
                  <option value="">—</option>
                  <option>Feminino</option>
                  <option>Masculino</option>
                </select>
              </div>
            }
            @if (need('idNumber')) {
              <div class="field">
                <label for="ts-cc">N.º do Cartão de Cidadão <span class="req">*</span></label>
                <input
                  id="ts-cc"
                  name="idNumber"
                  [(ngModel)]="f.idNumber"
                  maxlength="20"
                  required
                  autocomplete="off"
                />
              </div>
            }
            @if (need('emergency')) {
              <div class="form-row">
                <div class="field">
                  <label for="ts-en"
                    >Contacto de emergência — nome <span class="req">*</span></label
                  >
                  <input
                    id="ts-en"
                    name="emergencyName"
                    [(ngModel)]="f.emergencyName"
                    maxlength="120"
                    required
                  />
                </div>
                <div class="field">
                  <label for="ts-ep">Telefone <span class="req">*</span></label>
                  <input
                    id="ts-ep"
                    name="emergencyPhone"
                    [(ngModel)]="f.emergencyPhone"
                    maxlength="20"
                    required
                    inputmode="tel"
                  />
                </div>
              </div>
            }
            @if (need('birthDate')) {
              <p class="alert alert--warning">
                Falta a data de nascimento na ficha: pede à secretaria para a acrescentar.
              </p>
            }
            <label class="check">
              <input type="checkbox" name="consent" [(ngModel)]="f.consent" />
              <span
                >Autorizo o Serrado FC a enviar estes dados à Xistarca para a inscrição no Troféu de
                Almada.</span
              >
            </label>
            <div class="actions">
              <button
                type="submit"
                class="btn btn--primary"
                [disabled]="!f.consent || busy() || need('birthDate')"
              >
                {{ busy() ? 'A enviar…' : 'Pedir inscrição' }}
              </button>
            </div>
          </form>
        </sfc-dialog>
      }
    }
  `,
  styles: `
    .trophy {
      padding: 1.2rem 1.3rem;
      margin-bottom: 1.5rem;
      display: grid;
      gap: 0.8rem;
    }
    .trophy__head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.8rem;
      .caption {
        margin: 0.2rem 0 0;
      }
    }
    .pill {
      display: inline-block;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 700;
      background: var(--color-surface-2, #eef1f6);
      color: var(--color-text);
    }
    .pill--ok {
      background: #e3f4ea;
      color: #17663a;
    }
    .pill--warn {
      background: #fdf0dc;
      color: #8a4b00;
    }
    .pill--info {
      background: #e6eef8;
      color: var(--sfc-blue);
    }
    .races {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        display: flex;
        gap: 0.8rem;
        align-items: baseline;
        padding: 0.45rem 0;
        border-top: 1px solid var(--color-line);
      }
      .past {
        opacity: 0.55;
      }
    }
    .races__date {
      flex: none;
      width: 4.2rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .races__name {
      flex: 1;
    }
    .link-btn {
      border: 0;
      background: none;
      color: var(--color-primary, var(--sfc-blue));
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
      font: inherit;
      font-size: 0.9rem;
      justify-self: start;
    }
    .form {
      display: grid;
      gap: 1rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class TrophySignupComponent {
  readonly athleteId = input.required<string>();
  private readonly api = inject(ApiClient);
  protected readonly data = signal<Trophy | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected f = { consent: false, gender: '', idNumber: '', emergencyName: '', emergencyPhone: '' };
  private readonly missing = computed(() => new Set(this.data()?.missing ?? []));
  private poll: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect((onCleanup) => {
      const id = this.athleteId();
      this.data.set(null);
      this.message.set(null);
      if (this.api.enabled) void this.load(id);
      onCleanup(() => clearTimeout(this.poll));
    });
  }

  protected status(s: string) {
    return STATUS[s] ?? { label: s, tone: 'muted' as const };
  }

  protected need(field: string) {
    return this.missing().has(field);
  }

  private async load(id: string) {
    const t = await this.api.get<Trophy>(`/athletes/${id}/trophy`).catch(() => null);
    if (id !== this.athleteId()) return;
    this.data.set(t);
    // Enquanto o pedido está a ser enviado à Xistarca, atualiza o estado sozinho (durante ~2 minutos)
    clearTimeout(this.poll);
    if (t?.signup?.status === 'pedido' && Date.now() - Date.parse(t.signup.requestedAt) < 120_000) {
      this.poll = setTimeout(() => void this.load(id), 8000);
    }
  }

  protected openForm() {
    this.f = { consent: false, gender: '', idNumber: '', emergencyName: '', emergencyPhone: '' };
    this.message.set(null);
    this.formOpen.set(true);
  }

  protected async send() {
    const id = this.athleteId();
    const body: Record<string, unknown> = { consent: true };
    for (const k of ['gender', 'idNumber', 'emergencyName', 'emergencyPhone'] as const) {
      if (this.f[k].trim()) body[k] = this.f[k].trim();
    }
    this.busy.set(true);
    try {
      await this.api.post(`/athletes/${id}/trophy/signup`, body);
      this.formOpen.set(false);
      this.message.set({
        ok: true,
        text: 'Pedido registado. O clube trata da inscrição na Xistarca e o estado aparece aqui.',
      });
      await this.load(id);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
      this.formOpen.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  protected async cancel() {
    const id = this.athleteId();
    this.busy.set(true);
    try {
      await this.api.delete(`/athletes/${id}/trophy/signup`);
      this.message.set({ ok: true, text: 'Pedido cancelado.' });
      await this.load(id);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }
}
