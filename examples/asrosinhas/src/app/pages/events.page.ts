import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENTS } from '../core/content';
import { SeoService } from '../core/seo.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { RevealDirective } from '../shared/reveal.directive';

@Component({
  selector: 'ar-events',
  imports: [RouterLink, IconComponent, PageHeadComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      title="Momentos que nos juntam."
      lead="Lançamentos, parcerias e as voluntárias que fazem as Rosinhas acontecer."
      [crumbs]="[{ label: 'Eventos' }]"
    />
    <section class="section list">
      <div class="container">
        @for (e of events; track e.slug; let odd = $odd) {
          <article class="ev" [class.ev--flip]="odd" [id]="e.slug" arReveal>
            <div class="ev__media">
              <img [src]="e.image" [alt]="e.imageAlt" width="720" height="1000" loading="lazy" />
            </div>
            <div class="ev__text">
              <p class="eyebrow">{{ e.kicker }}</p>
              <h2>{{ e.title }}</h2>
              @for (p of e.body; track $index) {
                <p>{{ p }}</p>
              }
              @if (e.cta) {
                <a [routerLink]="e.cta.link" class="btn btn--primary"
                  >{{ e.cta.label }} <ar-icon name="arrow" size="18"
                /></a>
              }
            </div>
            @if (e.gallery?.length) {
              <div class="ev__gallery">
                @for (g of e.gallery; track g) {
                  <img
                    [src]="g"
                    [alt]="'Fotografias: ' + e.title"
                    width="1600"
                    height="900"
                    loading="lazy"
                  />
                }
              </div>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    .ev {
      display: grid;
      grid-template-columns: 0.85fr 1.15fr;
      gap: clamp(1.5rem, 4vw, 3.5rem);
      align-items: center;
      padding-bottom: clamp(3rem, 7vw, 5rem);
      margin-bottom: clamp(3rem, 7vw, 5rem);
      border-bottom: 1px solid var(--color-line);
      @media (max-width: 860px) {
        grid-template-columns: 1fr;
      }
    }
    .ev:last-child {
      border-bottom: 0;
      margin-bottom: 0;
    }
    .ev--flip .ev__media {
      order: 2;
      @media (max-width: 860px) {
        order: 0;
      }
    }
    .ev__media img {
      width: 100%;
      max-height: 620px;
      object-fit: cover;
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-m);
    }
    .ev__text p:not(.eyebrow) {
      color: var(--color-muted);
    }
    .ev__gallery {
      grid-column: 1 / -1;
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
      img {
        width: 100%;
        border-radius: var(--radius-m);
      }
    }
  `,
})
export class EventsPage {
  protected readonly events = EVENTS;

  constructor() {
    inject(SeoService).set({
      title: 'Eventos',
      description:
        'Eventos d’As Rosinhas: o lançamento dos soutiens com a Simel, o lançamento num catamaran no Tejo e as nossas voluntárias.',
      image: EVENTS[0].image,
    });
  }
}
