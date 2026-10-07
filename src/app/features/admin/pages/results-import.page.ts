import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource, ImportRow, ImportSummary } from '../data/admin-source';

const COLUMNS = ['athlete_code', 'athlete_name', 'birth_year', 'season', 'round', 'race', 'race_base', 'race_date', 'category', 'place', 'bib', 'time', 'time_s', 'distance_m', 'trophy_points', 'team_points', 'source_url'];

const EXAMPLE = `athlete_code,athlete_name,birth_year,season,round,race,race_base,race_date,category,place,bib,time,time_s,distance_m,trophy_points,team_points,source_url
SFC-0004,JOÃO EXEMPLO,1996,2026/2027,1,7º GP São Martinho de Almada,GP São Martinho de Almada,2026-11-08,Seniores,14,1201,0:24:55.10,1495.10,5850,1,1,https://tatletismo-almada.pt/
SFC-0003,RITA EXEMPLO,1985,2026/2027,1,7º GP São Martinho de Almada,GP São Martinho de Almada,2026-11-08,Veteranas I,3,1188,0:28:40.02,1720.02,5850,8,8,https://tatletismo-almada.pt/
,ATLETA SEM FICHA,2001,2026/2027,1,7º GP São Martinho de Almada,GP São Martinho de Almada,2026-11-08,Seniores,30,1302,0:31:02.00,1862.00,5850,1,1,https://tatletismo-almada.pt/`;

