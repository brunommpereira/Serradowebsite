import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { DialogComponent } from '../../../shared/dialog.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

interface Race {
  round: number;
  name: string;
  raceDate: string | null;
  /** Quando ainda não há data: «janeiro de 2027», «a definir» */
  dateLabel: string;
  location: string | null;
  infoUrl: string | null;
}

interface Edition {
  id: number;
  season: string;
  name: string;
  eventUrl: string;
  modalityId: string;
  teamName: string;
  clubOption: string;
  opensOn: string | null;
  closesOn: string | null;
  mode: 'test' | 'live';
  active: boolean;
  open: boolean;
  counts: Record<string, number>;
  races: Race[];
}

interface Signup {
  id: number;
  status: string;
  message: string;
  attempts: number;
  requestedAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  athleteId: string;
  code: string;
  name: string;
  category: string | null;
  requestedByName: string | null;
  missing: string[];
}

interface AthleteHit {
  id: string;
  code: string;
  name: string;
  category: string | null;
  sportSlug: string;
}

const LABEL: Record<string, string> = {
  pedido: 'Em fila',
  validado: 'Validado (teste)',
  inscrito: 'Inscrito',
  erro: 'Erro',
  cancelado: 'Cancelado',
};
const TONE: Record<string, string> = {
  pedido: 'st--warn',
  validado: 'st--warn',
  inscrito: 'st--ok',
  erro: 'st--bad',
  cancelado: '',
};
const MISSING: Record<string, string> = {
  birthDate: 'data de nascimento',
  gender: 'género',
  idNumber: 'CC',
  emergency: 'contacto de emergência',
};
const blank = (): Partial<Edition> => {
  const y = new Date().getFullYear();
  const season = new Date().getMonth() >= 7 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
  return {
    season,
    name: `Troféu de Almada ${season}`,
    eventUrl: 'https://checkout.xistarca.pt/evento/',
    modalityId: '',
    teamName: 'Serrado FC',
    clubOption: 'Serrado FC / Outdoor Training Camp',
    opensOn: null,
    closesOn: null,
    mode: 'test',
    active: true,
  };
};

