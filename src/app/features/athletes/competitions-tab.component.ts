import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AthleteAreaService, formatClock, paceSecPerKm, timeToSeconds } from '../../core/services/athlete-area.service';
import { Athlete } from '../../core/data/athletes-data';
import { IconComponent } from '../../shared/icon.component';

/** «2025/2026» → «25/26» */
const shortSeason = (s: string) => `${s.slice(2, 4)}/${s.slice(7, 9)}`;

/** Separador «Competições»: resultados no Troféu Almada em Atletismo e evolução entre épocas. */
@Component({
  selector: 'sfc-competitions-tab',
  imports: [DatePipe, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './competitions-tab.component.html',
  styleUrl: './competitions-tab.component.scss',
})
export class CompetitionsTabComponent {
  readonly athlete = input.required<Athlete>();

  private readonly area = inject(AthleteAreaService);
  protected readonly short = shortSeason;
  protected readonly clock = formatClock;

  protected readonly all = computed(() => this.area.results(this.athlete().id));
  protected readonly seasons = computed(() => [...new Set(this.all().map((r) => r.season))].sort().reverse());
  /** '' = todas as épocas */
  protected readonly season = linkedSignal<string>(() => this.seasons()[0] ?? '');

  protected readonly results = computed(() => this.all().filter((r) => !this.season() || r.season === this.season()));
  protected readonly evolution = computed(() => this.area.raceEvolution(this.athlete().id));

  protected readonly kpis = computed(() => {
    const list = this.results();
    const placed = list.filter((r) => r.place !== null);
    const best = placed.length ? placed.reduce((a, b) => (b.place! < a.place! || (b.place === a.place && b.date > a.date) ? b : a)) : null;
    return {
      races: list.length,
      podiums: placed.filter((r) => r.place! <= 3).length,
      best,
      points: list.reduce((acc, r) => acc + (r.trophyPoints ?? 0), 0),
    };
  });

  protected pace(time: string, distanceM: number | null) {
    const p = paceSecPerKm(timeToSeconds(time), distanceM);
    return p === null ? '—' : `${formatClock(p)}/km`;
  }

  protected km(distanceM: number | null) {
    if (!distanceM) return '—';
    return distanceM < 1000 || distanceM === 1609 ? `${distanceM} m` : `${(distanceM / 1000).toLocaleString('pt-PT')} km`;
  }

  /** −72 → «−1:12» ; 4.2 → «+0:04» */
  protected signedClock(seconds: number) {
    return `${seconds < 0 ? '−' : '+'}${formatClock(Math.abs(seconds))}`;
  }

  /** «Exportar»: CSV com os resultados visíveis (separador ; para o Excel em PT). */
  exportCsv() {
    const a = this.athlete();
    const head = ['Época', 'Data', 'Prova', 'Escalão', 'Classificação', 'Tempo', 'Distância (m)', 'Ritmo (min/km)', 'Pontos troféu'];
    const rows = this.results().map((r) => [
      r.season,
      r.date,
      r.race,
      r.category,
      r.place ?? '',
      r.time,
      r.distanceM ?? '',
      this.pace(r.time, r.distanceM).replace('/km', ''),
      r.trophyPoints ?? '',
    ]);
    const csv = '﻿' + [head, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `competicoes-${a.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}${this.season() ? '-' + this.season().replace('/', '-') : ''}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
