import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

const SUBJECTS = ['Informações gerais', 'Inscrição numa modalidade', 'Ser sócio', 'Parcerias e patrocínios', 'Voluntariado', 'Encomendas', 'Outro'];

@Component({
  selector: 'sfc-contacts',
  imports: [ReactiveFormsModule, RouterLink, PageHeroComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Contactos" title="Fala connosco" subtitle="Estamos no Bairro do Serrado, na Caparica." [crumbs]="[{ label: 'Contactos' }]" />
    <section class="section">
      <div class="container split">
        <div class="stack">
          <ul class="info">
            <li><sfc-icon name="pin" /><span><strong>Morada</strong>{{ club.name }}<br />{{ club.address }}<br />{{ club.postalCode }} {{ club.locality }}</span></li>
            <li><sfc-icon name="phone" /><span><strong>Telefone</strong><a [href]="'tel:' + club.phone.replace(' ', '')">{{ club.phone }}</a></span></li>
            <li><sfc-icon name="mail" /><span><strong>Email</strong><a [href]="'mailto:' + club.email">{{ club.email }}</a></span></li>
          </ul>
          <div>
            <h2 class="h-s">Horários da secretaria</h2>
            <table class="table hours">
              <tbody>
                @for (h of club.hours; track h.days) {
                  <tr><th scope="row">{{ h.days }}</th><td>{{ h.time }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div>
            <h2 class="h-s">Redes sociais</h2>
            <p class="social">
              <a [href]="club.social.facebook" target="_blank" rel="noopener"><sfc-icon name="facebook" />Facebook</a>
              <a [href]="club.social.instagram" target="_blank" rel="noopener"><sfc-icon name="instagram" />Instagram</a>
              <a [href]="club.social.youtube" target="_blank" rel="noopener"><sfc-icon name="youtube" />YouTube</a>
            </p>
          </div>
        </div>

        @if (sent()) {
          <p class="alert alert--success" role="status">Mensagem enviada! Respondemos normalmente em 2 dias úteis.</p>
        } @else {
          <form class="form card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <h2 class="h-s">Envia-nos uma mensagem</h2>
            <div class="field">
              <label for="c-name">Nome <span class="req">*</span></label>
              <input id="c-name" formControlName="name" autocomplete="name" />
              @if (invalid('name')) {
                <span class="error">Indica o teu nome.</span>
              }
            </div>
            <div class="field">
              <label for="c-email">Email <span class="req">*</span></label>
              <input id="c-email" type="email" formControlName="email" autocomplete="email" />
              @if (invalid('email')) {
                <span class="error">Email inválido.</span>
              }
            </div>
            <div class="field">
              <label for="c-subject">Assunto</label>
              <select id="c-subject" formControlName="subject">
                @for (s of subjects; track s) {
                  <option>{{ s }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="c-msg">Mensagem <span class="req">*</span></label>
              <textarea id="c-msg" formControlName="message" rows="5"></textarea>
              @if (invalid('message')) {
                <span class="error">Escreve a tua mensagem.</span>
              }
            </div>
            <label class="check">
              <input type="checkbox" formControlName="consent" />
              <span>Autorizo o tratamento dos dados para resposta (<a routerLink="/privacidade">Política de Privacidade</a>). <span class="req">*</span></span>
            </label>
            @if (invalid('consent')) {
              <span class="field"><span class="error">Consentimento obrigatório.</span></span>
            }
            <button class="btn btn--primary" type="submit">Enviar mensagem</button>
          </form>
        }
      </div>
    </section>
    <section class="map" aria-label="Mapa">
      <iframe [src]="mapUrl" title="Mapa — Bairro do Serrado, Caparica" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    </section>
  `,
  styles: `
    .info { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2rem; li { display: flex; gap: 0.9rem; } span { display: grid; } strong { font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-muted); } sfc-icon { flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; background: var(--sfc-blue); color: var(--sfc-yellow); } }
    .hours { max-width: 440px; th { background: none; text-transform: none; letter-spacing: 0; font-size: 0.94rem; color: var(--color-text); padding-left: 0; } td { white-space: normal; } }
    .social { display: flex; flex-wrap: wrap; gap: 1rem; a { display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 600; } }
    .stack > * + * { margin-top: 2.2rem; }
    .map { line-height: 0; iframe { width: 100%; height: 420px; border: 0; } }
  `,
})
export class ContactsComponent {
  /** ?assunto= pré-preenche o assunto */
  readonly assunto = input<string>();
  protected readonly club = inject(ContentService).club;
  protected readonly subjects = SUBJECTS;
  protected readonly sent = signal(false);
  // URL fixo do OpenStreetMap (sem dados do utilizador).
  protected readonly mapUrl = inject(DomSanitizer).bypassSecurityTrustResourceUrl(
    `https://www.openstreetmap.org/export/embed.html?bbox=-9.215%2C38.645%2C-9.185%2C38.665&layer=mapnik&marker=${this.club.map.lat}%2C${this.club.map.lng}`,
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    subject: [SUBJECTS[0]],
    message: ['', Validators.required],
    consent: [false, Validators.requiredTrue],
  });

  constructor() {
    inject(SeoService).set({
      title: 'Contactos',
      description: 'Contactos do Serrado FC: morada no Bairro do Serrado (Caparica), telefone, email, horários, redes sociais e mapa.',
      path: '/contactos',
    });
    effect(() => {
      const a = this.assunto();
      const match = a && SUBJECTS.find((s) => s.toLowerCase().includes(a.toLowerCase()));
      if (match) this.form.controls.subject.setValue(match);
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
    // POST /api/contact
    this.sent.set(true);
  }
}
