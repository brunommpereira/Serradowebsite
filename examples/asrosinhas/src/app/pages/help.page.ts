import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ORG } from '../core/content';
import { SeoService } from '../core/seo.service';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { RevealDirective } from '../shared/reveal.directive';

@Component({
  selector: 'ar-help',
  imports: [RouterLink, IconComponent, PageHeadComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      title="Há muitas maneiras de ser uma Rosinha."
      lead="As Rosinhas são enviadas gratuitamente a todas as mulheres que nos procuram. É com a ajuda de sócias, sócios, voluntárias e amigos que isso é possível."
      [crumbs]="[{ label: 'Ajudar' }]"
    />
    <section class="section">
      <div class="container ways">
        <a class="way way--main" routerLink="/ajudar/socia" arReveal>
          <ar-icon name="users" size="30" />
          <h2>Ser sócia</h2>
          <p>
            A quota anual permite enviar gratuitamente mais Rosinhas a todas as mulheres que nos
            procuram.
          </p>
          <p class="price">
            <strong>{{ org.annualFee }} €</strong> por ano
          </p>
          <span class="btn btn--light">Quero ser sócia <ar-icon name="arrow" size="18" /></span>
        </a>
        <a class="way" routerLink="/ajudar/donativo" arReveal>
          <ar-icon name="heart" size="30" />
          <h2>Fazer um donativo</h2>
          <p>
            Uma doação, de qualquer valor, ou uma contribuição para a campanha de angariação de
            fundos.
          </p>
          <span class="go">Fazer um donativo <ar-icon name="arrow" size="18" /></span>
        </a>
        <a class="way" routerLink="/loja" arReveal>
          <ar-icon name="bag" size="30" />
          <h2>Comprar na loja</h2>
          <p>
            Soutiens para prótese e merchandising. Cada compra ajuda a continuar a enviar Rosinhas.
          </p>
          <span class="go">Ver a loja <ar-icon name="arrow" size="18" /></span>
        </a>
        <a
          class="way"
          [href]="'mailto:' + org.email + '?subject=Quero%20ser%20volunt%C3%A1ria'"
          arReveal
        >
          <ar-icon name="feather" size="30" />
          <h2>Ser voluntária</h2>
          <p>
            As voluntárias ajudam a produzir as próteses e fazem as almofadinhas de coração e o saco
            para os drenos que entregamos em hospital.
          </p>
          <span class="go">Falar connosco <ar-icon name="arrow" size="18" /></span>
        </a>
      </div>
    </section>
  `,
  styles: `
    .ways {
      display: grid;
      gap: 1.3rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    }
    .way {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: clamp(1.5rem, 3vw, 2.2rem);
      border-radius: var(--radius-l);
      background: var(--color-surface);
      color: inherit;
      text-decoration: none;
      box-shadow: var(--shadow-s);
      transition:
        transform 0.3s var(--ease),
        box-shadow 0.3s var(--ease);
      ar-icon {
        color: var(--color-accent-text);
        margin-bottom: 0.6rem;
      }
      h2 {
        font-size: 1.5rem;
        margin-bottom: 0.3rem;
      }
      p {
        color: var(--color-muted);
      }
    }
    .way:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-m);
    }
    .way--main {
      background: linear-gradient(150deg, var(--rose-700), var(--rose-800));
      color: #fff;
      ar-icon,
      p {
        color: #fff;
      }
      .btn {
        margin-top: auto;
        align-self: flex-start;
      }
    }
    @media (min-width: 900px) {
      .way--main {
        grid-row: span 2;
      }
    }
    .price strong {
      font: 600 2.4rem/1 var(--font-display);
    }
    .go {
      margin-top: auto;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-weight: 600;
      color: var(--color-link);
    }
  `,
})
export class HelpPage {
  protected readonly org = ORG;
  constructor() {
    inject(SeoService).set({
      title: 'Como ajudar',
      description:
        'Torna-te sócia d’As Rosinhas, faz um donativo, compra na loja solidária ou sê voluntária.',
    });
  }
}
