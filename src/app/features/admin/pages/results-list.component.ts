import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { AuthService } from '../../../core/services/auth.service';
import { DialogComponent } from '../../../shared/dialog.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

interface ResultRow {
  id: number;
  athleteName: string;
  birthYear: number | null;
  category: string;
  place: number | null;
  time: string | null;
  trophyPoints: number | null;
  raceId: number;
  season: string;
  round: number;
  race: string;
  raceDate: string;
  athleteId: string | null;
  athleteCode: string | null;
  linkedName: string | null;
}

interface ResultsPage {
  items: ResultRow[];
  total: number;
  linked: number;
  seasons: string[];
  races: { id: number; season: string; round: number; name: string; raceDate: string }[];
  categories: string[];
}

interface AthleteHit {
  id: string;
  code: string;
  name: string;
  birthDate: string | null;
}

/** Resultados já carregados do Troféu, com filtros; os que não ficaram ligados a um atleta ligam-se à mão. */
@Component({
  selector: 'sfc-admin-results-list',
  imports: [DatePipe, FormsModule, DialogComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="Os resultados carregados estão na base de dados do servidor (VPS)." />
    } @else {
      <form class="filters adm-panel" (submit)="$event.preventDefault(); reload()">
        <label>Época
          <select name="season" [(ngModel)]="f.season" (ngModelChange)="f.race = ''; reload()">
            <option value="">Todas</option>
            @for (s of page()?.seasons ?? []; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </label>
        <label>Prova
          <select name="race" [(ngModel)]="f.race" (ngModelChange)="reload()">
            <option value="">Todas</option>
            @for (r of racesFor(); track r.id) {
              <option [value]="r.id">{{ r.raceDate | date: 'dd/MM/y' }} · {{ r.name }}</option>
            }
          </select>
        </label>
        <label>Escalão
          <select name="cat" [(ngModel)]="f.category" (ngModelChange)="reload()">
            <option value="">Todos</option>
            @for (c of page()?.categories ?? []; track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select>
        </label>
        <label>Atleta
          <select name="linked" [(ngModel)]="f.linked" (ngModelChange)="reload()">
            <option value="">Todos</option>
            <option value="yes">Ligados a um atleta</option>
            <option value="no">Sem atleta</option>
          </select>
        </label>
        <label class="grow">Nome ou código
          <input name="q" [(ngModel)]="f.q" placeholder="ex.: Pereira ou SFC-0012" maxlength="80" />
        </label>
        <button type="submit" class="btn btn--outline btn--sm">Filtrar</button>
      </form>

      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status">{{ m.text }}</p>
      }

      @if (page(); as p) {
        <p class="caption count">
          {{ p.total }} resultado(s) · {{ p.linked }} ligado(s) a atletas · {{ p.total - p.linked }} sem atleta
          {{ p.items.length < p.total ? '· a mostrar os primeiros ' + p.items.length : '' }}
        </p>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th scope="col">Prova</th>
                <th scope="col">Nome no resultado</th>
                <th scope="col" class="hide-sm">Escalão</th>
                <th scope="col" class="num">Lugar</th>
                <th scope="col" class="hide-sm">Tempo</th>
                <th scope="col">Atleta do clube</th>
              </tr>
            </thead>
            <tbody>
              @for (r of p.items; track r.id) {
                <tr>
                  <td class="nowrap">{{ r.raceDate | date: 'dd/MM/y' }}<span class="caption sub">{{ r.race }}</span></td>
                  <td>{{ r.athleteName }}<span class="caption sub">{{ r.birthYear ?? '—' }}</span></td>
                  <td class="hide-sm">{{ r.category }}</td>
                  <td class="num">{{ r.place ?? '—' }}</td>
                  <td class="hide-sm">{{ r.time ?? '—' }}</td>
                  <td>
                    @if (r.athleteId) {
                      <span>{{ r.linkedName }}</span><span class="caption sub">{{ r.athleteCode }}</span>
                    } @else {
                      <span class="st st--warn">Sem atleta</span>
                    }
                    @if (canLink()) {
                      <button type="button" class="link-btn" (click)="openLink(r)">{{ r.athleteId ? 'Alterar' : 'Ligar' }}</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="adm-empty">{{ loading() ? 'A carregar…' : 'Sem resultados com estes filtros.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="caption">A carregar…</p>
      }

      <sfc-dialog [heading]="'Ligar ' + (target()?.athleteName ?? '')" [open]="!!target()" (closed)="target.set(null)">
        @if (target(); as t) {
          <p class="caption">
            Liga todos os resultados de <strong>{{ t.athleteName }}</strong> (nascido em {{ t.birthYear ?? '?' }}) à ficha de um atleta do clube.
          </p>
          <form class="search" (submit)="$event.preventDefault(); search()">
            <input name="aq" [(ngModel)]="aq" placeholder="Nome ou código do atleta" maxlength="80" aria-label="Procurar atleta" />
            <button type="submit" class="btn btn--outline btn--sm">Procurar</button>
          </form>
          <ul class="hits">
            @for (a of hits(); track a.id) {
              <li>
                <span>{{ a.name }} <span class="caption">{{ a.code }}{{ a.birthDate ? ' · ' + (a.birthDate | date: 'y') : '' }}</span></span>
                <button type="button" class="btn btn--primary btn--sm" [disabled]="busy()" (click)="link(t, a.id)">Ligar</button>
              </li>
            } @empty {
              <li class="caption">Procura pelo nome ou código.</li>
            }
          </ul>
          @if (t.athleteId) {
            <button type="button" class="btn btn--outline btn--sm" [disabled]="busy()" (click)="link(t, null)">Desligar do atleta atual</button>
          }
        }
      </sfc-dialog>
    }
  `,
  styles: `
    .sub {
      display: block;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 0.8rem;
      align-items: flex-end;
      margin-bottom: 1rem;
      label {
        display: grid;
        gap: 0.2rem;
        font-size: 0.82rem;
        color: var(--color-muted);
      }
      .grow {
        flex: 1;
        min-width: 180px;
      }
      select,
      input {
        font: inherit;
        color: var(--color-text);
        padding: 0.4rem 0.6rem;
        border: 1.5px solid #c9cfdb;
        border-radius: var(--radius-s);
        background: #fff;
        max-width: 260px;
      }
      .grow input {
        max-width: none;
        width: 100%;
      }
    }
    .count {
      margin: 0 0 0.5rem;
    }
    .link-btn {
      border: 0;
      background: none;
      color: var(--color-primary);
      text-decoration: underline;
      cursor: pointer;
      padding: 0 0 0 0.4rem;
      font: inherit;
      font-size: 0.85rem;
    }
    .search {
      display: flex;
      gap: 0.5rem;
      margin: 0.6rem 0;
      input {
        flex: 1;
        font: inherit;
        padding: 0.4rem 0.6rem;
      }
    }
    .hits {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0;
      li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.6rem;
        padding: 0.35rem 0;
        border-bottom: 1px solid var(--color-border, #e3e6ee);
      }
    }
  `,
})
export class ResultsListComponent {
  protected readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  protected readonly page = signal<ResultsPage | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly target = signal<ResultRow | null>(null);
  protected readonly hits = signal<AthleteHit[]>([]);
  protected f = { season: '', race: '', category: '', linked: '', q: '' };
  protected aq = '';
  protected readonly canLink = () => this.auth.can('results.import');

  constructor() {
    effect(() => {
      if (this.api.enabled) void this.reload();
    });
  }

  protected racesFor() {
    return (this.page()?.races ?? []).filter((r) => !this.f.season || r.season === this.f.season);
  }

  async reload() {
    this.loading.set(true);
    try {
      const q = Object.fromEntries(Object.entries(this.f).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v).trim()]));
      this.page.set(await this.api.get<ResultsPage>('/admin/results', q));
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.loading.set(false);
    }
  }

  openLink(r: ResultRow) {
    this.aq = r.athleteName
      .toLowerCase()
      .split(/\s+/)
      .slice(-1)[0];
    this.hits.set([]);
    this.target.set(r);
    void this.search();
  }

  async search() {
    const q = this.aq.trim();
    if (q.length < 2) return;
    const list = await this.api.get<AthleteHit[]>('/admin/athletes', { q }).catch(() => []);
    const year = this.target()?.birthYear;
    // Primeiro os nascidos no mesmo ano do resultado
    this.hits.set([...list].sort((a, b) => Number(b.birthDate?.startsWith(String(year))) - Number(a.birthDate?.startsWith(String(year)))).slice(0, 20));
  }

  async link(r: ResultRow, athleteId: string | null) {
    this.busy.set(true);
    try {
      const out = await this.api.post<{ updated: number }>('/admin/results/link', { athleteName: r.athleteName, birthYear: r.birthYear, athleteId });
      this.target.set(null);
      this.message.set({ ok: true, text: `${r.athleteName}: ${out.updated} resultado(s) ${athleteId ? 'ligado(s)' : 'desligado(s)'}.` });
      await this.reload();
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }
}
