import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CmsStore } from '../../core/cms/cms-store';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';

/** Página institucional criada no CMS (/paginas/:slug). */
@Component({
  selector: 'sfc-cms-page',
  imports: [PageHeroComponent, DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (page(); as p) {
      <sfc-page-hero eyebrow="Clube" [title]="p.title" [subtitle]="p.summary" [crumbs]="[{ label: p.title }]" />
      <section class="section">
        <div class="container prose">
          <div class="rich" [innerHTML]="p.bodyHtml"></div>
          <p class="caption">Última atualização: {{ p.updatedAt | date: 'd MMMM y' }}</p>
        </div>
      </section>
    } @else {
      <section class="section">
        <div class="container prose">
          <h1>Página não encontrada</h1>
          <p>Esta página não existe ou ainda não foi publicada. <a routerLink="/">Voltar ao início</a></p>
        </div>
      </section>
    }
  `,
})
export class CmsPageComponent {
  readonly slug = input.required<string>();
  private readonly cms = inject(CmsStore);
  protected readonly page = computed(() => this.cms.page(this.slug()));

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const p = this.page();
      if (p) seo.set({ title: p.title, description: p.summary, path: `/paginas/${this.slug()}` });
    });
  }
}
