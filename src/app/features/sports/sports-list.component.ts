import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { SportCardComponent } from '../../shared/cards';

@Component({
  selector: 'sfc-sports-list',
  imports: [PageHeroComponent, SportCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Desporto"
      title="Modalidades"
      subtitle="Atletismo, futsal e rugby, para todas as idades. Escolhe a tua e vem experimentar um treino: os horários estão na página de cada modalidade."
      [crumbs]="[{ label: 'Modalidades' }]"
    />
    <section class="section">
      <div class="container">
        <div class="grid grid-3">
          @for (s of sports; track s.id) {
            <sfc-sport-card [sport]="s" />
          }
        </div>
      </div>
    </section>
  `,
})
export class SportsListComponent {
  protected readonly sports = inject(ContentService).sports();

  constructor() {
    inject(SeoService).set({
      title: 'Modalidades',
      description: 'Atletismo, futsal e rugby no Serrado FC. Horários de treino e inscrições.',
      path: '/modalidades',
    });
  }
}
