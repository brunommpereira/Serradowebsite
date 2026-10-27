import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ABOUT, ORG, PARTNERS } from '../core/content';
import { SeoService } from '../core/seo.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { RevealDirective } from '../shared/reveal.directive';

@Component({
  selector: 'ar-about',
  imports: [RouterLink, IconComponent, PageHeadComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      title="Nasceu de uma falta. Cresceu com carinho."
      [lead]="about.intro"
      [crumbs]="[{ label: 'A associação' }]"
    />

    <section class="section story">
      <div class="container story__grid">
        <div class="story__img" arReveal>
          <img
            src="img/eventos/voluntarias-arco-iris.webp"
            alt="Voluntárias d’As Rosinhas à porta do espaço Arco-Íris a Metro"
            width="900"
            height="1600"
            loading="lazy"
          />
        </div>
        <div arReveal>
          <h2>A nossa missão</h2>
          <p class="big">{{ about.mission }}</p>
          <p>{{ about.family }}</p>
          <div class="facts">
            <div>
              <strong>{{ org.since }}</strong
              ><span>início do projeto</span>
            </div>
            <div><strong>0 €</strong><span>custo da Rosinha para quem precisa</span></div>
            <div>
              <strong>{{ org.annualFee }} €</strong><span>quota anual de sócia</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section made">
      <div class="container made__grid">
        <article class="made__card" arReveal>
          <h2>O que são as Rosinhas</h2>
          <p>Próteses mamárias artesanais feitas com dois materiais:</p>
          <ul class="ticks">
            @for (m of about.materials; track m) {
              <li><ar-icon name="check" size="18" />{{ m }}</li>
            }
          </ul>
        </article>
        <article class="made__card" arReveal>
          <h3>Características</h3>
          <ul class="ticks">
            @for (t of about.traits; track t) {
              <li><ar-icon name="check" size="18" />{{ t }}</li>
            }
          </ul>
          <h3>Proporcionam</h3>
          <ul class="ticks">
            @for (b of about.benefits; track b) {
              <li><ar-icon name="check" size="18" />{{ b }}</li>
            }
          </ul>
        </article>
      </div>
    </section>

    <section class="section people">
      <div class="container">
        <h2 arReveal>Quem caminha connosco</h2>
        <div class="people__grid">
          @for (p of partners; track p.name) {
            <article arReveal>
              <h3>{{ p.name }}</h3>
              <p>{{ p.text }}</p>
              @if (p.link) {
                <a [href]="p.link" rel="noopener"
                  >Ver no Instagram <ar-icon name="arrow" size="16"
                /></a>
              }
            </article>
          }
        </div>
        <div class="people__cta">
          <a routerLink="/ajudar" class="btn btn--primary"
            ><ar-icon name="heart" size="18" />Quero ajudar</a
          >
        </div>
      </div>
    </section>
  `,
  styles: `
    .story__grid {
      display: grid;
      grid-template-columns: 0.8fr 1.2fr;
      gap: clamp(2rem, 5vw, 4rem);
      align-items: center;
      @media (max-width: 860px) {
        grid-template-columns: 1fr;
      }
    }
    .story__img img {
      width: 100%;
      max-height: 560px;
      object-fit: cover;
      border-radius: var(--radius-l);
      box-shadow: var(--shadow-m);
    }
    .big {
      font: 400 clamp(1.2rem, 2vw, 1.45rem) / 1.5 var(--font-display);
    }
    .facts {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-top: 2rem;
      div {
        display: grid;
        gap: 0.25rem;
        padding: 1.1rem;
        border-radius: var(--radius-m);
        background: var(--color-surface);
        border: 1px solid var(--color-line);
      }
      strong {
        font: 600 1.8rem/1 var(--font-display);
        color: var(--color-accent-text);
      }
      span {
        font-size: 0.85rem;
        color: var(--color-muted);
      }
      @media (max-width: 520px) {
        grid-template-columns: 1fr;
      }
    }
    .made {
      background: var(--color-surface);
    }
    .made__grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.2rem;
      @media (max-width: 760px) {
        grid-template-columns: 1fr;
      }
    }
    .made__card {
      padding: 2rem;
      border-radius: var(--radius-l);
      background: var(--color-bg);
      border: 1px solid var(--color-line);
    }
    .ticks {
      list-style: none;
      padding: 0;
      margin: 0 0 1.4rem;
      display: grid;
      gap: 0.6rem;
      li {
        display: flex;
        gap: 0.55rem;
        font-weight: 500;
      }
      ar-icon {
        color: var(--color-muted);
        margin-top: 0.2rem;
      }
    }
    .people__grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
      article {
        padding: 1.6rem;
        border-radius: var(--radius-m);
        background: var(--color-surface);
        border: 1px solid var(--color-line);
      }
      p {
        color: var(--color-muted);
      }
      a {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-weight: 600;
      }
    }
    .people__cta {
      margin-top: 2.5rem;
      text-align: center;
    }
  `,
})
export class AboutPage {
  protected readonly about = ABOUT;
  protected readonly org = ORG;
  protected readonly partners = PARTNERS;

  constructor() {
    inject(SeoService).set({
      title: 'A associação',
      description: ABOUT.intro,
      image: 'img/eventos/voluntarias-arco-iris.webp',
    });
  }
}
