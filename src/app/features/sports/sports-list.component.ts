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
      subtitle="Atletismo, futsal e rugby, com formação desde os 4 anos. Escolhe a tua e vem experimentar um treino: os horários estão na página de cada modalidade."
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
  /** A Escola de Desporto mostra-se dentro da página do Futsal */
  protected readonly sports = inject(ContentService).sports().filter((s) => s.slug !== 'escola-de-desporto');

  constructor() {
    inject(SeoService).set({
      title: 'Modalidades',
      description: 'Atletismo, futsal (com a Escola de Desporto), rugby e formação no Serrado FC. Horários de treino e inscrições.',
      path: '/modalidades',
    });
  }
}