/** Troféu de Almada: edição (evento na Xistarca), provas e pedidos de inscrição feitos na área do atleta. */
@Component({
  selector: 'sfc-admin-trophy',
  imports: [DatePipe, FormsModule, DialogComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Inscrições no Troféu</h1>
        <p>
          Os atletas (ou os encarregados) pedem a inscrição na área do atleta e o servidor
          inscreve-os na Xistarca com a conta do clube. Uma inscrição no 1.º evento da época vale
          para todas as provas. Em <strong>modo de teste</strong> só se validam os dados.
        </p>
      </div>
      @if (api.enabled) {
        <button type="button" class="btn btn--outline btn--sm" (click)="edit(null)">
          Nova edição
        </button>
      }
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="As inscrições são enviadas à Xistarca pelo servidor (VPS)."
      />
    } @else {
      @if (configured() === false) {
        <p class="alert alert--warning">
          A conta Xistarca do clube ainda não está no servidor: <code>sudo serrado xistarca</code>.
          Os pedidos ficam em fila até lá.
        </p>
      }
      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status">
          {{ m.text }}
        </p>
      }

      @if (editions().length > 1) {
        <div class="chips" role="group" aria-label="Edição">
          @for (e of editions(); track e.id) {
            <button
              type="button"
              class="chip"
              [attr.aria-pressed]="current()?.id === e.id"
              (click)="selected.set(e.id)"
            >
              {{ e.season }}
            </button>
          }
        </div>
      }

      @if (current(); as e) {
        <section class="adm-panel ed">
          <div class="ed__head">
            <div>
              <h2 class="h-s">{{ e.name }}</h2>
              <p class="caption">
                @if (e.eventUrl) {
                  <a [href]="e.eventUrl" target="_blank" rel="noopener">{{ e.eventUrl }}</a>
                } @else {
                  <strong
                    >Sem endereço do evento na Xistarca: o site mostra as provas, mas ainda não
                    aceita pedidos</strong
                  >
                }
                · {{ e.mode === 'live' ? 'Modo real' : 'Modo de teste' }} ·
                {{
                  e.active ? (e.open ? 'inscrições abertas no site' : 'fora do prazo') : 'inativa'
                }}
              </p>
            </div>
            <div class="ed__actions">
              <button
                type="button"
                class="btn btn--outline btn--sm"
                [disabled]="busy()"
                (click)="check(e)"
              >
                Testar ligação
              </button>
              <button type="button" class="btn btn--outline btn--sm" (click)="edit(e)">
                Alterar
              </button>
              <button type="button" class="btn btn--outline btn--sm" (click)="editRaces(e)">
                Provas ({{ e.races.length }})
              </button>
            </div>
          </div>
        </section>

        <div class="bar">
          <div class="chips" role="group" aria-label="Estado">
            <button
              type="button"
              class="chip"
              [attr.aria-pressed]="status() === ''"
              (click)="status.set('')"
            >
              Todos ({{ total(e) }})
            </button>
            @for (s of states; track s) {
              <button
                type="button"
                class="chip"
                [attr.aria-pressed]="status() === s"
                (click)="status.set(s)"
              >
                {{ label(s) }} ({{ e.counts[s] || 0 }})
              </button>
            }
          </div>
          <div class="bar__actions">
            <button type="button" class="btn btn--outline btn--sm" (click)="openAdd()">
              Inscrever atletas
            </button>
            <button
              type="button"
              class="btn btn--primary btn--sm"
              [disabled]="busy() || !configured()"
              (click)="runNow()"
            >
              Enviar agora
            </button>
          </div>
        </div>

        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th scope="col">Atleta</th>
                <th scope="col" class="hide-sm">Escalão</th>
                <th scope="col">Estado</th>
                <th scope="col" class="hide-sm">Pedido</th>
                <th scope="col"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of signups(); track s.id) {
                <tr>
                  <td>
                    {{ s.name }}<span class="caption sub">{{ s.code }}</span>
                    @if (s.missing.length) {
                      <span class="caption sub warn">Falta: {{ missingText(s.missing) }}</span>
                    }
                  </td>
                  <td class="hide-sm">{{ s.category ?? '—' }}</td>
                  <td>
                    <span [class]="'st ' + tone(s.status)">{{ label(s.status) }}</span>
                    @if (s.message) {
                      <span class="caption sub">{{ s.message }}</span>
                    }
                  </td>
                  <td class="hide-sm nowrap">
                    {{ s.requestedAt | date: 'dd/MM/y HH:mm'
                    }}<span class="caption sub">{{ s.requestedByName ?? '' }}</span>
                  </td>
                  <td class="nowrap">
                    @if (s.status !== 'inscrito') {
                      <button
                        type="button"
                        class="link-btn"
                        [disabled]="busy()"
                        (click)="act(s, 'retry')"
                      >
                        Repetir
                      </button>
                      <button
                        type="button"
                        class="link-btn"
                        [disabled]="busy()"
                        (click)="act(s, 'done')"
                      >
                        Marcar inscrito
                      </button>
                    }
                    @if (s.status === 'pedido' || s.status === 'validado' || s.status === 'erro') {
                      <button
                        type="button"
                        class="link-btn"
                        [disabled]="busy()"
                        (click)="act(s, 'cancel')"
                      >
                        Cancelar
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="adm-empty">
                    Sem pedidos{{ status() ? ' neste estado' : '' }}.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (loaded()) {
        <p class="adm-panel">
          Ainda não há nenhuma edição. Cria a da época com o endereço da 1.ª prova na Xistarca.
        </p>
      }

      <!-- Edição -->
      <sfc-dialog
        [heading]="form.id ? 'Alterar edição' : 'Nova edição'"
        [open]="formOpen()"
        (closed)="formOpen.set(false)"
      >
        <form class="form" (submit)="$event.preventDefault(); save()">
          <div class="form-row">
            <div class="field">
              <label for="te-season">Época</label
              ><input
                id="te-season"
                name="season"
                [(ngModel)]="form.season"
                placeholder="2026/2027"
                required
              />
            </div>
            <div class="field">
              <label for="te-name">Nome</label
              ><input id="te-name" name="name" [(ngModel)]="form.name" required />
            </div>
          </div>
          <div class="field">
            <label for="te-url">Endereço do evento na Xistarca (1.ª prova)</label>
            <input
              id="te-url"
              name="eventUrl"
              [(ngModel)]="form.eventUrl"
              placeholder="https://checkout.xistarca.pt/evento/... (vazio até a Xistarca abrir o evento)"
            />
          </div>
          <div class="form-row">
            <div class="field">
              <label for="te-mod">Modalidade (id)</label>
              <input
                id="te-mod"
                name="modalityId"
                [(ngModel)]="form.modalityId"
                placeholder="vazio = a primeira"
                inputmode="numeric"
              />
              <span class="hint">O «Testar ligação» mostra as modalidades do evento.</span>
            </div>
            <div class="field">
              <label for="te-team">Nome da equipa</label
              ><input id="te-team" name="teamName" [(ngModel)]="form.teamName" maxlength="30" />
            </div>
          </div>
          <div class="field">
            <label for="te-club">Clube na lista «Clube/Coletividade de Almada»</label>
            <input id="te-club" name="clubOption" [(ngModel)]="form.clubOption" />
          </div>
          <div class="form-row">
            <div class="field">
              <label for="te-open">Inscrições no site de</label
              ><input id="te-open" type="date" name="opensOn" [(ngModel)]="form.opensOn" />
            </div>
            <div class="field">
              <label for="te-close">até</label
              ><input id="te-close" type="date" name="closesOn" [(ngModel)]="form.closesOn" />
            </div>
          </div>
          <div class="field">
            <label for="te-mode">Modo</label>
            <select id="te-mode" name="mode" [(ngModel)]="form.mode">
              <option value="test">Teste — só valida os dados na Xistarca</option>
              <option value="live">Real — inscreve na Xistarca</option>
            </select>
          </div>
          <label class="check"
            ><input type="checkbox" name="active" [(ngModel)]="form.active" /><span
              >Edição ativa (aparece na área do atleta)</span
            ></label
          >
          <div class="actions">
            <button type="submit" class="btn btn--primary" [disabled]="busy()">Guardar</button>
          </div>
        </form>
      </sfc-dialog>

      <!-- Provas -->
      <sfc-dialog heading="Provas da edição" [open]="racesOpen()" (closed)="racesOpen.set(false)">
        <form class="form" (submit)="$event.preventDefault(); saveRaces()">
          @for (r of races; track $index; let i = $index) {
            <div class="race-row">
              <input
                [name]="'r' + i"
                type="number"
                min="1"
                [(ngModel)]="r.round"
                aria-label="N.º"
                class="num"
              />
              <input [name]="'d' + i" type="date" [(ngModel)]="r.raceDate" aria-label="Data" />
              @if (!r.raceDate) {
                <input
                  [name]="'dl' + i"
                  [(ngModel)]="r.dateLabel"
                  placeholder="Data prevista (ex.: janeiro de 2027)"
                  aria-label="Data prevista"
                  maxlength="40"
                />
              }
              <input
                [name]="'n' + i"
                [(ngModel)]="r.name"
                placeholder="Nome da prova"
                aria-label="Nome"
                class="grow"
              />
              <input
                [name]="'l' + i"
                [(ngModel)]="r.location"
                placeholder="Local"
                aria-label="Local"
              />
              <button
                type="button"
                class="link-btn"
                (click)="races.splice(i, 1)"
                aria-label="Remover"
              >
                ✕
              </button>
            </div>
          }
          <button type="button" class="btn btn--outline btn--sm" (click)="addRace()">Prova</button>
          <div class="actions">
            <button type="submit" class="btn btn--primary" [disabled]="busy()">
              Guardar provas
            </button>
          </div>
        </form>
      </sfc-dialog>

      <!-- Inscrever atletas -->
      <sfc-dialog heading="Inscrever atletas" [open]="addOpen()" (closed)="addOpen.set(false)">
        <form class="search" (submit)="$event.preventDefault(); search()">
          <input
            name="q"
            [(ngModel)]="q"
            placeholder="Nome ou código (vazio = todos do atletismo)"
            maxlength="80"
            aria-label="Procurar atleta"
          />
          <button type="submit" class="btn btn--outline btn--sm">Procurar</button>
        </form>
        <ul class="hits">
          @for (a of hits(); track a.id) {
            <li>
              <label class="check">
                <input type="checkbox" [checked]="picked().has(a.id)" (change)="toggle(a.id)" />
                <span
                  >{{ a.name }}
                  <span class="caption">{{ a.code }} · {{ a.category ?? '—' }}</span></span
                >
              </label>
            </li>
          } @empty {
            <li class="caption">Procura os atletas a inscrever.</li>
          }
        </ul>
        <p class="caption">
          A secretaria confirma que tem a autorização dos atletas (ou encarregados) para enviar os
          dados à Xistarca.
        </p>
        <div class="actions">
          <button
            type="button"
            class="btn btn--primary"
            [disabled]="!picked().size || busy()"
            (click)="addPicked()"
          >
            Inscrever {{ picked().size }}
          </button>
        </div>
      </sfc-dialog>
    }
  `,
  styles: `
    .ed {
      margin-bottom: 1rem;
    }
    .ed__head,
    .bar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.8rem;
    }
    .ed__head .caption {
      margin: 0.2rem 0 0;
      word-break: break-all;
    }
    .ed__actions,
    .bar__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .bar {
      margin-bottom: 0.8rem;
    }
    .sub {
      display: block;
    }
    .warn {
      color: var(--color-danger);
    }
    .link-btn {
      border: 0;
      background: none;
      color: var(--color-primary, var(--sfc-blue));
      text-decoration: underline;
      cursor: pointer;
      padding: 0 0.4rem 0 0;
      font: inherit;
      font-size: 0.85rem;
    }
    .form {
      display: grid;
      gap: 0.9rem;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
    .race-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      input {
        font: inherit;
        padding: 0.4rem 0.5rem;
        border: 1.5px solid #c9cfdb;
        border-radius: var(--radius-s);
        min-width: 0;
      }
      .num {
        width: 4rem;
      }
      .grow {
        flex: 1 1 12rem;
      }
    }
    .search {
      display: flex;
      gap: 0.5rem;
      margin: 0.4rem 0;
      input {
        flex: 1;
        font: inherit;
        padding: 0.4rem 0.6rem;
      }
    }
    .hits {
      list-style: none;
      margin: 0 0 0.8rem;
      padding: 0;
      max-height: 50vh;
      overflow: auto;
      li {
        padding: 0.3rem 0;
        border-bottom: 1px solid var(--color-line);
      }
    }
  `,
})
export class TrophyPage {
  protected readonly api = inject(ApiClient);
  protected readonly states = ['pedido', 'validado', 'inscrito', 'erro', 'cancelado'];
  protected readonly editions = signal<Edition[]>([]);
  protected readonly configured = signal<boolean | null>(null);
  protected readonly loaded = signal(false);
  protected readonly selected = signal<number | null>(null);
  protected readonly status = signal('');
  protected readonly signups = signal<Signup[]>([]);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly current = computed<Edition | null>(
    () => this.editions().find((e) => e.id === this.selected()) ?? this.editions().at(0) ?? null,
  );

  protected readonly formOpen = signal(false);
  protected form: Partial<Edition> = blank();
  protected readonly racesOpen = signal(false);
  protected races: Race[] = [];
  protected readonly addOpen = signal(false);
  protected q = '';
  protected readonly hits = signal<AthleteHit[]>([]);
  protected readonly picked = signal<Set<string>>(new Set());

  constructor() {
    if (this.api.enabled) void this.reload();
    effect(() => {
      const e = this.current();
      const s = this.status();
      if (e) void this.loadSignups(e.id, s);
    });
  }

  protected label(s: string) {
    return LABEL[s] ?? s;
  }
  protected tone(s: string) {
    return TONE[s] ?? '';
  }
  protected missingText(m: string[]) {
    return m.map((x) => MISSING[x] ?? x).join(', ');
  }
  protected total(e: Edition) {
    return Object.values(e.counts ?? {}).reduce((a, b) => a + b, 0);
  }

  private async reload() {
    try {
      const out = await this.api.get<{ configured: boolean; editions: Edition[] }>(
        '/admin/races/editions',
      );
      this.configured.set(out.configured);
      this.editions.set(out.editions);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.loaded.set(true);
    }
  }

  private async loadSignups(id: number, status: string) {
    const list = await this.api
      .get<Signup[]>(`/admin/races/editions/${id}/signups`, status ? { status } : {})
      .catch(() => []);
    if (this.current()?.id === id && this.status() === status) this.signups.set(list);
  }

  private async refresh() {
    await this.reload();
    const e = this.current();
    if (e) await this.loadSignups(e.id, this.status());
  }

  private async run(task: () => Promise<string | void>) {
    this.busy.set(true);
    this.message.set(null);
    try {
      const text = await task();
      if (text) this.message.set({ ok: true, text });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }

  protected edit(e: Edition | null) {
    this.form = e ? { ...e } : blank();
    this.formOpen.set(true);
  }

  protected save() {
    const {
      id,
      season,
      name,
      eventUrl,
      modalityId,
      teamName,
      clubOption,
      opensOn,
      closesOn,
      mode,
      active,
    } = this.form;
    const body = {
      season,
      name,
      eventUrl: eventUrl?.trim(),
      modalityId: modalityId ?? '',
      teamName,
      clubOption,
      opensOn: opensOn || null,
      closesOn: closesOn || null,
      mode,
      active,
    };
    void this.run(async () => {
      const saved = id
        ? await this.api.put<Edition>(`/admin/races/editions/${id}`, body)
        : await this.api.post<Edition>('/admin/races/editions', body);
      this.formOpen.set(false);
      this.selected.set(saved.id);
      await this.refresh();
      return 'Edição guardada.';
    });
  }

  protected check(e: Edition) {
    void this.run(async () => {
      const out = await this.api.post<{ ok: boolean; message: string }>(
        `/admin/races/editions/${e.id}/check`,
      );
      if (!out.ok) throw new Error(out.message);
      return `Xistarca: ${out.message}`;
    });
  }

  protected editRaces(e: Edition) {
    this.races = e.races.map((r) => ({ ...r }));
    if (!this.races.length) this.addRace();
    this.racesOpen.set(true);
  }

  protected addRace() {
    const next = Math.max(0, ...this.races.map((r) => r.round)) + 1;
    this.races.push({
      round: next,
      name: '',
      raceDate: '',
      dateLabel: '',
      location: null,
      infoUrl: null,
    });
  }

  protected saveRaces() {
    const e = this.current();
    if (!e) return;
    const races = this.races
      .filter((r) => r.name.trim())
      .map((r) => ({
        round: Number(r.round),
        name: r.name.trim(),
        raceDate: r.raceDate || null,
        dateLabel: r.raceDate ? '' : r.dateLabel?.trim() || 'a definir',
        location: r.location?.trim() || null,
        infoUrl: r.infoUrl?.trim() || null,
      }));
    void this.run(async () => {
      await this.api.put(`/admin/races/editions/${e.id}/calendar`, { races });
      this.racesOpen.set(false);
      await this.refresh();
      return `${races.length} prova(s) guardada(s).`;
    });
  }

  protected act(s: Signup, action: 'retry' | 'cancel' | 'done') {
    void this.run(async () => {
      await this.api.post(`/admin/races/signups/${s.id}/${action}`);
      await this.refresh();
      return action === 'retry'
        ? `${s.name}: de volta à fila.`
        : action === 'done'
          ? `${s.name}: marcado como inscrito.`
          : `${s.name}: pedido cancelado.`;
    });
  }

  protected runNow() {
    void this.run(async () => {
      await this.api.post('/admin/races/run');
      setTimeout(() => void this.refresh(), 15000);
      return 'A enviar à Xistarca em segundo plano… a lista atualiza dentro de momentos.';
    });
  }

  protected openAdd() {
    this.q = '';
    this.hits.set([]);
    this.picked.set(new Set());
    this.addOpen.set(true);
    void this.search();
  }

  protected async search() {
    const q = this.q.trim();
    const list = await this.api
      .get<AthleteHit[]>('/admin/athletes', q.length >= 2 ? { q } : { sport: 'atletismo' })
      .catch(() => []);
    this.hits.set(list.slice(0, 200));
  }

  protected toggle(id: string) {
    const s = new Set(this.picked());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.picked.set(s);
  }

  protected addPicked() {
    const e = this.current();
    if (!e) return;
    void this.run(async () => {
      const out = await this.api.post<{ added: number }>(`/admin/races/editions/${e.id}/signups`, {
        athleteIds: [...this.picked()],
      });
      this.addOpen.set(false);
      await this.refresh();
      return `${out.added} atleta(s) em fila${this.configured() ? '' : ' (envio quando a conta Xistarca estiver configurada)'}.`;
    });
  }
}