/** Importação do results.csv gerado por tools/trofeu-almada (consolidate.py --import-dir). */
@Component({
  selector: 'sfc-admin-results-import',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Importar resultados</h1>
        <p>Troféu Almada em Atletismo · ficheiro <code>results.csv</code> gerado por <code>tools/trofeu-almada</code>.</p>
      </div>
    </div>

    <section class="adm-panel block">
      <h2>1. Escolher o ficheiro</h2>
      <div class="pick">
        <label class="btn btn--primary btn--sm file">
          <sfc-icon name="file" size="16" />Escolher CSV
          <input type="file" accept=".csv,text/csv" (change)="onFile($event)" aria-label="Ficheiro CSV de resultados" />
        </label>
        <button type="button" class="btn btn--outline btn--sm" (click)="parse(example, 'exemplo.csv')">Usar exemplo (fictício)</button>
        @if (fileName()) {
          <span class="caption">{{ fileName() }}</span>
        }
      </div>
      @if (parseError()) {
        <p class="alert alert--warning" role="alert">{{ parseError() }}</p>
      }
    </section>

    @if (rows().length) {
      <section class="adm-panel block">
        <h2>2. Verificar</h2>
        <ul class="facts">
          <li><strong>{{ rows().length }}</strong> resultados</li>
          <li><strong>{{ races() }}</strong> provas</li>
          <li><strong>{{ linked() }}</strong> associados a atletas (código SFC)</li>
          <li [class.warn]="rows().length - linked() > 0"><strong>{{ rows().length - linked() }}</strong> sem atleta na base de dados</li>
        </ul>
        <div class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr><th scope="col">Atleta</th><th scope="col">Prova</th><th scope="col">Escalão</th><th scope="col" class="num">Class.</th><th scope="col" class="num">Tempo</th></tr>
            </thead>
            <tbody>
              @for (r of rows().slice(0, 15); track $index) {
                <tr>
                  <td>{{ r.athleteName }} <span class="caption">{{ r.athleteCode ?? 'sem código' }}</span></td>
                  <td>{{ r.race }} <span class="caption">{{ r.raceDate }}</span></td>
                  <td>{{ r.category }}</td>
                  <td class="num">{{ r.place ?? '—' }}</td>
                  <td class="num">{{ r.time ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (rows().length > 15) {
          <p class="caption">… e mais {{ rows().length - 15 }} linhas.</p>
        }
      </section>

      <section class="adm-panel block">
        <h2>3. Importar</h2>
        <p class="caption">A importação é idempotente: voltar a importar o mesmo ficheiro atualiza os resultados existentes sem duplicar.</p>
        <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="import()"><sfc-icon name="download" size="18" />Importar {{ rows().length }} resultados</button>
        @if (summary(); as s) {
          <p class="alert alert--success" role="status">
            Importação concluída: {{ s.inserted }} novos, {{ s.updated }} atualizados, {{ s.linked }} associados a atletas, {{ s.races }} provas.
          </p>
        }
        @if (error()) {
          <p class="alert alert--warning" role="alert">{{ error() }}</p>
        }
      </section>
    }
  `,
  styles: `
    .block {
      margin-bottom: 1rem;
    }
    .pick {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
    }
    .file {
      position: relative;
      cursor: pointer;
      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      &:focus-within {
        outline: 3px solid var(--sfc-yellow);
        outline-offset: 2px;
      }
    }
    .facts {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.4rem;
      margin: 0 0 1rem;
      padding: 0;
      .warn {
        color: #6b4e00;
      }
    }
    .alert {
      margin-top: 0.8rem;
    }
    td .caption {
      display: block;
    }
  `,
})
export class ResultsImportPage {
  private readonly source = inject(AdminSource);
  protected readonly example = EXAMPLE;
  protected readonly rows = signal<ImportRow[]>([]);
  protected readonly fileName = signal('');
  protected readonly parseError = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly summary = signal<ImportSummary | null>(null);
  protected readonly linked = computed(() => this.rows().filter((r) => r.athleteCode).length);
  protected readonly races = computed(() => new Set(this.rows().map((r) => `${r.season}#${r.round}`)).size);

  async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.parseError.set('Ficheiro demasiado grande (máximo 5 MB).');
      return;
    }
    this.parse(await file.text(), file.name);
  }

  parse(text: string, name: string) {
    this.summary.set(null);
    this.error.set('');
    this.fileName.set(name);
    try {
      const table = parseCsv(text.replace(/^﻿/, ''));
      const head = table[0]?.map((h) => h.trim()) ?? [];
      const missing = ['athlete_name', 'season', 'round', 'race', 'race_base', 'race_date', 'category'].filter((c) => !head.includes(c));
      if (missing.length) throw new Error(`Colunas em falta: ${missing.join(', ')}. Usa o results.csv gerado por tools/trofeu-almada.`);
      const idx = Object.fromEntries(COLUMNS.map((c) => [c, head.indexOf(c)]));
      const val = (r: string[], c: string) => (idx[c] >= 0 ? (r[idx[c]] ?? '').trim() : '');
      const num = (r: string[], c: string) => (val(r, c) === '' ? null : Number(val(r, c)));
      const rows = table.slice(1).map<ImportRow>((r) => ({
        athleteCode: val(r, 'athlete_code') || null,
        athleteName: val(r, 'athlete_name'),
        birthYear: num(r, 'birth_year'),
        season: val(r, 'season'),
        round: Number(val(r, 'round')),
        race: val(r, 'race'),
        raceBase: val(r, 'race_base'),
        raceDate: val(r, 'race_date'),
        category: val(r, 'category'),
        place: num(r, 'place'),
        bib: val(r, 'bib') || null,
        time: val(r, 'time') || null,
        timeS: num(r, 'time_s'),
        distanceM: num(r, 'distance_m'),
        trophyPoints: num(r, 'trophy_points'),
        teamPoints: num(r, 'team_points'),
        sourceUrl: val(r, 'source_url') || null,
      }));
      const bad = rows.findIndex((r) => !r.athleteName || !/^\d{4}\/\d{4}$/.test(r.season) || !r.round || !/^\d{4}-\d{2}-\d{2}$/.test(r.raceDate));
      if (bad >= 0) throw new Error(`Linha ${bad + 2} inválida (nome, época AAAA/AAAA, n.º de prova ou data AAAA-MM-DD).`);
      if (!rows.length) throw new Error('O ficheiro não tem resultados.');
      this.rows.set(rows);
      this.parseError.set('');
    } catch (e) {
      this.rows.set([]);
      this.parseError.set((e as Error).message);
    }
  }

  async import() {
    this.busy.set(true);
    try {
      this.summary.set(await this.source.importResults(this.rows()));
      this.error.set('');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

/** CSV com aspas («"»), separador vírgula. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) out.push(row);
  return out;
}
