import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from './icon.component';
import { CapitalizePipe } from './capitalize.pipe';
import { ClubEvent, Match, NewsArticle, Sponsor, Sport } from '../core/models';
import { ContentService } from '../core/services/content.service';

const CATEGORY_SPORT: Record<string, string> = {
  Atletismo: 'atletismo',
  Futsal: 'futsal',
  Rugby: 'rugby',
  Formação: 'formacao',
};

/* ------------------------------------------------------------------ */
/* News Card                                                           */
/* ------------------------------------------------------------------ */
@Component({
  selector: 'sfc-news-card',
  imports: [RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="news" [class.news--featured]="featured()">
      <a class="news__media media-ph" [attr.data-sport]="sport()" [routerLink]="['/noticias', article().slug]" tabindex="-1" aria-hidden="true">
        <img src="brand/logo-white.svg" alt="" loading="lazy" />
      </a>
      <div class="news__body">
        <p class="news__meta">
          <span class="badge" [attr.data-sport]="sport()">{{ article().category }}</span>
          <time [attr.datetime]="article().publicationDate">{{ article().publicationDate | date: 'd MMM y' }}</time>
        </p>
        <h3><a [routerLink]="['/noticias', article().slug]">{{ article().title }}</a></h3>
        <p class="news__summary">{{ article().summary }}</p>
        <a class="link-arrow" [routerLink]="['/noticias', article().slug]">Ler notícia<span class="visually-hidden">: {{ article().title }}</span></a>
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .news {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--color-surface);
      border: 1px solid var(--color-line);
      border-radius: var(--radius);
      overflow: hidden;
      transition: transform 0.22s, box-shadow 0.22s;
      &:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
    }
    .news__media { aspect-ratio: 16 / 9; img { width: 70px; opacity: 0.9; } }
    .news__body { padding: 1.2rem 1.3rem 1.4rem; display: flex; flex-direction: column; flex: 1; }
    .news__meta { display: flex; align-items: center; gap: 0.7rem; font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0.7rem; }
    h3 { font-size: 1.35rem; a { color: inherit; text-decoration: none; } a:hover { color: var(--sfc-blue); } }
    .news__summary { color: var(--color-muted); font-size: 0.94rem; flex: 1; }
    .news--featured {
      @media (min-width: 900px) {
        flex-direction: row;
        .news__media { aspect-ratio: auto; flex: 1.2; min-height: 300px; img { width: 120px; } }
        .news__body { flex: 1; padding: 2rem; justify-content: center; }
        h3 { font-size: 2rem; }
        .news__summary { flex: none; }
      }
    }
  `,
})
export class NewsCardComponent {
  readonly article = input.required<NewsArticle>();
  readonly featured = input(false);
  protected readonly sport = computed(() => CATEGORY_SPORT[this.article().category]);
}

/* ------------------------------------------------------------------ */
/* Match Card — próximo jogo / resultado                                */
/* ------------------------------------------------------------------ */
@Component({
  selector: 'sfc-match-card',
  imports: [RouterLink, DatePipe, IconComponent, CapitalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = match();
    <article class="match" [attr.data-sport]="m.sportSlug">
      <header class="match__head">
        <span class="badge" [attr.data-sport]="m.sportSlug">{{ sportName() }} · {{ m.team }}</span>
        <span class="match__comp">{{ m.competition }}</span>
      </header>
      <div class="match__teams">
        <span class="match__team" [class.us]="m.homeAway === 'casa'">{{ m.homeAway === 'casa' ? 'Serrado FC' : m.opponent }}</span>
        @if (m.status === 'terminado') {
          <span class="match__score" [attr.data-outcome]="outcome()">{{ m.scoreHome }} – {{ m.scoreAway }}</span>
        } @else {
          <span class="match__vs">vs</span>
        }
        <span class="match__team" [class.us]="m.homeAway === 'fora'">{{ m.homeAway === 'fora' ? 'Serrado FC' : m.opponent }}</span>
      </div>
      <footer class="match__info">
        <span><sfc-icon name="calendar" size="16" />{{ m.date | date: "EEE, d MMM · HH'h'mm" | cap }}</span>
        <span><sfc-icon name="pin" size="16" />{{ m.venue }}</span>
      </footer>
      <a class="link-arrow match__more" [routerLink]="['/modalidades', m.sportSlug]">Detalhes</a>
    </article>
  `,
  styles: `
    :host { display: block; }
    .match {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background: var(--color-surface);
      border: 1px solid var(--color-line);
      border-top: 4px solid var(--sport-color, var(--sfc-blue));
      border-radius: var(--radius);
      padding: 1.2rem 1.3rem;
      &[data-sport='atletismo'] { --sport-color: var(--sport-atletismo); }
      &[data-sport='rugby'] { --sport-color: var(--sport-rugby); }
    }
    .match__head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; align-items: center; }
    .match__comp { font-size: 0.8rem; color: var(--color-muted); }
    .match__teams { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.8rem; text-align: center; }
    .match__team { font: 700 1.25rem/1.1 var(--font-display); text-transform: uppercase; }
    .match__team.us { color: var(--sfc-blue); }
    .match__vs { font: 700 0.9rem var(--font-body); color: var(--color-muted); }
    .match__score {
      font: 800 1.7rem/1 var(--font-display);
      background: var(--sfc-blue-900);
      color: #fff;
      padding: 0.35rem 0.7rem;
      border-radius: var(--radius-s);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      &[data-outcome='V'] { background: var(--color-success); }
      &[data-outcome='D'] { background: var(--color-danger); }
      &[data-outcome='E'] { background: #5a6172; }
    }
    .match__info {
      display: grid;
      gap: 0.3rem;
      font-size: 0.85rem;
      color: var(--color-muted);
      span { display: flex; align-items: center; gap: 0.4rem; }
    }
    .match__more { font-size: 0.9rem; margin-top: auto; }
  `,
})
export class MatchCardComponent {
  readonly match = input.required<Match>();
  private readonly content = inject(ContentService);
  protected readonly sportName = computed(() => this.content.sport(this.match().sportSlug)?.name);
  /** V/E/D na perspetiva do Serrado FC */
  protected readonly outcome = computed(() => matchOutcome(this.match()));
}

