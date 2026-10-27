import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../core/seo.service';

@Component({
  selector: 'ar-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="section nf">
      <div class="container">
        <img src="brand/rosa.png" alt="" width="120" height="116" />
        <h1>Esta página não existe.</h1>
        <p class="lead">
          Talvez o endereço tenha mudado. Começa pela página inicial ou vê a loja solidária.
        </p>
        <div class="cta">
          <a routerLink="/" class="btn btn--primary">Página inicial</a>
          <a routerLink="/loja" class="btn btn--ghost">Loja solidária</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .nf {
      text-align: center;
      img {
        margin: 0 auto 1.5rem;
      }
      .lead {
        margin-inline: auto;
      }
    }
    .cta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.8rem;
      justify-content: center;
      margin-top: 1.5rem;
    }
  `,
})
export class NotFoundPage {
  constructor() {
    inject(SeoService).set({
      title: 'Página não encontrada',
      description: 'Esta página não existe.',
    });
  }
}
