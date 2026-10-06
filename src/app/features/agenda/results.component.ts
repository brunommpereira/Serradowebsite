import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { matchOutcome } from '../../shared/cards';

/** Página agregadora de resultados e classificações (secção 21). */
@Component({
  selector: 'sfc-results',
  imports: [DatePipe, FormsModule, PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Competições" title="Resultados" subtitle="Resultados, classificações e épocas anteriores." [crumbs]="[{ label: 'Resultados' }]" />
    <section class="section">
      <div class="container">
        <form class="filters" aria-label="Filtros">
          <div class="field">
            <label for="f-sport">Modalidade</label>
            <select id="f-sport" name="sport" [ngModel]="sport()" (ngModelChange)="sport.set($event)">
              <option value="">Todas</option>
              <option value="atletismo">Atletismo</option>
              <option value="futsal">Futsal</option>
              <option value="rugby">Rugby</option>
            </select>
          </div>
          <div class="field">
            <label for="f-season">Época</label>
            <select id="f-season" name="season" [ngModel]="season()" (ngModelChange)="season.set($event)">
              @for (s of seasons; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="f-team">Equipa</label>
            <select id="f-team" name="team" [ngModel]="team()" (ngModelChange)="team.set($event)">
              <option value="">Todas</option>
              @for (t of teams(); track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="f-comp">Competição</label>
            <select id="f-comp" name="comp" [ngModel]="competition()" (ngModelChange)="competition.set($event)">
              <option value="">Todas</option>
              @for (c of competitions(); track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
          </div>
        </form>

        @for (group of grouped(); track group.slug) {
          <h2 class="sport-title"><span class="badge" [attr.data-sport]="group.slug">{{ group.name }}</span></h2>
          <ul class="results">
            @for (m of group.matches; track m.id) {
              <li>
                <span class="results__date">{{ m.date | date: 'dd/MM/yy' }}</span>
                <span class="results__comp">{{ m.team }} · {{ m.competition }}</span>
                <span class="results__line">
                  <span [class.us]="m.homeAway === 'casa'">{{ m.homeAway === 'casa' ? 'Serrado FC' : m.opponent }}</span>
                  <strong class="score" [attr.data-outcome]="outcome(m)">{{ m.scoreHome }} – {{ m.scoreAway }}</strong>
                  <span [class.us]="m.homeAway === 'fora'">{{ m.homeAway === 'fora' ? 'Serrado FC' : m.opponent }}</span>
                </span>
              </li>
            }
          </ul>
        }

        @if (showAthletics()) {
          <h2 class="sport-title"><span class="badge" data-sport="atletismo">Atletismo</span></h2>
          <ul class="results">
            @for (a of athletics(); track a.id) {
              <li>
                <span class="results__date">{{ a.date | date: 'dd/MM/yy' }}</span>
                <span class="results__comp">{{ a.event }} · {{ a.location }}</span>
                <span class="results__line results__line--text">{{ a.highlights.join(' · ') }}</span>
              </li>
            }
          </ul>
        }

        @if (!grouped().length && !showAthletics()) {
          <p class="muted center">Sem resultados para os filtros selecionados.</p>
        }

        @if (standings().length) {
          <h2 class="standings-title">Classificações</h2>
          <div class="grid grid-2">
            @for (st of standings(); track st.competition) {
              <div>
                <h3>{{ st.competition }}</h3>
                <div class="table-wrap">
                  <table class="table">
                    <thead><tr><th class="num">#</th><th>Equipa</th><th class="num">J</th><th class="num">Pts</th></tr></thead>
                    <tbody>
                      @for (r of st.rows; track r.pos) {
                        <tr [class.highlight]="r.team === 'Serrado FC'"><td class="num">{{ r.pos }}</td><td>{{ r.team }}</td><td class="num">{{ r.played }}</td><td class="num">{{ r.points }}</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 1rem; margin-bottom: 2rem; padding: 1.2rem; background: var(--color-bg-soft); border-radius: var(--radius); }
    .sport-title { margin: 2rem 0 0.8rem; .badge { font-size: 0.95rem; padding: 0.4em 0.9em; } }
    .results { list-style: none; margin: 0; padding: 0; border: 1px solid var(--color-line); border-radius: var(--radius); overflow: hidden; }
    .results li { display: grid; grid-template-columns: 90px 1fr 1.4fr; gap: 1rem; align-items: center; padding: 0.9rem 1.2rem; border-bottom: 1px solid var(--color-line); }
    .results li:last-child { border-bottom: 0; }
    .results__date { font-weight: 700; color: var(--color-muted); font-size: 0.88rem; }
    .results__comp { font-size: 0.88rem; color: var(--color-muted); }
    .results__line { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.8rem; align-items: center; font: 700 1.1rem/1.1 var(--font-display); text-transform: uppercase; span:first-child { text-align: right; } .us { color: var(--sfc-blue); } }
    .results__line--text { display: block; font: 500 0.92rem/1.4 var(--font-body); text-transform: none; }
    .score { background: var(--sfc-blue-900); color: #fff; padding: 0.3rem 0.6rem; border-radius: 6px; white-space: nowrap; &[data-outcome='V'] { background: var(--color-success); } &[data-outcome='D'] { background: var(--color-danger); } &[data-outcome='E'] { background: #5a6172; } }
    .standings-title { margin-top: 3rem; }
    @media (max-width: 720px) { .results li { grid-template-columns: 1fr; gap: 0.3rem; } .results__line span:first-child { text-align: left; } }
  `,
})
export class ResultsComponent {
  /** ?modalidade= */
  readonly modalidade = input<string>();
  private readonly content = inject(ContentService);

  private readonly matches = this.content.results();
  protected readonly seasons = [...new Set([...this.matches.map((m) => m.season), '2025/26'])].sort().reverse();

  protected readonly sport = linkedSignal(() => this.modalidade() ?? '');
  protected readonly season = signal(this.seasons[0]);
  /** Repostos sempre que a modalidade ou a época mudam */
  protected readonly team = linkedSignal({ source: () => [this.sport(), this.season()], computation: () => '' });
  protected readonly competition = linkedSignal({ source: () => [this.sport(), this.season()], computation: () => '' });

  private readonly bySportSeason = computed(() =>
    this.matches.filter((m) => (!this.sport() || m.sportSlug === this.sport()) && m.season === this.season()),
  );
  protected readonly teams = computed(() => [...new Set(this.bySportSeason().map((m) => m.team))]);
  protected readonly competitions = computed(() => [...new Set(this.bySportSeason().map((m) => m.competition))]);
  protected readonly filtered = computed(() =>
    this.bySportSeason().filter((m) => (!this.team() || m.team === this.team()) && (!this.competition() || m.competition === this.competition())),
  );
  protected readonly grouped = computed(() =>
    (['futsal', 'rugby'] as const)
      .map((slug) => ({ slug, name: this.content.sport(slug)!.name, matches: this.filtered().filter((m) => m.sportSlug === slug) }))
      .filter((g) => g.matches.length),
  );
  protected readonly athletics = computed(() => this.content.athleticsResults().filter((a) => a.season === this.season()));
  protected readonly showAthletics = computed(
    () => (!this.sport() || this.sport() === 'atletismo') && !this.team() && !this.competition() && this.athletics().length > 0,
  );
  protected readonly standings = computed(() => (this.season() === this.seasons[0] ? this.content.standings().filter((s) => !this.sport() || s.sportSlug === this.sport()) : []));
  protected readonly outcome = matchOutcome;

  constructor() {
    inject(SeoService).set({
      title: 'Resultados',
      description: 'Resultados e classificações do Serrado FC em atletismo, futsal e rugby. Filtra por modalidade, época, equipa e competição.',
      path: '/resultados',
    });
  }
}
