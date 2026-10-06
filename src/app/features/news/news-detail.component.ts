import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService, SITE_URL } from '../../core/services/seo.service';
import { NewsCardComponent } from '../../shared/cards';
import { IconComponent } from '../../shared/icon.component';
import { NotFoundComponent } from '../not-found/not-found.component';

@Component({
  selector: 'sfc-news-detail',
  imports: [RouterLink, DatePipe, NewsCardComponent, IconComponent, NotFoundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (article(); as a) {
      <article>
        <header class="container art__head">
          <nav aria-label="Caminho" class="crumbs">
            <a routerLink="/">Início</a> / <a routerLink="/noticias">Notícias</a> /
            <a routerLink="/noticias" [queryParams]="{ categoria: a.category }">{{ a.category }}</a>
          </nav>
          <span class="badge">{{ a.category }}</span>
          <h1>{{ a.title }}</h1>
          <p class="art__meta">
            <time [attr.datetime]="a.publicationDate">{{ a.publicationDate | date: "d 'de' MMMM 'de' y" }}</time> · Por {{ a.author }}
          </p>
        </header>
        <div class="container">
          <div class="art__cover media-ph"><img src="brand/logo-white.svg" alt="" /></div>
        </div>
        <div class="container art__layout">
          <div class="prose art__body">
            <p class="art__lead">{{ a.summary }}</p>
            @for (p of a.content; track $index) {
              <p>{{ p }}</p>
            }
          </div>
          <aside class="art__share" aria-label="Partilhar">
            <p class="caption">Partilhar</p>
            <a [href]="'https://www.facebook.com/sharer/sharer.php?u=' + url()" target="_blank" rel="noopener" aria-label="Partilhar no Facebook"><sfc-icon name="facebook" /></a>
            <a [href]="'https://wa.me/?text=' + url()" target="_blank" rel="noopener" aria-label="Partilhar no WhatsApp"><sfc-icon name="share" /></a>
            <button type="button" (click)="copy()" [attr.aria-label]="copied() ? 'Ligação copiada' : 'Copiar ligação'">
              <sfc-icon [name]="copied() ? 'check' : 'external'" />
            </button>
          </aside>
        </div>
      </article>

      @if (related().length) {
        <section class="section section--soft" aria-labelledby="h-rel">
          <div class="container">
            <h2 id="h-rel">Notícias relacionadas</h2>
            <div class="grid grid-3">
              @for (n of related(); track n.id) {
                <sfc-news-card [article]="n" />
              }
            </div>
          </div>
        </section>
      }
    } @else {
      <sfc-not-found />
    }
  `,
  styles: `
    .art__head { padding: 2.5rem 0 1.5rem; max-width: 860px; }
    .crumbs { font-size: 0.82rem; color: var(--color-muted); margin-bottom: 1.2rem; }
    h1 { font-size: clamp(2.2rem, 5vw, 3.6rem); margin: 0.8rem 0 0.6rem; text-transform: none; }
    .art__meta { color: var(--color-muted); font-size: 0.92rem; }
    .art__cover { aspect-ratio: 21 / 9; border-radius: var(--radius-l); img { width: 120px; } }
    .art__layout { display: grid; grid-template-columns: 1fr auto; gap: 3rem; padding: 2.5rem 0 4rem; max-width: 860px; }
    .art__lead { font-size: 1.25rem; font-weight: 600; }
    .art__share {
      position: sticky; top: 120px; align-self: start; display: grid; gap: 0.5rem; justify-items: center;
      a, button {
        width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%;
        border: 1px solid var(--color-line); background: #fff; color: var(--sfc-blue); cursor: pointer;
        &:hover { background: var(--sfc-blue); color: #fff; }
      }
    }
    @media (max-width: 700px) {
      .art__layout { grid-template-columns: 1fr; gap: 1.5rem; }
      .art__share { position: static; display: flex; justify-content: flex-start; }
    }
  `,
})
export class NewsDetailComponent {
  readonly slug = input.required<string>();
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);

  protected readonly article = computed(() => this.content.article(this.slug()));
  protected readonly related = computed(() => {
    const a = this.article();
    if (!a) return [];
    const same = this.content.news(a.category).filter((n) => n.id !== a.id);
    const others = this.content.news().filter((n) => n.id !== a.id && n.category !== a.category);
    return [...same, ...others].slice(0, 3);
  });
  protected readonly url = computed(() => encodeURIComponent(`${SITE_URL}/noticias/${this.slug()}`));
  protected readonly copied = signal(false);

  constructor() {
    effect(() => {
      const a = this.article();
      if (a) this.seo.set({ title: a.title, description: a.summary, path: `/noticias/${a.slug}`, type: 'article' });
    });
  }

  copy() {
    navigator.clipboard?.writeText(decodeURIComponent(this.url())).then(() => this.copied.set(true));
  }
}
