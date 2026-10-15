import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiClient } from '../../../core/api/api-client';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

type Period = '7d' | '30d' | '90d' | '12m';
interface Summary {
  pageviews: number;
  visitors: number;
  visits: number;
  bounceRate: number;
  avgSeconds: number;
}
interface Row {
  label: string;
  value: number;
}
interface Visits {
  configured: boolean;
  period: Period;
  unit: 'day' | 'month';
  from: string;
  summary: Summary;
  previous: Summary;
  activeNow: number;
  series: { date: string; pageviews: number; visitors: number }[];
  pages: Row[];
  referrers: Row[];
  devices: Row[];
  browsers: Row[];
  os: Row[];
  countries: Row[];
}

const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: '12m', label: '12 meses' },
];
const DEVICES: Record<string, string> = {
  desktop: 'Computador',
  laptop: 'Portátil',
  mobile: 'Telemóvel',
  tablet: 'Tablet',
};
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COUNTRY =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['pt-PT'], { type: 'region' })
    : null;

// Gráfico (SVG, desenhado à largura real do ecrã, para o texto não encolher no telemóvel)
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };

/** Visitas ao site (Umami, sem cookies), visíveis só aqui: o painel do Umami não está acessível na internet. */
@Component({
  selector: 'sfc-admin-visits',
  imports: [DecimalPipe, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Estatísticas</h1>
        <p>
          Visitas às páginas públicas do site, contadas sem cookies e sem guardar o endereço IP. As
          áreas reservadas não contam.
        </p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="As estatísticas são recolhidas no servidor (VPS)."
      />
    } @else {
      <div class="chips" role="group" aria-label="Período">
        @for (p of periods; track p.id) {
          <button
            type="button"
            class="chip"
            [attr.aria-pressed]="period() === p.id"
            (click)="load(p.id)"
          >
            {{ p.label }}
          </button>
        }
      </div>

      @if (error(); as e) {
        <p class="alert alert--warning" role="alert">{{ e }}</p>
      }

      @if (data(); as d) {
        @if (!d.configured) {
          <p class="adm-panel">
            As estatísticas ainda não estão instaladas no servidor. No GitHub:
            <strong>Actions → Estatísticas (Umami) → Run workflow</strong> (depois de voltar a
            correr o <code>bootstrap.sh</code>).
          </p>
        } @else {
          <div class="kpis" [class.loading]="loading()">
            @for (k of kpis(); track k.label) {
              <div class="kpi adm-panel">
                <span class="kpi__label">{{ k.label }}</span>
                <span class="kpi__value">{{ k.value }}</span>
                @if (k.delta !== null) {
                  <span
                    class="kpi__delta"
                    [class.up]="k.good === true"
                    [class.down]="k.good === false"
                  >
                    <span aria-hidden="true">{{
                      k.delta > 0 ? '▲' : k.delta < 0 ? '▼' : '='
                    }}</span>
                    {{ k.delta > 0 ? '+' : '' }}{{ k.delta }}%
                    <span class="muted">vs. período anterior</span>
                  </span>
                }
              </div>
            }
            <div class="kpi adm-panel">
              <span class="kpi__label">Agora no site</span>
              <span class="kpi__value">{{ d.activeNow }}</span>
              <span class="kpi__delta muted">últimos 5 minutos</span>
            </div>
          </div>

          <section class="adm-panel chart">
            <div class="chart__head">
              <h2 class="h-s">
                {{ metric() === 'visitors' ? 'Visitantes' : 'Páginas vistas' }} por
                {{ d.unit === 'month' ? 'mês' : 'dia' }}
              </h2>
              <div class="chart__tools">
                <div class="chips chips--sm" role="group" aria-label="Medida">
                  <button
                    type="button"
                    class="chip"
                    [attr.aria-pressed]="metric() === 'visitors'"
                    (click)="metric.set('visitors')"
                  >
                    Visitantes
                  </button>
                  <button
                    type="button"
                    class="chip"
                    [attr.aria-pressed]="metric() === 'pageviews'"
                    (click)="metric.set('pageviews')"
                  >
                    Páginas vistas
                  </button>
                </div>
                <button type="button" class="link-btn" (click)="asTable.set(!asTable())">
                  {{ asTable() ? 'Ver gráfico' : 'Ver tabela' }}
                </button>
              </div>
            </div>
            @if (!chart().bars.length) {
              <p class="muted">Ainda sem visitas neste período.</p>
            } @else if (asTable()) {
              <div class="adm-table-wrap">
                <table class="adm-table">
                  <thead>
                    <tr>
                      <th scope="col">{{ d.unit === 'month' ? 'Mês' : 'Dia' }}</th>
                      <th scope="col" class="num">Visitantes</th>
                      <th scope="col" class="num">Páginas vistas</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of d.series; track s.date) {
                      <tr>
                        <td>{{ label(s.date, d.unit) }}</td>
                        <td class="num">{{ s.visitors | number }}</td>
                        <td class="num">{{ s.pageviews | number }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              @let c = chart();
              <div class="chart__plot" #plot>
                <svg
                  [attr.width]="w()"
                  [attr.height]="h"
                  [attr.viewBox]="'0 0 ' + w() + ' ' + h"
                  role="img"
                  [attr.aria-label]="c.aria"
                >
                  @for (t of c.ticks; track t.v) {
                    <line
                      class="grid"
                      [attr.x1]="pad.left"
                      [attr.x2]="w() - pad.right"
                      [attr.y1]="t.y"
                      [attr.y2]="t.y"
                    />
                    <text class="tick" [attr.x]="pad.left - 6" [attr.y]="t.y + 4" text-anchor="end">
                      {{ t.label }}
                    </text>
                  }
                  @for (b of c.bars; track b.date; let i = $index) {
                    <path
                      class="bar"
                      [class.dim]="hover() !== null && hover() !== i"
                      [attr.d]="b.path"
                    />
                    @if (b.showLabel) {
                      <text class="tick" [attr.x]="b.cx" [attr.y]="h - 8" text-anchor="middle">
                        {{ b.short }}
                      </text>
                    }
                    <!-- Área de toque maior do que a barra -->
                    <rect
                      class="hit"
                      [attr.x]="b.slotX"
                      [attr.y]="pad.top"
                      [attr.width]="b.slotW"
                      [attr.height]="h - pad.top - pad.bottom"
                      tabindex="0"
                      [attr.aria-label]="b.long + ': ' + b.value"
                      (pointerenter)="hover.set(i)"
                      (pointerleave)="hover.set(null)"
                      (focus)="hover.set(i)"
                      (blur)="hover.set(null)"
                    />
                  }
                </svg>
                @if (hover() !== null) {
                  @let b = c.bars[hover()!];
                  <div class="tip" [style.left.px]="tipLeft(b.cx)" role="status">
                    <strong>{{ b.long }}</strong>
                    <span>{{ b.visitors | number }} visitantes</span>
                    <span>{{ b.pageviews | number }} páginas vistas</span>
                  </div>
                }
              </div>
            }
          </section>

          <div class="lists">
            @for (l of lists(); track l.title) {
              <section class="adm-panel list">
                <h2 class="h-s">{{ l.title }}</h2>
                @if (!l.rows.length) {
                  <p class="muted">Sem dados.</p>
                } @else {
                  <ol>
                    @for (r of l.rows; track r.label) {
                      <li>
                        <span class="list__bar" [style.width.%]="r.pct" aria-hidden="true"></span>
                        <span class="list__label" [title]="r.label">{{ r.label }}</span>
                        <span class="list__value">{{ r.value | number }}</span>
                      </li>
                    }
                  </ol>
                }
              </section>
            }
          </div>
        }
      } @else if (!error()) {
        <p class="muted">A carregar…</p>
      }
    }
  `,
  styles: `
    .chips {
      margin-bottom: 1rem;
    }
    .chips--sm {
      margin: 0;
    }
    .muted {
      color: var(--color-muted);
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
      gap: 0.8rem;
      margin-bottom: 1rem;
      &.loading {
        opacity: 0.6;
      }
    }
    .kpi {
      display: grid;
      gap: 0.2rem;
      padding: 0.9rem 1rem;
    }
    .kpi__label {
      font-size: 0.82rem;
      color: var(--color-muted);
    }
    .kpi__value {
      font: 800 1.5rem/1.1 var(--font-display);
      font-variant-numeric: tabular-nums;
    }
    .kpi__delta {
      font-size: 0.8rem;
      &.up span[aria-hidden] {
        color: #1d7a3e;
      }
      &.down span[aria-hidden] {
        color: #b3261e;
      }
    }
    .chart {
      margin-bottom: 1rem;
    }
    .chart__head {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem 1rem;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.6rem;
      h2 {
        margin: 0;
      }
    }
    .chart__tools {
      display: flex;
      gap: 0.8rem;
      align-items: center;
    }
    .chart__plot {
      position: relative;
      width: 100%;
      overflow: hidden;
      svg {
        display: block;
      }
    }
    .grid {
      stroke: #e6e8ee;
      stroke-width: 1;
    }
    .tick {
      fill: var(--color-muted);
      font-size: 11px;
    }
    .bar {
      fill: #1a5fa8;
      transition: opacity 0.1s;
      &.dim {
        opacity: 0.45;
      }
    }
    .hit {
      fill: transparent;
      outline: none;
      cursor: default;
    }
    .tip {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      display: grid;
      gap: 0.1rem;
      padding: 0.45rem 0.6rem;
      background: #fff;
      border: 1px solid #d9dde6;
      border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
      font-size: 0.8rem;
      white-space: nowrap;
      pointer-events: none;
    }
    .link-btn {
      border: 0;
      background: none;
      color: var(--color-primary, var(--sfc-blue));
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
      font-size: 0.85rem;
      padding: 0;
    }
    .lists {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
      gap: 0.8rem;
    }
    .list {
      padding: 0.9rem 1rem;
      h2 {
        margin: 0 0 0.6rem;
      }
      ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.3rem;
      }
      li {
        position: relative;
        display: flex;
        justify-content: space-between;
        gap: 0.8rem;
        padding: 0.3rem 0.5rem;
        font-size: 0.88rem;
      }
    }
    .list__bar {
      position: absolute;
      inset: 0 auto 0 0;
      background: rgba(26, 95, 168, 0.12);
      border-radius: 0 4px 4px 0;
    }
    .list__label {
      position: relative;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .list__value {
      position: relative;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
  `,
})
export class VisitsPage {
  protected readonly api = inject(ApiClient);
  protected readonly periods = PERIODS;
  protected readonly w = signal(720);
  private readonly plot = viewChild<ElementRef<HTMLElement>>('plot');
  private readonly destroy = inject(DestroyRef);
  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly period = signal<Period>('30d');
  protected readonly data = signal<Visits | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly metric = signal<'visitors' | 'pageviews'>('visitors');
  protected readonly asTable = signal(false);
  protected readonly hover = signal<number | null>(null);

  constructor() {
    if (this.api.enabled) void this.load('30d');
    // Mede o contentor do gráfico sempre que aparece ou muda de tamanho
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0 && width !== this.w()) this.w.set(Math.max(280, width));
    });
    let observed: HTMLElement | undefined;
    effect(() => {
      const el = this.plot()?.nativeElement;
      if (el === observed) return;
      if (observed) ro.unobserve(observed);
      observed = el;
      if (el) ro.observe(el);
    });
    this.destroy.onDestroy(() => ro.disconnect());
  }

  /** A dica fica dentro do gráfico, mesmo junto às margens. */
  protected tipLeft(cx: number) {
    return Math.min(Math.max(cx, 80), this.w() - 80);
  }

  async load(p: Period) {
    this.period.set(p);
    this.loading.set(true);
    this.error.set(null);
    this.hover.set(null);
    try {
      this.data.set(await this.api.get<Visits>('/admin/visits', { period: p }));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly kpis = computed(() => {
    const d = this.data();
    if (!d?.configured) return [];
    const s = d.summary;
    const p = d.previous;
    const delta = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
    return [
      {
        label: 'Visitantes',
        value: fmt(s.visitors),
        delta: delta(s.visitors, p.visitors),
        good: sign(delta(s.visitors, p.visitors)),
      },
      {
        label: 'Visitas',
        value: fmt(s.visits),
        delta: delta(s.visits, p.visits),
        good: sign(delta(s.visits, p.visits)),
      },
      {
        label: 'Páginas vistas',
        value: fmt(s.pageviews),
        delta: delta(s.pageviews, p.pageviews),
        good: sign(delta(s.pageviews, p.pageviews)),
      },
      // Rejeição: descer é bom
      {
        label: 'Rejeição',
        value: `${s.bounceRate}%`,
        delta: delta(s.bounceRate, p.bounceRate),
        good: invert(sign(delta(s.bounceRate, p.bounceRate))),
      },
      {
        label: 'Tempo médio por visita',
        value: duration(s.avgSeconds),
        delta: delta(s.avgSeconds, p.avgSeconds),
        good: sign(delta(s.avgSeconds, p.avgSeconds)),
      },
    ];
  });

  protected readonly chart = computed(() => {
    const d = this.data();
    const key = this.metric();
    const series = d?.configured ? d.series : [];
    const max = Math.max(1, ...series.map((s) => s[key]));
    const top = niceMax(max);
    const W = this.w();
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const slot = series.length ? plotW / series.length : plotW;
    const barW = Math.max(2, Math.min(24, slot - 2)); // até 24 px, com 2 px de intervalo
    const every = Math.ceil(series.length / Math.max(2, Math.floor(plotW / 70)));
    const unit = d?.unit ?? 'day';
    const bars = series.map((s, i) => {
      const v = s[key];
      const bh = (v / top) * plotH;
      const x = PAD.left + i * slot + (slot - barW) / 2;
      const y = H - PAD.bottom - bh;
      return {
        date: s.date,
        value: v,
        visitors: s.visitors,
        pageviews: s.pageviews,
        path: roundedTop(x, y, barW, bh, Math.min(4, barW / 2)),
        cx: x + barW / 2,
        slotX: PAD.left + i * slot,
        slotW: slot,
        short: short(s.date, unit),
        long: this.label(s.date, unit),
        showLabel: i % every === 0,
      };
    });
    // Marcas do eixo em números inteiros (sem «1, 1, 0» quando há poucas visitas)
    const ticks = [...new Set([0, top / 2, top].filter((v) => Number.isInteger(v)))].map((v) => ({
      v,
      y: H - PAD.bottom - (v / top) * plotH,
      label: compact(v),
    }));
    const total = series.reduce((a, s) => a + s[key], 0);
    const aria = `${key === 'visitors' ? 'Visitantes' : 'Páginas vistas'}: ${total} no período, máximo ${max}`;
    return { bars, ticks, aria };
  });

  protected readonly lists = computed(() => {
    const d = this.data();
    if (!d?.configured) return [];
    const make = (title: string, rows: Row[], fmtLabel: (s: string) => string = (s) => s) => {
      const max = Math.max(1, ...rows.map((r) => r.value));
      return {
        title,
        rows: rows.map((r) => ({
          label: fmtLabel(r.label) || '(desconhecido)',
          value: r.value,
          pct: (r.value / max) * 100,
        })),
      };
    };
    return [
      make('Páginas mais vistas', d.pages),
      make('De onde vêm', d.referrers, (s) => s || 'Acesso direto'),
      make('Dispositivos', d.devices, (s) => DEVICES[s] ?? s),
      make('Navegadores', d.browsers, cap),
      make('Sistemas', d.os),
      make('Países', d.countries, (s) => (COUNTRY && s ? (COUNTRY.of(s) ?? s) : s)),
    ];
  });

  protected label(date: string, unit: 'day' | 'month') {
    const [y, m, dd] = date.split('-').map(Number);
    return unit === 'month' ? `${MONTHS[m - 1]} ${y}` : `${dd} ${MONTHS[m - 1]} ${y}`;
  }
}

function short(date: string, unit: 'day' | 'month') {
  const [, m, d] = date.split('-').map(Number);
  return unit === 'month' ? MONTHS[m - 1] : `${d}/${m}`;
}
function fmt(n: number) {
  return n.toLocaleString('pt-PT');
}
function compact(n: number) {
  return n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace('.', ',') : String(Math.round(n));
}
function niceMax(n: number) {
  const p = 10 ** Math.floor(Math.log10(n));
  const f = n / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
function duration(s: number) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
}
function sign(d: number | null) {
  return d === null || d === 0 ? null : d > 0;
}
function invert(v: boolean | null) {
  return v === null ? null : !v;
}
function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
/** Coluna com o topo arredondado (4 px) e a base reta, a crescer da linha de base. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
