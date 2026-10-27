import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ORG } from '../core/content';
import { SeoService } from '../core/seo.service';
import { DemoForm } from '../shared/demo-form';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { SentNoticeComponent } from '../shared/sent-notice.component';

@Component({
  selector: 'ar-contacts',
  imports: [IconComponent, PageHeadComponent, SentNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      eyebrow="Contactos"
      title="Fala connosco."
      lead="Precisas de uma Rosinha, queres ajudar ou tens uma pergunta sobre uma encomenda? Respondemos por email."
      [crumbs]="[{ label: 'Contactos' }]"
    />
    <section class="section">
      <div class="container grid">
        <div class="channels">
          <a class="ch" [href]="'mailto:' + org.email"
            ><ar-icon name="mail" size="24" /><span><strong>Email</strong>{{ org.email }}</span></a
          >
          <a class="ch" [href]="org.instagram" rel="noopener"
            ><ar-icon name="instagram" size="24" /><span
              ><strong>Instagram</strong>{{ org.instagramHandle }}</span
            ></a
          >
          <a class="ch" [href]="org.facebook" rel="noopener"
            ><ar-icon name="facebook" size="24" /><span
              ><strong>Facebook</strong>As Rosinhas</span
            ></a
          >
        </div>
        <div class="card formcard">
          @if (form.sent()) {
            <ar-sent-notice
              title="Mensagem recebida"
              text="Obrigada! Respondemos assim que possível."
            />
          } @else {
            <form (submit)="form.submit($event)" novalidate>
              <div class="form-grid">
                <div class="field">
                  <label for="nome">Nome</label>
                  <input id="nome" name="nome" autocomplete="name" required />
                </div>
                <div class="field">
                  <label for="email">Email</label>
                  <input id="email" name="email" type="email" autocomplete="email" required />
                </div>
                <div class="field wide">
                  <label for="assunto">Assunto</label>
                  <select id="assunto" name="assunto">
                    <option>Preciso de uma Rosinha</option>
                    <option>Quero ajudar ou ser voluntária</option>
                    <option>Encomenda da loja</option>
                    <option>Outro assunto</option>
                  </select>
                </div>
                <div class="field wide">
                  <label for="msg">Mensagem</label>
                  <textarea id="msg" name="mensagem" rows="5" required minlength="10"></textarea>
                </div>
              </div>
              <button class="btn btn--primary" type="submit">
                <ar-icon name="mail" size="18" />Enviar mensagem
              </button>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .grid {
      display: grid;
      gap: clamp(1.5rem, 4vw, 3rem);
      align-items: start;
    }
    @media (min-width: 900px) {
      .grid {
        grid-template-columns: 0.8fr 1.4fr;
      }
    }
    .channels {
      display: grid;
      gap: 0.9rem;
    }
    .ch {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.1rem 1.3rem;
      border-radius: var(--radius-m);
      background: #fff;
      color: inherit;
      text-decoration: none;
      box-shadow: var(--shadow-s);
      transition: box-shadow 0.2s var(--ease);
      ar-icon {
        color: var(--rose-700);
      }
      span {
        display: grid;
        overflow-wrap: anywhere;
      }
    }
    .ch:hover {
      box-shadow: var(--shadow-m);
    }
    .formcard {
      padding: clamp(1.3rem, 3vw, 2.2rem);
    }
    form {
      display: grid;
      gap: 1.4rem;
      justify-items: start;
    }
    .form-grid {
      width: 100%;
    }
    textarea {
      resize: vertical;
    }
  `,
})
export class ContactsPage {
  protected readonly org = ORG;
  protected readonly form = new DemoForm();
  constructor() {
    inject(SeoService).set({
      title: 'Contactos',
      description: `Contacta As Rosinhas: ${ORG.email}, Instagram e Facebook.`,
    });
  }
}
