import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService } from '../core/services/content.service';
import { IconComponent } from './icon.component';

/**
 * Aviso para funcionalidades que ainda não gravam no servidor (modo API):
 * em vez de um formulário que não faz nada, indica como tratar com a secretaria.
 */
@Component({
  selector: 'sfc-offline-notice',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="alert alert--info notice" role="note">
      <sfc-icon name="info" size="20" />
      <div>
        <p><strong>{{ title() }}</strong></p>
        <p>{{ text() }}</p>
        <p>
          <a [href]="'mailto:' + club.email">{{ club.email }}</a> ·
          <a [href]="'tel:' + tel">{{ club.phone }}</a> ·
          <a routerLink="/contactos">Contactos e horários</a>
        </p>
      </div>
    </div>
  `,
  styles: `
    .notice {
      text-align: left;
    }
    .notice p {
      margin: 0 0 0.35rem;
    }
    .notice p:last-child {
      margin-bottom: 0;
    }
  `,
})
export class OfflineNoticeComponent {
  readonly title = input('Trata disto com a secretaria');
  readonly text = input('Este pedido ainda não pode ser feito pelo site. Fala connosco por email, telefone ou no secretariado.');
  protected readonly club = inject(ContentService).club;
  protected readonly tel = this.club.phone.replace(/\s/g, '');
}
