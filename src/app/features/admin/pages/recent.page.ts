import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../../core/api/api-client';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

type EntryType = 'proposta-atleta' | 'proposta-socio' | 'pre-inscricao' | 'atleta' | 'evento' | 'conta';

interface Entry {
  type: EntryType;
  id: string;
  at: string;
  name: string;
  email: string;
  detail: string;
  status: string;
  /** Precisa que alguém da equipa faça alguma coisa */
  attention: boolean;
  link: string;
}

const TYPES: { key: EntryType; label: string }[] = [
  { key: 'proposta-atleta', label: 'Inscrições de atleta' },
  { key: 'proposta-socio', label: 'Propostas de sócio' },
  { key: 'pre-inscricao', label: 'Pré-inscrições' },
  { key: 'atleta', label: 'Fichas de atleta' },
  { key: 'evento', label: 'Inscrições em eventos' },
  { key: 'conta', label: 'Contas no site' },
];
const DAYS = [7, 30, 90];

/** Tudo o que chegou pelo site nos últimos dias, numa só lista: para encontrar quem se inscreveu, esteja onde estiver. */
@Component({
  selector: 'sfc-admin-recent',
  imports: [DatePipe, RouterLink, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Novas entradas</h1>
        <p>
          Tudo o que chegou pelo site, do mais recente para o mais antigo: inscrições de atleta e
          propostas de sócio (também as que ainda esperam pela confirmação do email), pré-inscrições,
          fichas de atleta novas, inscrições em eventos e contas criadas no site.
        </p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="As novas entradas funcionam com o site ligado à API (VPS)." />
    } @else {
      <div class="adm-toolbar">
        <label class="visually-hidden" for="rec-q">Pesquisar</label>
        <input id="rec-q" class="adm-search" type="search" placeholder="Nome ou email…" [value]="q()" (input)="q.set($any($event.target).value)" />
        <div class="chips" role="group" aria-label="Período">
          @for (d of dayOptions; track d) {
            <button type="button" class="chip" [attr.aria-pressed]="days() === d" (click)="days.set(d)">{{ d }} dias</button>
          }
        </div>
      </div>
      <div class="chips types" role="group" aria-label="Tipo">
        <button type="button" class="chip" [attr.aria-pressed]="!type() && !onlyAttention()" (click)="type.set(null); onlyAttention.set(false)">
          Todas ({{ all().length }})
        </button>
        <button type="button" class="chip" [attr.aria-pressed]="onlyAttention()" (click)="onlyAttention.set(!onlyAttention()); type.set(null)">
          Por tratar ({{ attentionCount() }})
        </button>
        @for (t of types; track t.key) {
          @if (count(t.key)) {
            <button type="button" class="chip" [attr.aria-pressed]="type() === t.key" (click)="type.set(t.key); onlyAttention.set(false)">
              {{ t.label }} ({{ count(t.key) }})
            </button>
          }
        }
      </div>

      @if (error(); as e) {
        <p class="alert alert--warning" role="alert">{{ e }}</p>
      }

      <div class="adm-table-wrap">
        <table class="adm-table">
          <caption class="visually-hidden">Novas entradas</caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Quem</th>
              <th scope="col" class="hide-sm">O quê</th>
              <th scope="col">Estado</th>
              <th scope="col" class="act"><span class="visually-hidden">Abrir</span></th>
            </tr>
          </thead>
          <tbody>
            @for (e of rows(); track e.type + e.id) {
              <tr>
                <td class="nowrap">{{ e.at | date: 'dd/MM/y HH:mm' }}</td>
                <td>
                  <strong>{{ e.name }}</strong>
                  @if (e.email) {
                    <a class="caption sub" [href]="'mailto:' + e.email">{{ e.email }}</a>
                  }
                  <span class="caption sub show-sm">{{ e.detail }}</span>
                </td>
                <td class="hide-sm">{{ e.detail }}</td>
                <td>
                  <span class="st" [class.st--warn]="e.attention" [class.st--ok]="!e.attention">{{ e.status }}</span>
                </td>
                <td class="act">
                  <a class="btn btn--outline btn--sm" [routerLink]="path(e.link)" [queryParams]="query(e.link)">Abrir<sfc-icon name="arrow" size="16" /></a>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="adm-empty">{{ loading() ? 'A carregar…' : 'Nada de novo neste período.' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="caption tip">
        Uma inscrição de atleta só passa para a lista de Atletas depois de a pessoa confirmar o email e de
        a secretaria a aceitar em Propostas. Enquanto isso, aparece aqui como «À espera do email» ou
        «Por decidir».
      </p>
    }
  `,
  styles: `
    .types {
      margin: 0 0 1rem;
    }
    .sub {
      display: block;
      overflow-wrap: anywhere;
    }
    .nowrap {
      white-space: nowrap;
    }
    .tip {
      margin-top: 1rem;
    }
    .act a {
      display: inline-flex;
      gap: 0.3rem;
      align-items: center;
    }
    .show-sm {
      display: none;
    }
    @media (max-width: 640px) {
      .hide-sm {
        display: none;
      }
      .show-sm {
        display: block;
      }
    }
  `,
})
export class RecentPage {
  protected readonly api = inject(ApiClient);
  protected readonly types = TYPES;
  protected readonly dayOptions = DAYS;
  protected readonly days = signal(30);
  protected readonly type = signal<EntryType | null>(null);
  protected readonly onlyAttention = signal(false);
  protected readonly q = signal('');
  protected readonly all = signal<Entry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly attentionCount = computed(() => this.all().filter((e) => e.attention).length);
  protected readonly rows = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.all().filter(
      (e) =>
        (!this.type() || e.type === this.type()) &&
        (!this.onlyAttention() || e.attention) &&
        (!q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)),
    );
  });

  constructor() {
    effect(() => {
      const days = this.days();
      if (this.api.enabled) void this.load(days);
    });
  }

  protected count(t: EntryType) {
    return this.all().filter((e) => e.type === t).length;
  }

  protected path(link: string) {
    return link.split('?')[0];
  }

  protected query(link: string) {
    const qs = link.split('?')[1];
    return qs ? Object.fromEntries(new URLSearchParams(qs)) : null;
  }

  private async load(days: number) {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.all.set(await this.api.get<Entry[]>('/admin/recent-entries', { days }));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
