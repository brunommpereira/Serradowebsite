import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ABOUT, EVENTS, ORG, PARTNERS, SOUTIENS } from '../core/content';
import { SeoService } from '../core/seo.service';
import { IconComponent } from '../shared/icon.component';
import { ProductCardComponent } from '../shared/product-card.component';
import { RevealDirective } from '../shared/reveal.directive';

@Component({
  selector: 'ar-home',
  imports: [RouterLink, IconComponent, ProductCardComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Abertura: a missão em primeiro lugar -->
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__text">
          <p class="eyebrow">Desde {{ org.since }} · Sem fins lucrativos</p>
          <h1>Uma Rosinha para <em>cada mulher</em> que precisa.</h1>
          <p class="lead">{{ about.mission }}</p>
          <div class="hero__cta">
            <a routerLink="/ajudar" class="btn btn--primary"
              ><ar-icon name="heart" size="18" />Quero ajudar</a
            >
            <a routerLink="/sobre" class="btn btn--ghost">O que são as Rosinhas</a>
          </div>
          <ul class="hero__facts">
            <li><ar-icon name="feather" size="18" />Feitas à mão</li>
            <li><ar-icon name="gift" size="18" />Enviadas gratuitamente</li>
            <li><ar-icon name="users" size="18" />Com voluntárias</li>
          </ul>
        </div>
        <div class="hero__art">
          <div class="arch">
            <img
              src="img/eventos/catamaran-grupo.webp"
              alt="Mulheres sorridentes num catamaran no Tejo, no lançamento dos soutiens As Rosinhas"
              width="720"
              height="1280"
              fetchpriority="high"
            />
          </div>
          <img class="hero__rose" src="brand/rosa.png" alt="" width="140" height="135" />
          <div class="hero__card">
            <strong>Projeto familiar</strong>
            <span>com a dedicação de voluntárias</span>
          </div>
        </div>
      </div>
    </section>

    <!-- O que são -->
    <section class="section what" id="o-que-sao">
      <div class="container">
        <div class="head" arReveal>
          <p class="eyebrow">O que são as Rosinhas</p>
          <h2>Próteses mamárias artesanais, feitas com cuidado.</h2>
          <p class="lead">{{ about.intro }}</p>
        </div>
        <div class="trio">
          <article class="trio__card" arReveal>
            <span class="trio__icon"><ar-icon name="feather" size="26" /></span>
            <h3>Feitas com</h3>
            <ul>
              @for (m of about.materials; track m) {
                <li><ar-icon name="check" size="18" />{{ m }}</li>
              }
            </ul>
          </article>
          <article class="trio__card" arReveal>
            <span class="trio__icon"><ar-icon name="sparkles" size="26" /></span>
            <h3>Características</h3>
            <ul>
              @for (t of about.traits; track t) {
                <li><ar-icon name="check" size="18" />{{ t }}</li>
              }
            </ul>
          </article>
          <article class="trio__card" arReveal>
            <span class="trio__icon"><ar-icon name="scale" size="26" /></span>
            <h3>Proporcionam</h3>
            <ul>
              @for (b of about.benefits; track b) {
                <li><ar-icon name="check" size="18" />{{ b }}</li>
              }
            </ul>
          </article>
        </div>
      </div>
    </section>

    <!-- Citação da missão -->
    <section class="quote">
      <div class="container quote__in" arReveal>
        <img src="brand/rosa.png" alt="" width="84" height="81" loading="lazy" />
        <blockquote>
          <p>
            “Oferecer próteses mamárias artesanais, provisórias ou não, a todas as mulheres que
            necessitem.”
          </p>
        </blockquote>
        <p class="quote__by">{{ about.family }}</p>
      </div>
    </section>

    <!-- Como ajudar -->
    <section class="section help" id="ajudar">
      <div class="container">
        <div class="head head--center" arReveal>
          <h2>Como ajudar: cada gesto envia mais Rosinhas.</h2>
          <p class="lead">
            As Rosinhas são enviadas gratuitamente a todas as mulheres que nos procuram. É com a
            ajuda de sócias, sócios e amigos que isso é possível.
          </p>
        </div>
        <div class="ways">
          <a class="way" routerLink="/ajudar/socia" arReveal>
            <span class="way__icon"><ar-icon name="users" size="28" /></span>
            <h3>Ser sócia</h3>
            <p>
              A quota anual permite enviar gratuitamente mais Rosinhas a todas as mulheres que nos
              procuram.
            </p>
            <span class="way__price"
              ><strong>{{ org.annualFee }} €</strong> por ano</span
            >
            <span class="way__go">Quero ser sócia <ar-icon name="arrow" size="18" /></span>
          </a>
          <a class="way" routerLink="/ajudar/donativo" arReveal>
            <span class="way__icon"><ar-icon name="heart" size="28" /></span>
            <h3>Fazer um donativo</h3>
            <p>
              Ajuda As Rosinhas com uma doação ou uma contribuição para a campanha de angariação de
              fundos.
            </p>
            <span class="way__price"><strong>Qualquer valor</strong> conta</span>
            <span class="way__go">Fazer um donativo <ar-icon name="arrow" size="18" /></span>
          </a>
          <a class="way" routerLink="/loja" arReveal>
            <span class="way__icon"><ar-icon name="bag" size="28" /></span>
            <h3>Comprar na loja solidária</h3>
            <p>
              Soutiens para prótese e merchandising: cada compra ajuda a continuar a enviar
              Rosinhas.
            </p>
            <span class="way__price"><strong>Desde 7 €</strong></span>
            <span class="way__go">Ver a loja <ar-icon name="arrow" size="18" /></span>
          </a>
        </div>
      </div>
    </section>

    <!-- Soutiens Simel -->
    <section class="section bras">
      <div class="container bras__grid">
        <div class="bras__text" arReveal>
          <p class="eyebrow">Parceria Simel</p>
          <h2>Soutiens pensados para quem usa a Rosinha.</h2>
          <p>
            As Rosinhas em parceria com a marca portuguesa <strong>Simel</strong> lançaram soutiens
            para todas as Mulheres, pensando principalmente na Mulher mastectomizada que usa a
            Rosinha.
          </p>
          <ul class="bras__tri">
            <li>Super confortáveis</li>
            <li>Lindos de viver</li>
            <li>Acessíveis a todas</li>
          </ul>
          <a routerLink="/loja" class="btn btn--primary"
            >Ver os soutiens <ar-icon name="arrow" size="18"
          /></a>
        </div>
        <div class="bras__list">
          @for (p of featured; track p.slug) {
            <ar-product-card [product]="p" arReveal />
          }
        </div>
      </div>
    </section>

    <!-- Eventos -->
    <section class="section events">
      <div class="container">
        <div class="head head--row" arReveal>
          <h2>Eventos que nos juntam.</h2>
          <a routerLink="/eventos" class="btn btn--ghost"
            >Todos os eventos <ar-icon name="arrow" size="18"
          /></a>
        </div>
        <div class="ev">
          @for (e of events; track e.slug; let i = $index) {
            <a
              class="ev__card"
              [class.ev__card--big]="i === 0"
              routerLink="/eventos"
              [fragment]="e.slug"
              arReveal
            >
              <img [src]="e.image" [alt]="e.imageAlt" loading="lazy" width="720" height="1000" />
              <div class="ev__body">
                <span class="ev__kicker">{{ e.kicker }}</span>
                <h3>{{ e.title }}</h3>
              </div>
            </a>
          }
        </div>
      </div>
    </section>

    <!-- Parceiros e voluntárias -->
    <section class="section partners">
      <div class="container">
        <div class="head head--center" arReveal>
          <h2>Parceiros e voluntárias</h2>
        </div>
        <ul class="partners__list">
          @for (p of partners; track p.name) {
            <li arReveal>
              <strong>{{ p.name }}</strong>
              <span>{{ p.text }}</span>
            </li>
          }
        </ul>
      </div>
    </section>

    <!-- Precisa de uma Rosinha -->
    <section class="need">
      <div class="container need__in" arReveal>
        <div>
          <h2>Precisas de uma Rosinha?</h2>
          <p>
            Fala connosco. Enviamos as Rosinhas gratuitamente a todas as mulheres que nos procuram.
          </p>
        </div>
        <div class="need__cta">
          <a
            class="btn btn--light"
            [href]="'mailto:' + org.email + '?subject=Pedido%20de%20uma%20Rosinha'"
            ><ar-icon name="mail" size="18" />Enviar email</a
          >
          <a class="btn btn--outline-light" [href]="org.instagram" rel="noopener"
            ><ar-icon name="instagram" size="18" />Instagram</a
          >
        </div>
      </div>
    </section>
  `,
  styleUrl: './home.page.scss',
})
export class HomePage {
  protected readonly org = ORG;
  protected readonly about = ABOUT;
  protected readonly events = EVENTS;
  protected readonly partners = PARTNERS;
  protected readonly featured = [SOUTIENS[0], SOUTIENS[2]];

  constructor() {
    inject(SeoService).set({
      title: ORG.name,
      description:
        'As Rosinhas: projeto familiar sem fins lucrativos que oferece próteses mamárias artesanais a todas as mulheres que precisam. Torna-te sócia, faz um donativo ou compra na loja solidária.',
      image: 'img/eventos/catamaran-grupo.webp',
    });
  }
}
