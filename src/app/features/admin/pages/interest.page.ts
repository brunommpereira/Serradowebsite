import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { toCsv } from '../../../shared/tabular';

type Status = 'novo' | 'contactado' | 'inscrito' | 'desistiu';

interface Interest {
  id: number;
  sport: string;
  childName: string;
  birthDate: string | null;
  guardianName: string;
  email: string;
  phone: string;
  notes: string;
  status: Status;
  staffNote: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

const SPORT_LABEL: Record<string, string> = {
  futsal: 'Escola de Futsal',
  'escola-de-desporto': 'Escola de Desporto',
  rugby: 'Escola de Rugby',
  atletismo: 'Atletismo',
  formacao: 'Formação',
};
const STATUS: { key: Status; label: string }[] = [
  { key: 'novo', label: 'Novo' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'inscrito', label: 'Inscrito' },
  { key: 'desistiu', label: 'Desistiu' },
];

/** Pré-inscrições feitas no site (/pre-inscricao): contactar, marcar o estado e apagar quando já não forem precisas. */
@Component({
  selector: 'sfc-admin-interest',
  imports: [DatePipe, FormsModule, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Pré-inscrições</h1>
        <p>
          Pedidos de contacto feitos em
          <a href="/pre-inscricao" target="_blank" rel="noopener">/pre-inscricao</a> (ainda não são
          atletas). Recebes um email a cada pedido novo.
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
        text="As pré-inscrições funcionam com o site ligado à API (VPS)."
      />
    } @else {
      <div class="adm-toolbar">
        <div class="chips" role="group" aria-label="Estado">
          <button
            type="button"
            class="chip"
            [attr.aria-pressed]="!status()"
            (click)="status.set(null)"
          >
            Todos ({{ all().length }})
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
        <label class="visually-hidden" for="in-sport">Modalidade</label>
        <select id="in-sport" class="sel" [ngModel]="sport()" (ngModelChange)="sport.set($event)">
          <option value="">Todas as modalidades</option>
          @for (s of sportOptions; track s.key) {
            <option [value]="s.key">{{ s.label }}</option>
          }
        </select>
      </div>

      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status">
          {{ m.text }}
        </p>
      }

      <ul class="list">
        @for (r of rows(); track r.id) {
          <li class="adm-panel item">
            <div class="item__head">
              <div>
                <strong class="item__name">{{ r.childName }}</strong>
                <span class="caption"
                  >{{ sportLabel(r.sport)
                  }}{{
                    r.birthDate
                      ? ' · ' + age(r.birthDate) + ' anos (' + (r.birthDate | date: 'dd/MM/y') + ')'
                      : ''
                  }}
                  · pedido a {{ r.createdAt | date: 'dd/MM/y HH:mm' }}</span
                >
              </div>
              <select
                class="sel st-sel"
                [ngModel]="r.status"
                (ngModelChange)="setStatus(r, $event)"
                [attr.aria-label]="'Estado de ' + r.childName"
              >
                @for (s of statuses; track s.key) {
                  <option [value]="s.key">{{ s.label }}</option>
                }
              </select>
            </div>
            <p class="contact">
              <sfc-icon name="user" size="16" />{{ r.guardianName }} ·
              <a [href]="'tel:' + r.phone"><sfc-icon name="phone" size="16" />{{ r.phone }}</a> ·
              <a [href]="'mailto:' + r.email"><sfc-icon name="mail" size="16" />{{ r.email }}</a>
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
                  placeholder="Ex.: liguei a 10/10, vem experimentar terça"
                />
                <button
                  type="button"
                  class="btn btn--outline btn--sm"
                  [disabled]="drafts[r.id] === r.staffNote"
                  (click)="saveNote(r)"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  class="ic"
                  (click)="remove(r)"
                  [attr.aria-label]="'Apagar a pré-inscrição de ' + r.childName"
                  title="Apagar"
                >
                  <sfc-icon name="trash" size="18" />
                </button>
              </div>
              @if (r.updatedBy) {
                <span class="caption"
                  >Atualizado por {{ r.updatedBy }} a
                  {{ r.updatedAt | date: 'dd/MM/y HH:mm' }}</span
                >
              }
            </div>
          </li>
        } @empty {
          <li class="adm-empty">{{ loading() ? 'A carregar…' : 'Sem pré-inscrições.' }}</li>
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
      max-width: 240px;
    }
    .alert {
      margin-bottom: 1rem;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.8rem;
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
export class InterestPage {
  protected readonly api = inject(ApiClient);
  protected readonly statuses = STATUS;
  protected readonly sportOptions = Object.entries(SPORT_LABEL).map(([key, label]) => ({
    key,
    label,
  }));
  protected readonly all = signal<Interest[]>([]);
  protected readonly status = signal<Status | null>('novo');
  protected readonly sport = signal('');
  protected readonly loading = signal(true);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected drafts: Record<number, string> = {};
  protected readonly rows = computed(() =>
    this.all().filter(
      (r) =>
        (!this.status() || r.status === this.status()) &&
        (!this.sport() || r.sport === this.sport()),
    ),
  );

  constructor() {
    if (this.api.enabled) this.load();
  }

  protected count(s: Status) {
    return this.all().filter((r) => r.status === s && (!this.sport() || r.sport === this.sport()))
      .length;
  }

  protected sportLabel(s: string) {
    return SPORT_LABEL[s] ?? s;
  }

  protected age(birth: string) {
    const b = new Date(birth + 'T00:00:00');
    const t = new Date();
    return (
      t.getFullYear() -
      b.getFullYear() -
      (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())
        ? 1
        : 0)
    );
  }

  async setStatus(r: Interest, status: Status) {
    await this.patch(
      r,
      { status },
      `${r.childName}: ${STATUS.find((s) => s.key === status)?.label.toLowerCase()}.`,
    );
  }

  async saveNote(r: Interest) {
    await this.patch(r, { staffNote: (this.drafts[r.id] ?? '').trim() }, 'Nota guardada.');
  }

  async remove(r: Interest) {
    if (!confirm(`Apagar a pré-inscrição de ${r.childName}? Os dados deixam de existir no site.`))
      return;
    try {
      await this.api.delete(`/admin/interest/${r.id}`);
      this.all.update((l) => l.filter((x) => x.id !== r.id));
      this.message.set({ ok: true, text: 'Pré-inscrição apagada.' });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  exportCsv() {
    const head = [
      'Data',
      'Modalidade',
      'Criança',
      'Data de nascimento',
      'Encarregado',
      'Telemóvel',
      'Email',
      'Observações',
      'Estado',
      'Nota interna',
    ];
    const lines = this.rows().map((r) => [
      r.createdAt.slice(0, 10),
      this.sportLabel(r.sport),
      r.childName,
      r.birthDate ?? '',
      r.guardianName,
      r.phone,
      r.email,
      r.notes,
      STATUS.find((s) => s.key === r.status)?.label ?? r.status,
      r.staffNote,
    ]);
    const url = URL.createObjectURL(
      new Blob([toCsv([head, ...lines])], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `pre-inscricoes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async patch(
    r: Interest,
    body: Partial<Pick<Interest, 'status' | 'staffNote'>>,
    ok: string,
  ) {
    try {
      await this.api.patch(`/admin/interest/${r.id}`, body);
      await this.load();
      this.message.set({ ok: true, text: ok });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  private async load() {
    try {
      const list = await this.api.get<Interest[]>('/admin/interest');
      this.all.set(list);
      this.drafts = Object.fromEntries(list.map((r) => [r.id, r.staffNote]));
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.loading.set(false);
    }
  }
}
