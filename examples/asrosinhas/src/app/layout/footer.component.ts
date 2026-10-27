import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ORG } from '../core/content';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'ar-footer',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="foot">
      <div class="container foot__grid">
        <div class="foot__brand">
          <img
            src="brand/logo-branco.png"
            alt="As Rosinhas"
            width="180"
            height="60"
            loading="lazy"
          />
          <p>
            Projeto familiar, sem fins lucrativos, que oferece próteses mamárias artesanais a todas
            as mulheres que precisam. Desde {{ org.since }}.
          </p>
          <div class="social">
            <a [href]="org.instagram" rel="noopener" aria-label="Instagram d’As Rosinhas"
              ><ar-icon name="instagram" size="20"
            /></a>
            <a [href]="org.facebook" rel="noopener" aria-label="Facebook d’As Rosinhas"
              ><ar-icon name="facebook" size="20"
            /></a>
            <a [href]="'mailto:' + org.email" aria-label="Enviar email"
              ><ar-icon name="mail" size="20"
            /></a>
          </div>
        </div>
        <nav aria-label="Associação">
          <h2>Associação</h2>
          <a routerLink="/sobre">O que são as Rosinhas</a>
          <a routerLink="/eventos">Eventos</a>
          <a routerLink="/contactos">Contactos</a>
        </nav>
        <nav aria-label="Ajudar">
          <h2>Ajudar</h2>
          <a routerLink="/ajudar/socia">Ser sócia</a>
          <a routerLink="/ajudar/donativo">Fazer um donativo</a>
          <a routerLink="/loja">Loja solidária</a>
        </nav>
        <div>
          <h2>Fala connosco</h2>
          <a [href]="'mailto:' + org.email">{{ org.email }}</a>
          <a [href]="org.instagram" rel="noopener">{{ org.instagramHandle }}</a>
        </div>
      </div>
      <div class="container foot__base">
        <span>© {{ year }} As Rosinhas</span>
        <span>Protótipo de redesign, feito com a mesma estrutura do site do Serrado FC.</span>
      </div>
    </footer>
  `,
  styles: `
    .foot {
      background: var(--color-band);
      color: #ead7de;
      padding-top: 4rem;
    }
    .foot__grid {
      display: grid;
      gap: 2.5rem;
      grid-template-columns: 1.6fr repeat(3, 1fr);
      @media (max-width: 860px) {
        grid-template-columns: 1fr 1fr;
      }
      @media (max-width: 520px) {
        grid-template-columns: 1fr;
      }
    }
    .foot__brand img {
      height: 52px;
      width: auto;
      margin-bottom: 1rem;
    }
    .foot__brand p {
      max-width: 36ch;
      font-size: 0.95rem;
    }
    h2 {
      font: 600 0.8rem/1 var(--font-body);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--rose-200);
      margin-bottom: 1.1rem;
    }
    nav a,
    div > a {
      display: block;
      color: #fff;
      text-decoration: none;
      padding: 0.6rem 0;
      overflow-wrap: anywhere;
    }
    nav a:hover,
    div > a:hover {
      color: var(--rose-200);
    }
    .social {
      display: flex;
      gap: 0.5rem;
      a {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgb(255 255 255 / 8%);
        color: #fff;
        transition: background-color 0.2s var(--ease);
      }
      a:hover {
        background: var(--rose-700);
      }
    }
    .foot__base {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.5rem 1.5rem;
      margin-top: 3rem;
      padding: 1.4rem 0 2rem;
      border-top: 1px solid rgb(255 255 255 / 12%);
      font-size: 0.85rem;
      color: #c8b1ba;
    }
  `,
})
export class FooterComponent {
  protected readonly org = ORG;
  protected readonly year = 2026;
}
