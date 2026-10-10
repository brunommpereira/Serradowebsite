import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { MatchCardComponent, NewsCardComponent } from '../../shared/cards';
import { IconComponent } from '../../shared/icon.component';
import { CapitalizePipe } from '../../shared/capitalize.pipe';
import { SportSlug } from '../../core/models';
import { NotFoundComponent } from '../not-found/not-found.component';
import { InscriptionFormComponent } from './inscription-form.component';

const NEWS_CATEGORY: Record<SportSlug, string> = {
  atletismo: 'Atletismo',
  futsal: 'Futsal',
  rugby: 'Rugby',
  formacao: 'Formação',
  'escola-de-desporto': 'Formação',
};

/** Template comum das modalidades (secção 15 da especificação). */
@Component({
  selector: 'sfc-sport-detail',
  imports: [CapitalizePipe, RouterLink, DatePipe, PageHeroComponent, MatchCardComponent, NewsCardComponent, IconComponent, NotFoundComponent, InscriptionFormComponent],
  templateUrl: './sport-detail.component.html',
  styleUrl: './sport-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportDetailComponent {
  readonly slug = input.required<string>();

  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);

  protected readonly sport = computed(() => this.content.sport(this.slug()));
  /** Formação e Escola agregam as equipas de formação de todas as modalidades */
  protected readonly isUmbrella = computed(() => this.slug() === 'formacao' || this.slug() === 'escola-de-desporto');
  protected readonly teams = computed(() =>
    this.isUmbrella()
      ? this.content.teams().filter((t) => t.category !== 'Sénior' && t.category !== 'Masters')
      : this.content.teams(this.slug() as SportSlug),
  );
  protected readonly coaches = computed(() => this.content.coaches(this.slug() as SportSlug));
  protected readonly upcoming = computed(() => this.content.upcomingMatches(this.slug() as SportSlug, 3));
  protected readonly lastResult = computed(() => this.content.results(this.slug() as SportSlug)[0]);
  protected readonly results = computed(() => this.content.results(this.slug() as SportSlug).slice(0, 5));
  protected readonly standings = computed(() => this.content.standings(this.slug() as SportSlug));
  protected readonly athletics = computed(() => (this.slug() === 'atletismo' ? this.content.athleticsResults() : []));
  protected readonly records = computed(() => (this.slug() === 'atletismo' ? this.content.clubRecords() : []));
  protected readonly news = computed(() => this.content.news(NEWS_CATEGORY[this.slug() as SportSlug]).slice(0, 3));
  protected readonly trainings = computed(() => {
    const s = this.sport();
    if (!s) return [];
    if (this.school()) return [...s.trainings, ...this.school()!.trainings];
    if (!this.isUmbrella() || s.trainings.length) return s.trainings;
    return this.content.sports().flatMap((x) => x.trainings.filter((t) => /sub|forma|escola/i.test(t.team)));
  });
  protected readonly teamName = (sportSlug: string) => this.content.sport(sportSlug)?.name;
  /** A Escola de Desporto (4–8 anos) aparece dentro da página do Futsal */
  protected readonly school = computed(() => (this.slug() === 'futsal' ? this.content.sport('escola-de-desporto') : undefined));

  protected readonly tabs = computed(() => {
    const t = [
      { id: 'inicio', label: 'Início' },
      ...(this.school() ? [{ id: 'escola-de-desporto', label: 'Escola de Desporto' }] : []),
      { id: 'equipas', label: 'Equipas' },
      { id: 'treinadores', label: 'Treinadores' },
      { id: 'calendario', label: 'Calendário' },
      { id: 'resultados', label: 'Resultados' },
    ];
    if (this.records().length) t.push({ id: 'recordes', label: 'Recordes' });
    t.push({ id: 'treinos', label: 'Treinos' }, { id: 'noticias', label: 'Notícias' }, { id: 'galeria', label: 'Galeria' }, { id: 'inscricoes', label: 'Inscrições' });
    return t;
  });

  constructor() {
    effect(() => {
      const s = this.sport();
      if (s) {
        this.seo.set({
          title: s.name,
          description: `${s.name} no Serrado FC — ${s.tagline} ${s.description}`.slice(0, 160),
          path: `/modalidades/${s.slug}`,
        });
      }
    });
  }
}
