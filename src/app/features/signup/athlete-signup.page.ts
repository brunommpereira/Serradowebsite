import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { SeoService } from '../../core/services/seo.service';
import { OfflineNoticeComponent } from '../../shared/offline-notice.component';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { AthleteSignupComponent } from './athlete-signup.component';

/** /inscricao — inscrição de atleta online (?modalidade=futsal pré-escolhe a modalidade). */
@Component({
  selector: 'sfc-athlete-signup-page',
  imports: [PageHeroComponent, AthleteSignupComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Atletas" title="Inscrição de atleta" subtitle="Ficha, regulamento e assinatura, tudo online." [crumbs]="[{ label: 'Inscrição de atleta' }]" />
    <section class="section">
      <div class="container narrow">
        @if (apiMode) {
          <sfc-athlete-signup [modalidade]="modalidade() ?? ''" />
        } @else {
          <sfc-offline-notice title="Inscrição de atleta" text="Neste site de demonstração a inscrição online não grava. Fala com a secretaria do clube." />
        }
      </div>
    </section>
  `,
  styles: `
    .narrow {
      max-width: 820px;
    }
  `,
})
export class AthleteSignupPage {
  readonly modalidade = input<string>();
  protected readonly apiMode = inject(ApiClient).enabled;

  constructor() {
    inject(SeoService).set({ title: 'Inscrição de atleta', description: 'Inscreve um atleta no Serrado FC: ficha, regulamento e assinatura online.', path: '/inscricao' });
  }
}
