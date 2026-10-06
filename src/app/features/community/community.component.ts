import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { EventCardComponent } from '../../shared/cards';
import { IconComponent } from '../../shared/icon.component';

const IDS = ['projetos', 'caminhadas', 'voluntariado', 'jovens', 'inclusao', 'patrimonio'];
const ICONS = ['heart', 'run', 'users', 'school', 'star', 'pin'];

@Component({
  selector: 'sfc-community',
  imports: [RouterLink, PageHeroComponent, EventCardComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Comunidade"
      title="Mais do que desporto"
      subtitle="Projetos sociais, solidariedade, voluntariado e o nosso património. O Serrado FC ao serviço da comunidade."
      [crumbs]="[{ label: 'Comunidade' }]"
    />
    <section class="section">
      <div class="container">
        <ul class="projects">
          @for (p of projects; track p.title; let i = $index) {
            <li class="card" [id]="ids[i]">
              <span class="projects__icon"><sfc-icon [name]="icons[i]" size="28" /></span>
              <h2 class="h-s">{{ p.title }}</h2>
              <p>{{ p.text }}</p>
            </li>
          }
        </ul>
      </div>
    </section>

    <section class="section section--soft" aria-labelledby="h-vol">
      <div class="container split">
        <div>
          <p class="eyebrow">Voluntariado</p>
          <h2 id="h-vol">Dá uma mão ao clube</h2>
          <p>Precisamos de ajuda em jogos, eventos, transportes, comunicação, fotografia e manutenção. Uma hora por mês já faz a diferença.</p>
          <a class="btn btn--primary" routerLink="/contactos" [queryParams]="{ assunto: 'Voluntariado' }">Quero ser voluntário</a>
        </div>
        <div>
          @if (walk) {
            <p class="eyebrow">Próxima caminhada</p>
            <sfc-event-card [event]="walk" />
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .projects { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); p { margin: 0; color: var(--color-muted); } h2 { text-transform: none; } }
    .projects__icon { display: inline-grid; place-items: center; width: 54px; height: 54px; border-radius: 14px; background: var(--sfc-green-50); color: var(--sfc-green); margin-bottom: 0.9rem; }
  `,
})
export class CommunityComponent {
  private readonly content = inject(ContentService);
  protected readonly projects = this.content.communityProjects();
  protected readonly ids = IDS;
  protected readonly icons = ICONS;
  protected readonly walk = this.content.upcomingEvents().find((e) => e.kind === 'Caminhada');

  constructor() {
    inject(SeoService).set({
      title: 'Comunidade',
      description: 'Projetos sociais, caminhadas solidárias, voluntariado, inclusão e Descobrir Património no Serrado FC.',
      path: '/comunidade',
    });
  }
}
