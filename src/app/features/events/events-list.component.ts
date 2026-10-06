import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { EventCardComponent } from '../../shared/cards';

@Component({
  selector: 'sfc-events-list',
  imports: [PageHeroComponent, EventCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Eventos"
      title="Próximos eventos"
      subtitle="Caminhadas, torneios, corridas, arraiais e atividades para crianças. Inscreve-te online."
      [crumbs]="[{ label: 'Eventos' }]"
    />
    <section class="section">
      <div class="container">
        <div class="chips filters" role="group" aria-label="Tipo de evento">
          <button class="chip" type="button" [attr.aria-pressed]="!kind()" (click)="kind.set('')">Todos</button>
          @for (k of kinds; track k) {
            <button class="chip" type="button" [attr.aria-pressed]="kind() === k" (click)="kind.set(k)">{{ k }}</button>
          }
        </div>
        <div class="grid grid-2">
          @for (e of events(); track e.id) {
            <sfc-event-card [event]="e" />
          } @empty {
            <p class="muted">Sem eventos deste tipo agendados.</p>
          }
        </div>
      </div>
    </section>
  `,
  styles: `.filters { margin-bottom: 2rem; }`,
})
export class EventsListComponent {
  /** ?tipo= */
  readonly tipo = input<string>();
  private readonly all = inject(ContentService).upcomingEvents();
  protected readonly kinds = [...new Set(this.all.map((e) => e.kind))];
  protected readonly kind = linkedSignal(() => this.tipo() ?? '');
  protected readonly events = computed(() => this.all.filter((e) => !this.kind() || e.kind === this.kind()));

  constructor() {
    inject(SeoService).set({
      title: 'Eventos',
      description: 'Eventos do Serrado FC: caminhadas solidárias, torneios, corridas e atividades para crianças. Inscrições online.',
      path: '/eventos',
    });
  }
}
