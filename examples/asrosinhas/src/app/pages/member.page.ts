import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ORG } from '../core/content';
import { SeoService } from '../core/seo.service';
import { AddressFieldsComponent } from '../shared/address-fields.component';
import { DemoForm } from '../shared/demo-form';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { SentNoticeComponent } from '../shared/sent-notice.component';

@Component({
  selector: 'ar-member',
  imports: [IconComponent, AddressFieldsComponent, PageHeadComponent, SentNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      eyebrow="Ser sócia ou sócio"
      title="Junta-te às Rosinhas."
      lead="A quota anual permite enviar gratuitamente mais Rosinhas a todas as mulheres que nos procuram."
      [crumbs]="[{ label: 'Ajudar', link: '/ajudar' }, { label: 'Ser sócia' }]"
    />
    <section class="section split">
      <div class="container split__grid">
        <aside class="summary">
          <p class="eyebrow">Quota anual</p>
          <p class="fee">
            <strong>{{ org.annualFee }} €</strong> / ano
          </p>
          <ul>
            <li><ar-icon name="check" size="18" />Mais Rosinhas enviadas gratuitamente</li>
            <li><ar-icon name="check" size="18" />Notícias dos eventos e campanhas</li>
            <li><ar-icon name="check" size="18" />Recibo para o IRS com o teu NIF</li>
          </ul>
          <p class="small">
            Depois da inscrição recebes por email os dados para pagamento por transferência.
          </p>
        </aside>
        <div class="card formcard">
          @if (form.sent()) {
            <ar-sent-notice
              title="Obrigada por te juntares!"
              text="Vais receber por email os dados para pagares a quota anual."
            />
          } @else {
            <form (submit)="form.submit($event)" novalidate>
              <div class="form-grid">
                <div class="field wide">
                  <label for="nome">Nome completo</label>
                  <input id="nome" name="nome" autocomplete="name" required />
                </div>
                <div class="field">
                  <label for="sexo">Sexo</label>
                  <select id="sexo" name="sexo" required>
                    <option value="">Escolher</option>
                    <option>Feminino</option>
                    <option>Masculino</option>
                    <option>Prefiro não dizer</option>
                  </select>
                </div>
                <div class="field">
                  <label for="nasc">Data de nascimento</label>
                  <input id="nasc" name="nascimento" type="date" autocomplete="bday" required />
                </div>
                <div class="field">
                  <label for="email">Email</label>
                  <input id="email" name="email" type="email" autocomplete="email" required />
                </div>
                <div class="field">
                  <label for="tel">Telemóvel</label>
                  <input
                    id="tel"
                    name="telemovel"
                    type="tel"
                    autocomplete="tel"
                    inputmode="tel"
                    pattern="(\\+351)?\\s?9\\d{8}"
                    placeholder="912 345 678"
                    required
                  />
                </div>
                <ar-address-fields />
              </div>
              <button class="btn btn--primary btn--block" type="submit">
                <ar-icon name="heart" size="18" />Tornar-me sócia · {{ org.annualFee }} €/ano
              </button>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './form-page.scss',
})
export class MemberPage {
  protected readonly org = ORG;
  protected readonly form = new DemoForm();
  constructor() {
    inject(SeoService).set({
      title: 'Ser sócia',
      description: `Torna-te sócia d’As Rosinhas por ${ORG.annualFee} € por ano.`,
    });
  }
}
