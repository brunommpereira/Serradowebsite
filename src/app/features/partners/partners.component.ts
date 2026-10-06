import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PHONE_PATTERN } from '../../core/validators';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { SponsorCardComponent } from '../../shared/cards';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'sfc-partners',
  imports: [RouterLink, ReactiveFormsModule, PageHeroComponent, SponsorCardComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Parceiros"
      title="Patrocinadores e parceiros"
      subtitle="Empresas e instituições que acreditam no Serrado FC e na nossa comunidade."
      [crumbs]="[{ label: 'Parceiros' }]"
    />

    <section class="section">
      <div class="container">
        <div class="grid grid-3">
          @for (s of sponsors; track s.id) {
            <div class="partner">
              <sfc-sponsor-card [sponsor]="s" />
              <p class="caption">{{ s.description }}</p>
              @if (s.website) {
                <a [href]="s.website" target="_blank" rel="noopener" class="link-arrow">Website</a>
              }
            </div>
          }
        </div>
      </div>
    </section>

    <section class="section section--soft" id="torne-se-parceiro" aria-labelledby="h-why">
      <div class="container">
        <div class="section-head section-head--center">
          <div>
            <p class="eyebrow">Torne-se parceiro</p>
            <h2 id="h-why">Porque apoiar o Serrado FC?</h2>
          </div>
          <p>Associar a sua marca a um clube com quase 50 anos de história e centenas de famílias envolvidas.</p>
        </div>
        <ul class="why">
          @for (w of reasons; track w.title) {
            <li class="card">
              <span class="why__icon"><sfc-icon [name]="w.icon" size="26" /></span>
              <h3>{{ w.title }}</h3>
              <p>{{ w.text }}</p>
            </li>
          }
        </ul>

        <div class="split form-wrap">
          <div>
            <h2>Benefícios empresariais</h2>
            <ul class="checklist">
              <li>Logótipo no site, equipamentos e pavilhão</li>
              <li>Presença nas redes sociais e newsletter do clube</li>
              <li>Convites para jogos e eventos</li>
              <li>Ativações de marca em torneios e caminhadas</li>
              <li>Descontos exclusivos para os sócios (benefício para a sua empresa)</li>
              <li>Relatório anual de visibilidade</li>
            </ul>
          </div>
          @if (sent()) {
            <p class="alert alert--success" role="status">Obrigado pelo interesse! A Direção vai entrar em contacto brevemente.</p>
          } @else {
            <form class="form card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
              <h3>Quero ser parceiro</h3>
              <div class="field">
                <label for="p-company">Empresa <span class="req">*</span></label>
                <input id="p-company" formControlName="company" autocomplete="organization" />
                @if (invalid('company')) {
                  <span class="error">Obrigatório.</span>
                }
              </div>
              <div class="field">
                <label for="p-contact">Pessoa de contacto <span class="req">*</span></label>
                <input id="p-contact" formControlName="contact" autocomplete="name" />
                @if (invalid('contact')) {
                  <span class="error">Obrigatório.</span>
                }
              </div>
              <div class="form-row">
                <div class="field">
                  <label for="p-email">Email <span class="req">*</span></label>
                  <input id="p-email" type="email" formControlName="email" autocomplete="email" />
                  @if (invalid('email')) {
                    <span class="error">Email inválido.</span>
                  }
                </div>
                <div class="field">
                  <label for="p-phone">Telefone</label>
                  <input id="p-phone" type="tel" formControlName="phone" autocomplete="tel" />
                  @if (invalid('phone')) {
                    <span class="error">Telefone inválido.</span>
                  }
                </div>
              </div>
              <div class="field">
                <label for="p-type">Tipo de parceria</label>
                <select id="p-type" formControlName="type">
                  <option>Patrocínio principal</option>
                  <option>Patrocínio de modalidade</option>
                  <option>Patrocínio de evento</option>
                  <option>Parceria de benefícios para sócios</option>
                  <option>Apoio institucional / social</option>
                </select>
              </div>
              <div class="field">
                <label for="p-msg">Mensagem</label>
                <textarea id="p-msg" formControlName="message"></textarea>
              </div>
              <label class="check">
                <input type="checkbox" formControlName="consent" />
                <span>Autorizo o tratamento dos dados para resposta a este pedido (<a routerLink="/privacidade">Política de Privacidade</a>). <span class="req">*</span></span>
              </label>
              <button class="btn btn--primary" type="submit">Quero ser parceiro</button>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .partner { display: grid; gap: 0.6rem; align-content: start; p { margin: 0; } }
    .why { list-style: none; margin: 0 0 3.5rem; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); p { margin: 0; color: var(--color-muted); font-size: 0.93rem; } }
    .why__icon { display: inline-grid; place-items: center; width: 50px; height: 50px; border-radius: 12px; background: var(--sfc-blue); color: var(--sfc-yellow); margin-bottom: 0.8rem; }
    .form-wrap { align-items: start; }
  `,
})
export class PartnersComponent {
  protected readonly sponsors = inject(ContentService).sponsors();
  protected readonly sent = signal(false);
  protected readonly reasons = [
    { icon: 'star', title: 'Visibilidade', text: 'Presença em jogos, eventos, site e redes sociais.' },
    { icon: 'users', title: 'Comunidade', text: 'Proximidade com centenas de famílias da Caparica e Almada.' },
    { icon: 'trophy', title: 'Desporto', text: 'Três modalidades em competição e uma agenda cheia.' },
    { icon: 'school', title: 'Formação', text: 'Apoio direto à formação de crianças e jovens.' },
    { icon: 'heart', title: 'Responsabilidade social', text: 'Projetos solidários e de inclusão com impacto real.' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    company: ['', Validators.required],
    contact: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.pattern(PHONE_PATTERN)],
    type: ['Patrocínio principal'],
    message: [''],
    consent: [false, Validators.requiredTrue],
  });

  constructor() {
    inject(SeoService).set({
      title: 'Parceiros',
      description: 'Patrocinadores e parceiros do Serrado FC. Saiba porque apoiar o clube e torne-se parceiro.',
      path: '/parceiros',
    });
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sent.set(true);
  }
}