export function matchOutcome(m: Match): 'V' | 'E' | 'D' | undefined {
  if (m.scoreHome === undefined || m.scoreAway === undefined) return undefined;
  const ours = m.homeAway === 'casa' ? m.scoreHome : m.scoreAway;
  const theirs = m.homeAway === 'casa' ? m.scoreAway : m.scoreHome;
  return ours > theirs ? 'V' : ours < theirs ? 'D' : 'E';
}

/* ------------------------------------------------------------------ */
/* Event Card                                                          */
/* ------------------------------------------------------------------ */
@Component({
  selector: 'sfc-event-card',
  imports: [RouterLink, DatePipe, CurrencyPipe, IconComponent, CapitalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let e = event();
    <article class="ev">
      <div class="ev__date" aria-hidden="true">
        <span class="ev__day">{{ e.date | date: 'dd' }}</span>
        <span class="ev__month">{{ e.date | date: 'MMM' }}</span>
      </div>
      <div class="ev__body">
        <p class="ev__meta">
          <span class="badge badge--accent">{{ e.kind }}</span>
          <span>{{ e.price === 0 ? 'Gratuito' : (e.price | currency: 'EUR') }}</span>
        </p>
        <h3><a [routerLink]="['/eventos', e.slug]">{{ e.title }}</a></h3>
        <p class="ev__info">
          <span><sfc-icon name="clock" size="15" />{{ e.date | date: "EEEE, d 'de' MMMM · HH'h'mm" | cap }}</span>
          <span><sfc-icon name="pin" size="15" />{{ e.location }}</span>
        </p>
        <p class="ev__summary">{{ e.summary }}</p>
        <a class="link-arrow" [routerLink]="['/eventos', e.slug]">{{ e.registrationRequired ? 'Detalhes e inscrição' : 'Ver detalhes' }}</a>
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .ev {
      height: 100%;
      display: flex;
      gap: 1.1rem;
      background: var(--color-surface);
      border: 1px solid var(--color-line);
      border-radius: var(--radius);
      padding: 1.3rem;
      transition: box-shadow 0.2s, transform 0.2s;
      &:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
    }
    .ev__date {
      flex: none;
      width: 64px;
      height: 70px;
      border-radius: var(--radius-s);
      background: var(--sfc-blue);
      color: #fff;
      display: grid;
      place-content: center;
      text-align: center;
    }
    .ev__day { font: 800 1.9rem/1 var(--font-display); }
    .ev__month { font: 700 0.75rem/1 var(--font-body); text-transform: uppercase; letter-spacing: 0.1em; color: var(--sfc-yellow); }
    .ev__meta { display: flex; gap: 0.6rem; align-items: center; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; }
    h3 { font-size: 1.3rem; a { color: inherit; text-decoration: none; } a:hover { color: var(--sfc-blue); } }
    .ev__info { display: grid; gap: 0.2rem; font-size: 0.85rem; color: var(--color-muted); span { display: flex; gap: 0.4rem; align-items: center; } }
    .ev__summary { font-size: 0.93rem; }
  `,
})
export class EventCardComponent {
  readonly event = input.required<ClubEvent>();
}

/* ------------------------------------------------------------------ */
/* Sport Card                                                          */
/* ------------------------------------------------------------------ */
@Component({
  selector: 'sfc-sport-card',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = sport();
    <a class="sport media-ph" [attr.data-sport]="s.slug" [routerLink]="['/modalidades', s.slug]">
      <span class="sport__icon"><sfc-icon [name]="s.icon" size="40" /></span>
      <span class="sport__name">{{ s.name }}</span>
      <span class="sport__tag">{{ s.tagline }}</span>
      <span class="sport__cta">Conhecer <sfc-icon name="arrow" size="18" /></span>
    </a>
  `,
  styles: `
    :host { display: block; }
    .sport {
      min-height: 320px;
      border-radius: var(--radius-l);
      padding: 1.8rem;
      text-decoration: none;
      display: flex !important;
      flex-direction: column;
      justify-content: flex-end;
      align-items: flex-start;
      gap: 0.4rem;
      color: #fff;
      transition: transform 0.25s, box-shadow 0.25s;
      &:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
      &:hover .sport__cta { background: var(--sfc-yellow); color: var(--color-on-accent); }
    }
    .sport__icon {
      position: absolute !important;
      top: 1.5rem;
      left: 1.5rem;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.14);
      display: grid;
      place-items: center;
    }
    .sport__name { font: 800 2.6rem/1 var(--font-display); text-transform: uppercase; }
    .sport__tag { font-size: 1.05rem; opacity: 0.92; }
    .sport__cta {
      margin-top: 0.8rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.55rem 1rem;
      border-radius: 999px;
      border: 1.5px solid rgba(255, 255, 255, 0.7);
      font-weight: 700;
      font-size: 0.9rem;
      transition: background 0.2s, color 0.2s;
    }
  `,
})
export class SportCardComponent {
  readonly sport = input.required<Sport>();
}

/* ------------------------------------------------------------------ */
/* Sponsor strip                                                       */
/* ------------------------------------------------------------------ */
@Component({
  selector: 'sfc-sponsor-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sp" [class.sp--main]="sponsor().category === 'Patrocinador Principal'">
      <span class="sp__logo" aria-hidden="true">{{ initials() }}</span>
      <span class="sp__name">{{ sponsor().name }}</span>
      <span class="sp__cat">{{ sponsor().category }}</span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .sp {
      height: 100%;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0.3rem;
      text-align: center;
      padding: 1.3rem 1rem;
      border: 1.5px dashed #c9cfdb;
      border-radius: var(--radius);
      background: var(--color-surface);
      transition: border-color 0.2s;
      &:hover { border-color: var(--sfc-blue); }
    }
    .sp__logo {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: var(--color-bg-soft);
      display: grid;
      place-items: center;
      font: 800 1.2rem var(--font-display);
      color: var(--sfc-blue);
    }
    .sp__name { font-weight: 700; font-size: 0.95rem; }
    .sp__cat { font-size: 0.75rem; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .sp--main .sp__logo { background: var(--sfc-yellow); color: var(--color-on-accent); }
  `,
})
export class SponsorCardComponent {
  readonly sponsor = input.required<Sponsor>();
  protected readonly initials = computed(() =>
    this.sponsor()
      .name.split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  );
}
