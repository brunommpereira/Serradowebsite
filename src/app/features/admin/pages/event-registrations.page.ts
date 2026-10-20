import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { toCsv } from '../../../shared/tabular';

type Status = 'inscrito' | 'pago' | 'cancelado';

interface EventSummary {
  id: number;
  slug: string;
  title: string;
  startsAt: string;
  capacity: number;
  price: number;
  status: string;
  people: number;
  registrations: number;
  amount: number;
  paid: number;
}

interface Registration {
  id: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  people: number;
  isMember: boolean;
  memberNumber: string;
  sport: string | null;
  shirtSize: string | null;
  notes: string;
  amount: number;
  consentImage: boolean;
  status: Status;
  staffNote: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

const STATUS: { key: Status; label: string }[] = [
  { key: 'inscrito', label: 'Inscrito' },
  { key: 'pago', label: 'Pago' },
  { key: 'cancelado', label: 'Cancelado' },
];
const SPORT_LABEL: Record<string, string> = { atletismo: 'Atletismo', futsal: 'Futsal', rugby: 'Rugby' };

/** Inscrições feitas no site nos eventos com «Exige inscrição»: totais, marcar pago, cancelar e exportar. */
@Component({
  selector: 'sfc-admin-event-registrations',
  imports: [CurrencyPipe, DatePipe, FormsModule, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Inscrições em eventos</h1>
        <p>
          Inscrições feitas no site nos eventos com «Exige inscrição» (Conteúdos → Eventos). Recebes
          um email a cada inscrição nova. O pagamento não é feito no site: marca aqui quem já pagou.
        </p>
      </div>
      @if (api.enabled && rows().length) {
        <button type="button" class="btn btn--outline btn--sm" (click)="exportCsv()">
          <sfc-icon name="download" size="16" />Exportar (CSV)
        </button>
      }
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="As inscrições em eventos funcionam com o site ligado à API (VPS)."
      />
    } @else {
      <div class="adm-toolbar">
        <label class="visually-hidden" for="ev-sel">Evento</label>
        <select id="ev-sel" class="sel" [ngModel]="eventId()" (ngModelChange)="pick($event)">
          @for (e of events(); track e.id) {
            <option [ngValue]="e.id">{{ e.title }} · {{ e.startsAt | date: 'dd/MM/y' }}</option>
          } @empty {
            <option [ngValue]="null">Nenhum evento com inscrição</option>
          }
        </select>
        <div class="chips" role="group" aria-label="Estado">
          <button type="button" class="chip" [attr.aria-pressed]="!status()" (click)="status.set(null)">
            Todas ({{ all().length }})
          </button>
          @for (s of statuses; track s.key) {
            <button
              type="button"
              class="chip"
              [attr.aria-pressed]="status() === s.key"
              (click)="status.set(s.key)"
            >
              {{ s.label }} ({{ count(s.key) }})
            </button>
          }
        </div>
      </div>

      @if (current(); as e) {
        <div class="stats">
          <div class="adm-panel stat">
            <span class="caption">Pessoas</span
            ><strong>{{ e.people }}@if (e.capacity) { <small>/ {{ e.capacity }}</small>}</strong>
          </div>
          <div class="adm-panel stat">
            <span class="caption">Inscrições</span><strong>{{ e.registrations }}</strong>
          </div>
          <div class="adm-panel stat">
            <span class="caption">Valor total</span><strong>{{ e.amount | currency: 'EUR' }}</strong>
          </div>
          <div class="adm-panel stat">
            <span class="caption">Já pago</span><strong>{{ e.paid | currency: 'EUR' }}</strong>
          </div>
        </div>
        <p class="caption">
          Formulário público:
          <a [href]="'/eventos/' + e.slug + '#inscricao'" target="_blank" rel="noopener"
            >/eventos/{{ e.slug }}</a
          >
        </p>
      }

      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status">
          {{ m.text }}
        </p>
      }

      <ul class="list">
        @for (r of rows(); track r.id) {
          <li class="adm-panel item" [class.item--off]="r.status === 'cancelado'">
            <div class="item__head">
              <div>
                <strong class="item__name">{{ r.name }}</strong>
                <span class="caption"
                  >{{ r.people === 1 ? '1 pessoa' : r.people + ' pessoas' }} ·
                  {{ r.amount | currency: 'EUR' }} · {{ r.code }}
                  @if (r.isMember) {
                    · sócio{{ r.memberNumber ? ' n.º ' + r.memberNumber : '' }}
                  }
                  @if (r.sport) {
                    · {{ sportLabel(r.sport) }}
                  }
                  @if (r.shirtSize) {
                    · t-shirt {{ r.shirtSize }}
                  }
                  · {{ r.createdAt | date: 'dd/MM/y HH:mm' }}</span
                >
              </div>
              <select
                class="sel st-sel"
                [ngModel]="r.status"
                (ngModelChange)="setStatus(r, $event)"
                [attr.aria-label]="'Estado da inscrição de ' + r.name"
              >
                @for (s of statuses; track s.key) {
                  <option [value]="s.key">{{ s.label }}</option>
                }
              </select>
            </div>
            <p class="contact">
              <a [href]="'tel:' + r.phone"><sfc-icon name="phone" size="16" />{{ r.phone }}</a> ·
              <a [href]="'mailto:' + r.email"><sfc-icon name="mail" size="16" />{{ r.email }}</a>
              @if (!r.consentImage) {
                · <span class="caption">sem autorização de imagem</span>
              }
            </p>
            @if (r.notes) {
              <p class="notes">«{{ r.notes }}»</p>
            }
            <div class="note">
              <label [for]="'note-' + r.id" class="caption">Nota interna</label>
              <div class="note__row">
                <input
                  [id]="'note-' + r.id"
                  [(ngModel)]="drafts[r.id]"
                  maxlength="2000"
                  placeholder="Ex.: pagou por MB Way a 02/11"
                />
                <button
                  type="button"
                  class="btn btn--outline btn--sm"
                  [disabled]="drafts[r.id] === r.staffNote"
                  (click)="saveNote(r)"
                >
                  Guardar
                </button>
                @if (canDelete()) {
                  <button
                    type="button"
                    class="ic"
                    (click)="remove(r)"
                    [attr.aria-label]="'Apagar a inscrição de ' + r.name"
                    title="Apagar"
                  >
                    <sfc-icon name="trash" size="18" />
                  </button>
                }
              </div>
              @if (r.updatedBy) {
                <span class="caption"
                  >Atualizado por {{ r.updatedBy }} a {{ r.updatedAt | date: 'dd/MM/y HH:mm' }}</span
                >
              }
            </div>
          </li>
        } @empty {
          <li class="adm-empty">{{ loading() ? 'A carregar…' : 'Sem inscrições.' }}</li>
        }
      </ul>
    }
  `,
  styles: `
    select,
    input {
      font: inherit;
      padding: 0.45rem 0.65rem;
      border: 1.5px solid #c9cfdb;
      border-radius: var(--radius-s);
      background: #fff;
      color: var(--color-text);
    }
    .adm-head {
      align-items: flex-start;
      gap: 1rem;
    }
    .adm-toolbar .sel {
      max-width: 420px;
    }
    .alert {
      margin-bottom: 1rem;
    }
    .stats {
      display: grid;
      gap: 0.8rem;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      margin-bottom: 0.6rem;
    }
    .stat {
      display: grid;
      gap: 0.2rem;
      strong {
        font: 800 1.5rem var(--font-display);
        color: var(--sfc-blue);
      }
      small {
        font-size: 0.9rem;
        color: var(--color-muted);
      }
    }
    .list {
      list-style: none;
      margin: 1rem 0 0;
      padding: 0;
      display: grid;
      gap: 0.8rem;
    }
    .item--off {
      opacity: 0.6;
    }
    .item__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.8rem;
      flex-wrap: wrap;
      .caption {
        display: block;
      }
    }
    .item__name {
      font-size: 1.05rem;
    }
    .st-sel {
      width: auto;
      min-width: 150px;
    }
    .contact {
      margin: 0.6rem 0 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.3rem 0.4rem;
      overflow-wrap: anywhere;
      a {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
    }
    .notes {
      margin: 0.4rem 0 0;
      color: var(--color-muted);
      font-style: italic;
    }
    .note {
      margin-top: 0.7rem;
    }
    .note__row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      input {
        flex: 1;
        min-width: 0;
      }
    }
    .ic {
      flex: none;
      width: 38px;
      height: 38px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--color-danger);
      cursor: pointer;
      &:hover {
        background: var(--color-bg-soft);
      }
    }
  `,
})
export class EventRegistrationsPage {
  protected readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  protected readonly statuses = STATUS;
  protected readonly events = signal<EventSummary[]>([]);
  protected readonly eventId = signal<number | null>(null);
  protected readonly current = computed(() => this.events().find((e) => e.id === this.eventId()) ?? null);
  protected readonly all = signal<Registration[]>([]);
  protected readonly status = signal<Status | null>(null);
  protected readonly loading = signal(true);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly canDelete = computed(() => this.auth.can('registrations.manage'));
  protected drafts: Record<number, string> = {};
  protected readonly rows = computed(() => this.all().filter((r) => !this.status() || r.status === this.status()));

  constructor() {
    if (this.api.enabled) void this.loadEvents();
  }

  protected count(s: Status) {
    return this.all().filter((r) => r.status === s).length;
  }

  protected sportLabel(s: string) {
    return SPORT_LABEL[s] ?? s;
  }

  protected async pick(id: number | null) {
    this.eventId.set(id);
    this.status.set(null);
    await this.load();
  }

  async setStatus(r: Registration, status: Status) {
    await this.patch(r, { status }, `${r.name}: ${STATUS.find((s) => s.key === status)?.label.toLowerCase()}.`);
  }

  async saveNote(r: Registration) {
    await this.patch(r, { staffNote: (this.drafts[r.id] ?? '').trim() }, 'Nota guardada.');
  }

  async remove(r: Registration) {
    if (!confirm(`Apagar a inscrição de ${r.name}? Os dados deixam de existir no site.`)) return;
    try {
      await this.api.delete(`/admin/event-registrations/${r.id}`);
      await this.refresh();
      this.message.set({ ok: true, text: 'Inscrição apagada.' });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  exportCsv() {
    const head = ['Data', 'N.º', 'Nome', 'Telemóvel', 'Email', 'Pessoas', 'Valor', 'Sócio', 'N.º sócio', 'Modalidade', 'T-shirt', 'Autoriza imagem', 'Observações', 'Estado', 'Nota interna'];
    const lines = this.rows().map((r) => [
      r.createdAt.slice(0, 10),
      r.code,
      r.name,
      r.phone,
      r.email,
      r.people,
      r.amount.toFixed(2).replace('.', ','),
      r.isMember ? 'Sim' : 'Não',
      r.memberNumber,
      r.sport ? this.sportLabel(r.sport) : '',
      r.shirtSize ?? '',
      r.consentImage ? 'Sim' : 'Não',
      r.notes,
      STATUS.find((s) => s.key === r.status)?.label ?? r.status,
      r.staffNote,
    ]);
    const url = URL.createObjectURL(new Blob([toCsv([head, ...lines])], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `inscricoes-${this.current()?.slug ?? 'evento'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async patch(r: Registration, body: Partial<Pick<Registration, 'status' | 'staffNote'>>, ok: string) {
    try {
      await this.api.patch(`/admin/event-registrations/${r.id}`, body);
      await this.refresh();
      this.message.set({ ok: true, text: ok });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  private async refresh() {
    await Promise.all([this.loadEvents(false), this.load()]);
  }

  private async loadEvents(pickFirst = true) {
    try {
      const list = await this.api.get<EventSummary[]>('/admin/event-registrations/events');
      this.events.set(list);
      if (pickFirst) {
        // O próximo evento (ou o mais recente)
        const today = new Date().toISOString().slice(0, 10);
        const next = [...list].reverse().find((e) => e.startsAt.slice(0, 10) >= today) ?? list[0];
        await this.pick(next?.id ?? null);
      }
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
      this.loading.set(false);
    }
  }

  private async load() {
    const id = this.eventId();
    if (!id) {
      this.all.set([]);
      this.loading.set(false);
      return;
    }
    try {
      const list = await this.api.get<Registration[]>('/admin/event-registrations', { eventId: id });
      this.all.set(list);
      this.drafts = Object.fromEntries(list.map((r) => [r.id, r.staffNote]));
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.loading.set(false);
    }
  }
}
