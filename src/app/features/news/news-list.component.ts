import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { NewsCardComponent } from '../../shared/cards';

const PAGE_SIZE = 6;

@Component({
  selector: 'sfc-news-list',
  imports: [RouterLink, PageHeroComponent, NewsCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Atualidade" title="Notícias" subtitle="Tudo o que acontece no Serrado FC." [crumbs]="[{ label: 'Notícias' }]" />
    <section class="section">
      <div class="container">
        <nav class="chips filters" aria-label="Categorias">
          <a class="chip" routerLink="/noticias" [class.active]="!categoria()" [attr.aria-current]="!categoria() ? 'page' : null">Todas</a>
          @for (c of categories; track c) {
            <a class="chip" routerLink="/noticias" [queryParams]="{ categoria: c }" [class.active]="categoria() === c" [attr.aria-current]="categoria() === c ? 'page' : null">{{ c }}</a>
          }
        </nav>
        @if (visible().length) {
          <div class="grid grid-3">
            @for (n of visible(); track n.id) {
              <sfc-news-card [article]="n" />
            }
          </div>
          @if (visible().length < all().length) {
            <p class="center more">
              <button class="btn btn--outline" type="button" (click)="limit.set(limit() + pageSize)">Carregar mais notícias</button>
            </p>
          }
        } @else {
          <p class="muted center">Ainda não há notícias nesta categoria.</p>
        }
      </div>
    </section>
  `,
  styles: `
    .filters { margin-bottom: 2rem; }
    .more { margin-top: 2.5rem; }
  `,
})
export class NewsListComponent {
  /** ?categoria= */
  readonly categoria = input<string>();
  private readonly content = inject(ContentService);
  protected readonly categories = this.content.newsCategories();
  protected readonly pageSize = PAGE_SIZE;
  protected readonly all = computed(() => this.content.news(this.categoria() || undefined));
  protected readonly limit = linkedSignal({ source: this.categoria, computation: () => PAGE_SIZE });
  protected readonly visible = computed(() => this.all().slice(0, this.limit()));

  constructor() {
    inject(SeoService).set({
      title: 'Notícias',
      description: 'Notícias do Serrado FC: clube, atletismo, futsal, rugby, formação, comunidade e comunicados.',
      path: '/noticias',
    });
  }
}
