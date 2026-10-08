import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { ContentService } from '../../core/services/content.service';
import { ApiClient } from '../../core/api/api-client';

@Component({
  selector: 'sfc-footer',
  imports: [RouterLink, IconComponent, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './footer.component.scss',
  template: `
    @if (!apiMode) {
    <section class="newsletter">
      <div class="container newsletter__inner">
        <div>
          <p class="newsletter__title">Recebe as novidades do Serrado FC</p>
          <p class="newsletter__text">Notícias, jogos e eventos, uma vez por mês no teu email.</p>
        </div>
        @if (subscribed()) {
          <p class="alert alert--success" role="status">Obrigado! Vais receber um email para confirmar a subscrição.</p>
        } @else {
          <form class="newsletter__form" (ngSubmit)="f.valid && subscribe()" #f="ngForm" novalidate>
            <label for="nl-email" class="visually-hidden">Email</label>
            <input id="nl-email" name="email" type="email" required email placeholder="O teu email" [(ngModel)]="email" autocomplete="email" />
            <button class="btn btn--accent" type="submit">Subscrever</button>
          </form>
          @if (f.submitted && f.invalid) {
            <p class="newsletter__error" role="alert">Indica um email válido.</p>
          }
        }
      </div>
    </section>
    }

    <footer class="footer">
      <div class="container footer__grid">
        <div class="footer__brand">
          <img src="brand/logo-white.svg" alt="Serrado FC" width="120" height="134" loading="lazy" />
          <p>{{ club.tagline }}</p>
          <div class="footer__social">
            <a [href]="club.social.facebook" target="_blank" rel="noopener" aria-label="Facebook"><sfc-icon name="facebook" size="20" /></a>
            <a [href]="club.social.instagram" target="_blank" rel="noopener" aria-label="Instagram"><sfc-icon name="instagram" size="20" /></a>
            <a [href]="club.social.youtube" target="_blank" rel="noopener" aria-label="YouTube"><sfc-icon name="youtube" size="20" /></a>
          </div>
        </div>
        <nav aria-label="Clube">
          <p class="footer__title">Clube</p>
          <a routerLink="/clube">O Serrado FC</a>
          <a routerLink="/clube" fragment="historia">História</a>
          <a routerLink="/clube" fragment="orgaos-sociais">Órgãos Sociais</a>
          <a routerLink="/clube" fragment="transparencia">Transparência</a>
          <a routerLink="/comunidade">Comunidade</a>
          <a routerLink="/parceiros">Parceiros</a>
        </nav>
        <nav aria-label="Desporto">
          <p class="footer__title">Desporto</p>
          <a routerLink="/modalidades/atletismo">Atletismo</a>
          <a routerLink="/modalidades/futsal">Futsal</a>
          <a href="https://almadarugby.pt/" target="_blank" rel="noopener" class="footer__ext">
            Rugby <sfc-icon name="external" size="14" /><span class="visually-hidden">(Almada Rugby, abre numa nova janela)</span>
          </a>
          <a routerLink="/agenda">Agenda</a>
          <a routerLink="/resultados">Resultados</a>
          <a routerLink="/multimedia">Multimédia</a>
        </nav>
        <nav aria-label="Sócios">
          <p class="footer__title">Sócios</p>
          <a routerLink="/socios">Ser Sócio</a>
          <a routerLink="/socios/registo">Registo</a>
          <a routerLink="/area-socio">Área de Sócio</a>
          <a routerLink="/area-atletas">Área de Atletas</a>
          <a routerLink="/eventos">Eventos</a>
          <a routerLink="/loja">Loja</a>
        </nav>
        <address>
          <p class="footer__title">Contactos</p>
          <span>{{ club.address }}<br />{{ club.postalCode }} {{ club.locality }}</span>
          <a [href]="'tel:' + club.phone.replace(' ', '')">{{ club.phone }}</a>
          <a [href]="'mailto:' + club.email">{{ club.email }}</a>
          <a routerLink="/contactos" class="footer__more">Horários e mapa →</a>
        </address>
      </div>
      <div class="container footer__bottom">
        <p>© {{ year }} {{ club.name }} · Fundado a 29.04.1978 · NIPC {{ club.nipc }}</p>
        <p class="footer__legal">
          <a routerLink="/privacidade">Política de Privacidade</a>
          <a routerLink="/cookies">Política de Cookies</a>
          <a routerLink="/contactos">Contactos</a>
        </p>
      </div>
    </footer>
  `,
})
export class FooterComponent {
  /** Ligado ao servidor: a newsletter ainda não tem serviço de envio, por isso não aparece */
  protected readonly apiMode = inject(ApiClient).enabled;
  protected readonly club = inject(ContentService).club;
  protected readonly year = new Date().getFullYear();
  protected email = '';
  protected readonly subscribed = signal(false);

  subscribe() {
    // Fase 6: POST /api/newsletter/subscriptions com dupla confirmação (RGPD).
    this.subscribed.set(true);
  }
}
