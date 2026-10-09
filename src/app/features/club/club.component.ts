import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'sfc-club',
  imports: [RouterLink, PageHeroComponent, IconComponent],
  templateUrl: './club.component.html',
  styleUrl: './club.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubComponent {
  private readonly content = inject(ContentService);
  protected readonly club = this.content.club;
  protected readonly boards = this.content.boards();
  protected readonly documents = this.content.documents();
  protected readonly docCategories = [...new Set(this.documents.map((d) => d.category))];
  protected readonly docFilter = signal<string | null>(null);
  protected readonly filteredDocs = computed(() => this.documents.filter((d) => !this.docFilter() || d.category === this.docFilter()));

  /** Textos, história, valores e instalações: Backoffice → Conteúdos do site → Página do Clube */
  protected readonly page = this.content.clubPage();
  protected readonly intro = paragraphs(this.page.intro);
  protected readonly boardsNote = this.content.boardsNote();

  constructor() {
    inject(SeoService).set({
      title: 'O Clube',
      description: 'A história, missão, valores, órgãos sociais, documentos e instalações do Serrado Futebol Clube, fundado em 1978.',
      path: '/clube',
    });
  }
}

function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
