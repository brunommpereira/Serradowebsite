import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { Metric } from '../../core/data/athletes-data';

/**
 * Atleta vs média (anónima) do escalão, escala 0–100.
 *
 * Forma (skill dataviz): "ênfase" — o atleta é a série que importa (azul,
 * #1D62AD, validado: banda de luminosidade e contraste ≥ 3:1), a média é
 * contexto (cinzento). Barras horizontais agrupadas porque os rótulos são
 * longos; legenda sempre visível; valor do atleta na ponta da barra;
 * tooltip em hover E foco; vista de tabela como alternativa (sem radar).
 */
@Component({
  selector: 'sfc-comparison-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="viz">
      <div class="viz__top">
        <ul class="legend" aria-label="Legenda">
          <li><span class="key key--athlete"></span>{{ athleteName() }}</li>
          <li><span class="key key--avg"></span>Média {{ level() }}</li>
        </ul>
        <div class="views" role="group" aria-label="Vista do gráfico">
          <button type="button" class="chip" [attr.aria-pressed]="view() === 'barras'" (click)="view.set('barras')">Barras</button>
          <button type="button" class="chip" [attr.aria-pressed]="view() === 'tabela'" (click)="view.set('tabela')">Tabela</button>
        </div>
      </div>

      @if (view() === 'barras') {
        <div class="chart" role="list" [attr.aria-label]="'Comparação de ' + athleteName() + ' com a média ' + level() + ', escala de 0 a 100'">
          <div class="grid" aria-hidden="true">
            @for (t of ticks; track t) {
              <span class="grid__line" [style.left.%]="t"><span class="grid__tick">{{ t }}</span></span>
            }
          </div>
          @for (m of metrics(); track m.label; let i = $index) {
            <div
              class="row"
              role="listitem"
              tabindex="0"
              [attr.aria-label]="m.label + ': ' + athleteName() + ' ' + m.athlete + ', média ' + m.average"
              (pointerenter)="hover.set(i)"
              (pointerleave)="hover.set(null)"
              (focus)="hover.set(i)"
              (blur)="hover.set(null)"
              [class.row--on]="hover() === i"
            >
              <span class="row__label">{{ m.label }}</span>
              <span class="row__bars">
                <span class="bar bar--athlete" [style.width.%]="m.athlete"></span>
                <span class="row__value" [style.left]="'calc(' + m.athlete + '% + 6px)'">{{ m.athlete }}</span>
                <span class="bar bar--avg" [style.width.%]="m.average"></span>
              </span>
              @if (hover() === i) {
                <span class="tip" role="presentation">
                  <span class="tip__title">{{ m.label }}</span>
                  <span class="tip__row"><i class="tk tk--athlete"></i><strong>{{ m.athlete }}</strong> {{ athleteName() }}</span>
                  <span class="tip__row"><i class="tk tk--avg"></i><strong>{{ m.average }}</strong> Média {{ level() }}</span>
                  <span class="tip__delta">{{ m.athlete - m.average > 0 ? '+' : '' }}{{ m.athlete - m.average }} vs média</span>
                </span>
              }
            </div>
          }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <caption class="visually-hidden">{{ athleteName() }} vs média {{ level() }} (0–100)</caption>
            <thead>
              <tr><th scope="col">Métrica</th><th scope="col" class="num">{{ athleteName() }}</th><th scope="col" class="num">Média {{ level() }}</th><th scope="col" class="num">Diferença</th></tr>
            </thead>
            <tbody>
              @for (m of metrics(); track m.label) {
                <tr>
                  <th scope="row">{{ m.label }}</th>
                  <td class="num">{{ m.athlete }}</td>
                  <td class="num">{{ m.average }}</td>
                  <td class="num">{{ m.athlete - m.average > 0 ? '+' : '' }}{{ m.athlete - m.average }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <p class="note">A média do escalão é anónima e agregada — nenhum outro atleta é identificado. Escala de 0 a 100 definida pela equipa técnica.</p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      --series-athlete: #1d62ad;
      --series-avg: #a3aab6;
      --grid: #e6e9ef;
    }
    .viz__top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.8rem; margin-bottom: 1rem; }
    .legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; font-size: 0.88rem; color: var(--color-text);
      li { display: inline-flex; align-items: center; gap: 0.45rem; } }
    .key { width: 14px; height: 10px; border-radius: 0 3px 3px 0; display: inline-block; }
    .key--athlete { background: var(--series-athlete); }
    .key--avg { background: var(--series-avg); }
    .views { display: flex; gap: 0.4rem; }
    .chart { position: relative; padding: 0 0 1.8rem; }
    .grid { position: absolute; top: 0; bottom: 1.6rem; left: var(--label-w); right: 2.6rem; pointer-events: none; }
    .grid__line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--grid); }
    .grid__tick { position: absolute; bottom: -1.5rem; transform: translateX(-50%); font-size: 0.75rem; color: var(--color-muted); font-variant-numeric: tabular-nums; }
    .chart { --label-w: 150px; }
    .row {
      position: relative;
      display: grid;
      grid-template-columns: var(--label-w) 1fr;
      align-items: center;
      padding: 0.55rem 0;
      outline-offset: 2px;
      border-radius: 6px;
      &:focus-visible { outline: 3px solid var(--sfc-yellow); }
    }
    .row__label { font-size: 0.9rem; font-weight: 600; padding-right: 0.8rem; }
    .row__bars { position: relative; display: grid; grid-template-columns: 1fr; row-gap: 2px; margin-right: 2.6rem; }
    .bar { display: block; height: 12px; border-radius: 0 4px 4px 0; transition: filter 0.15s; }
    .bar--athlete { background: var(--series-athlete); }
    .bar--avg { background: var(--series-avg); }
    .row__value { position: absolute; top: -2px; font: 700 0.85rem/16px var(--font-body); color: var(--color-text); font-variant-numeric: tabular-nums; }
    .row--on .bar { filter: brightness(1.12); }
    .row--on .row__label { color: var(--sfc-blue); }
    .tip {
      position: absolute; z-index: 5; right: 0; top: calc(100% - 4px);
      display: grid; gap: 0.2rem; min-width: 210px;
      background: #fff; border: 1px solid var(--color-line); border-radius: var(--radius-s);
      box-shadow: var(--shadow); padding: 0.6rem 0.8rem; font-size: 0.85rem; color: var(--color-muted);
    }
    .tip__title { font-weight: 700; color: var(--color-text); }
    .tip__row { display: flex; align-items: center; gap: 0.45rem; strong { color: var(--color-text); font-size: 1rem; font-variant-numeric: tabular-nums; } }
    .tk { width: 12px; height: 2px; display: inline-block; }
    .tk--athlete { background: var(--series-athlete); }
    .tk--avg { background: var(--series-avg); }
    .tip__delta { font-size: 0.8rem; }
    .note { font-size: 0.82rem; color: var(--color-muted); margin: 0.6rem 0 0; }
    @media (max-width: 560px) {
      .chart { --label-w: 0px; }
      .row { grid-template-columns: 1fr; row-gap: 0.3rem; }
      .grid { top: 1.6rem; }
    }
  `,
})
export class ComparisonChartComponent {
  readonly metrics = input.required<Metric[]>();
  readonly athleteName = input.required<string>();
  readonly level = input.required<string>();

  protected readonly view = signal<'barras' | 'tabela'>('barras');
  protected readonly hover = signal<number | null>(null);
  protected readonly ticks = [0, 25, 50, 75, 100];
}
