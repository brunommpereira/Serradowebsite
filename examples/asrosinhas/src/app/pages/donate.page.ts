import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { euro } from '../core/content';
import { SeoService } from '../core/seo.service';
import { AddressFieldsComponent } from '../shared/address-fields.component';
import { DemoForm } from '../shared/demo-form';
import { IconComponent } from '../shared/icon.component';
import { PageHeadComponent } from '../shared/page-head.component';
import { SentNoticeComponent } from '../shared/sent-notice.component';

@Component({
  selector: 'ar-donate',
  imports: [IconComponent, AddressFieldsComponent, PageHeadComponent, SentNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ar-page-head
      title="Qualquer valor ajuda a enviar uma Rosinha."
      lead="Ajuda As Rosinhas com uma doação ou uma contribuição para a campanha de angariação de fundos."
      [crumbs]="[{ label: 'Ajudar', link: '/ajudar' }, { label: 'Donativo' }]"
    />
    <section class="section split">
      <div class="container split__grid">
        <aside class="summary">
          <p class="eyebrow">O teu donativo</p>
          <p class="fee">
            <strong>{{ amountLabel() }}</strong>
          </p>
          <ul>
            <li><ar-icon name="check" size="18" />Vai inteiro para o projeto</li>
            <li><ar-icon name="check" size="18" />As Rosinhas continuam gratuitas</li>
            <li><ar-icon name="check" size="18" />Recibo com o teu NIF, se quiseres</li>
          </ul>
          <p class="small">Depois de enviares recebes por email os dados para a transferência.</p>
        </aside>
        <div class="card formcard">
          @if (form.sent()) {
            <ar-sent-notice
              title="Muito obrigada!"
              [text]="'Vais receber por email os dados para transferires ' + amountLabel() + '.'"
            />
          } @else {
            <form
              (submit)="form.submit($event)"
              (focusout)="form.blur($event)"
              (input)="form.input($event)"
              novalidate
            >
              <fieldset>
                <legend>Valor</legend>
                <div class="chips">
                  @for (v of presets; track v) {
                    <button
                      type="button"
                      class="chip"
                      [attr.aria-pressed]="amount() === v"
                      (click)="pick(v)"
                    >
                      {{ v }} €
                    </button>
                  }
                </div>
                <div class="field other">
                  <label for="valor">Outro valor (€)</label>
                  <input
                    id="valor"
                    name="valor"
                    type="number"
                    min="1"
                    step="1"
                    inputmode="numeric"
                    [value]="custom()"
                    (input)="setAmount($event)"
                    [required]="amount() === null"
                  />
                </div>
              </fieldset>
              <div class="form-grid">
                <div class="field">
                  <label for="nome">Nome</label>
                  <input id="nome" name="nome" autocomplete="name" required />
                </div>
                <div class="field">
                  <label for="email">Email</label>
                  <input id="email" name="email" type="email" autocomplete="email" required />
                </div>
                <ar-address-fields />
              </div>
              <button class="btn btn--primary btn--block" type="submit">
                <ar-icon name="gift" size="18" />Doar {{ amountLabel() }}
              </button>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styleUrl: './form-page.scss',
})
export class DonatePage {
  protected readonly presets = [10, 25, 50, 100];
  protected readonly amount = signal<number | null>(25);
  protected readonly amountLabel = computed(() =>
    this.amount() ? euro(this.amount()!) : 'um valor à escolha',
  );
  protected readonly form = new DemoForm();

  /** «Outro valor» só tem o que a pessoa escreveu; escolher um valor rápido limpa-o */
  protected readonly custom = signal('');

  protected pick(v: number) {
    this.amount.set(v);
    this.custom.set('');
    this.form.recheck('valor');
  }

  protected setAmount(ev: Event) {
    const raw = (ev.target as HTMLInputElement).value;
    this.custom.set(raw);
    const v = Number(raw);
    this.amount.set(raw && v > 0 ? v : null);
  }

  constructor() {
    inject(SeoService).set({
      title: 'Donativo',
      description:
        'Faz um donativo às Rosinhas e ajuda a enviar próteses mamárias artesanais gratuitamente.',
    });
  }
}
