import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { SportCardComponent } from '../../shared/cards';

@Component({
  selector: 'sfc-sports-list',
  imports: [RouterLink, PageHeroComponent, SportCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Desporto"
      title="Modalidades"
      subtitle="Atletismo, futsal e rugby, com formação desde os 4 anos. Escolhe a tua e vem experimentar um treino."
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

    <section class="section section--soft" id="horarios" aria-labelledby="h-horarios">
      <div class="container">
        <div class="section-head">
          <div>
            <p class="eyebrow">Treinos</p>
            <h2 id="h-horarios">Horários de treino</h2>
          </div>
          <p>Horários da época em curso. Podem sofrer alterações; confirma com o coordenador da modalidade.</p>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col">Modalidade</th><th scope="col">Escalão / Grupo</th><th scope="col">Dias</th><th scope="col">Horário</th><th scope="col">Local</th></tr>
            </thead>
            <tbody>
              @for (s of sports; track s.id) {
                @for (t of s.trainings; track t.team) {
                  <tr>
                    <td><a [routerLink]="['/modalidades', s.slug]" class="badge" [attr.data-sport]="s.slug">{{ s.name }}</a></td>
                    <td>{{ t.team }}</td>
                    <td>{{ t.days }}</td>
                    <td>{{ t.time }}</td>
                    <td>{{ t.location }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
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
      description: 'Atletismo, futsal, rugby, formação e Escola de Desporto no Serrado FC. Horários de treino e inscrições.',
      path: '/modalidades',
    });
  }
}
