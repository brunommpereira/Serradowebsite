import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'sfc-search',
  imports: [RouterLink, FormsModule, PageHeroComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Pesquisa" title="Pesquisar no Serrado FC" [crumbs]="[{ label: 'Pesquisa' }]">
      <form class="search" role="search" (ngSubmit)="search(box.value)">
        <label for="search-q" class="visually-hidden">Termo de pesquisa</label>
        <input #box id="search-q" name="q" type="search" [value]="q() ?? ''" placeholder="Notícias, modalidades, eventos, documentos…" />
        <button class="btn btn--accent" type="submit"><sfc-icon name="search" />Pesquisar</button>
      </form>
    </sfc-page-hero>
    <section class="section">
      <div class="container results">
        @if (q()) {
          <p class="muted" role="status">{{ results().length }} resultado(s) para «{{ q() }}»</p>
          <ul>
            @for (r of results(); track r.link + r.title) {
              <li>
                <span class="badge">{{ r.type }}</span>
                <a [routerLink]="r.link.split('#')[0]" [fragment]="r.link.split('#')[1]">{{ r.title }}</a>
                <p>{{ r.summary }}</p>
              </li>
            } @empty {
              <li class="muted">Sem resultados. Experimenta "futsal", "sócio", "caminhada" ou "estatutos".</li>
            }
          </ul>
        } @else {
          <p class="muted">Escreve um termo para pesquisar em páginas, notícias, eventos, modalidades, equipas e documentos.</p>
        }
      </div>
    </section>
  `,
  styles: `
    .search { display: flex; gap: 0.6rem; max-width: 640px; margin-top: 1.4rem; input { flex: 1; min-width: 0; border: 0; border-radius: 999px; padding: 0 1.2rem; font: inherit; min-height: 50px; } }
    .results { max-width: 820px; ul { list-style: none; margin: 0; padding: 0; } li { padding: 1.2rem 0; border-bottom: 1px solid var(--color-line); } a { display: block; font: 700 1.4rem/1.2 var(--font-display); text-transform: uppercase; margin: 0.5rem 0 0.3rem; } p { margin: 0; color: var(--color-muted); } }
  `,
})
export class SearchComponent {
  /** ?q= */
  readonly q = input<string>();
  private readonly content = inject(ContentService);
  private readonly router = inject(Router);
  protected readonly results = computed(() => this.content.search(this.q() ?? ''));

  constructor() {
    inject(SeoService).set({ title: 'Pesquisa', description: 'Pesquisa global no site do Serrado FC.', path: '/pesquisa' });
  }

  search(value: string) {
    this.router.navigate(['/pesquisa'], { queryParams: { q: value.trim() || null } });
  }
}
