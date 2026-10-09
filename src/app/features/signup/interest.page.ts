import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api/api-client';
import { PHONE_PATTERN } from '../../core/validators';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { PageHeroComponent } from '../../shared/page-hero.component';

const SPORTS: { slug: string; label: string }[] = [
  { slug: 'futsal', label: 'Escola de Futsal' },
  { slug: 'escola-de-desporto', label: 'Escola de Desporto (4 aos 8 anos)' },
  { slug: 'rugby', label: 'Escola de Rugby' },
  { slug: 'atletismo', label: 'Atletismo' },
  { slug: 'formacao', label: 'Formação' },
];

/**
 * /pre-inscricao — os pais deixam os contactos para o clube ligar (ainda não é a inscrição de atleta).
 * ?modalidade=futsal pré-escolhe a modalidade. A secretaria acompanha em Backoffice → Pré-inscrições.
 */
@Component({
  selector: 'sfc-interest-page',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './signup.scss',
  template: `
    <sfc-page-hero
      eyebrow="Escolas"
      title="Pré-inscrição"
      subtitle="Deixa os teus contactos e o clube liga-te para combinar um treino de experiência."
      [crumbs]="[{ label: 'Pré-inscrição' }]"
    />
    <section class="section">
      <div class="container narrow">
        @if (done()) {
          <div class="card done" role="status">
            <sfc-icon name="check" size="40" />
            <h2>Pré-inscrição recebida!</h2>
            <p>Obrigado. Vamos contactar-te em breve para combinar o primeiro treino.</p>
            @if (apiMode) {
              <p class="caption">
                Enviámos uma confirmação para <strong>{{ sentTo() }}</strong> (vê também a pasta de
                spam).
              </p>
            } @else {
              <p class="caption">Site de demonstração: o pedido não foi gravado.</p>
            }
            <a class="btn btn--primary" routerLink="/">Voltar ao início</a>
          </div>
        } @else {
          <form class="signup card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <p class="intro">
              Ainda não é a inscrição de atleta: é só para o clube te contactar. A inscrição
              completa faz-se depois, com a ajuda do treinador.
            </p>

            <h2 class="h-s">1. Criança</h2>
            <div class="grid">
              <div class="field wide">
                <label for="in-child">Nome da criança <span class="req">*</span></label>
                <input
                  id="in-child"
                  formControlName="childName"
                  autocomplete="off"
                  maxlength="160"
                />
              </div>
              <div class="field">
                <label for="in-birth">Data de nascimento</label>
                <input id="in-birth" type="date" formControlName="birthDate" [max]="today" />
              </div>
              <div class="field">
                <label for="in-sport">Modalidade <span class="req">*</span></label>
                <select id="in-sport" formControlName="sport">
                  @for (s of sports; track s.slug) {
                    <option [value]="s.slug">{{ s.label }}</option>
                  }
                </select>
              </div>
            </div>

            <h2 class="h-s">2. Encarregado de educação</h2>
            <div class="grid">
              <div class="field wide">
                <label for="in-guardian">Nome <span class="req">*</span></label>
                <input
                  id="in-guardian"
                  formControlName="guardianName"
                  autocomplete="name"
                  maxlength="160"
                />
              </div>
              <div class="field">
                <label for="in-phone">Telemóvel <span class="req">*</span></label>
                <input
                  id="in-phone"
                  type="tel"
                  formControlName="phone"
                  autocomplete="tel"
                  inputmode="tel"
                />
              </div>
              <div class="field">
                <label for="in-email">Email <span class="req">*</span></label>
                <input id="in-email" type="email" formControlName="email" autocomplete="email" />
              </div>
              <div class="field wide">
                <label for="in-notes">Observações</label>
                <textarea
                  id="in-notes"
                  formControlName="notes"
                  rows="3"
                  maxlength="1000"
                  placeholder="Ex.: melhores dias ou horas para ligarmos, experiência anterior…"
                ></textarea>
              </div>
            </div>

            <!-- Armadilha para robôs: invisível para as pessoas -->
            <div class="hp" aria-hidden="true">
              <label for="in-website">Site</label>
              <input id="in-website" formControlName="website" tabindex="-1" autocomplete="off" />
            </div>

            <label class="check consent">
              <input type="checkbox" formControlName="consent" />
              <span
                >Autorizo o Serrado FC a guardar estes dados e a contactar-me sobre esta
                pré-inscrição, de acordo com a
                <a routerLink="/privacidade" target="_blank">política de privacidade</a>.
                <span class="req">*</span></span
              >
            </label>

            @if (error(); as e) {
              <p class="alert alert--warning" role="alert">{{ e }}</p>
            }
            <button class="btn btn--primary btn--block" type="submit" [disabled]="busy()">
              {{ busy() ? 'A enviar…' : 'Enviar pré-inscrição' }}
            </button>
          </form>
        }
      </div>
    </section>
  `,
  styles: `
    .narrow {
      max-width: 820px;
    }
    .intro {
      margin: 0 0 0.6rem;
      color: var(--color-muted);
    }
    .consent {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      margin-top: 1rem;
      input {
        margin-top: 0.25rem;
        width: 18px;
        height: 18px;
        flex: none;
      }
    }
  `,
})
export class InterestPage implements OnInit {
  readonly modalidade = input<string>();
  private readonly api = inject(ApiClient);
  protected readonly apiMode = this.api.enabled;
  protected readonly sports = SPORTS;
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly sentTo = signal('');
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    childName: ['', [Validators.required, Validators.minLength(3)]],
    birthDate: [''],
    sport: ['futsal'],
    guardianName: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    email: ['', [Validators.required, Validators.email]],
    notes: [''],
    website: [''],
    consent: [false, Validators.requiredTrue],
  });

  constructor() {
    inject(SeoService).set({
      title: 'Pré-inscrição',
      description:
        'Pré-inscrição nas escolas do Serrado FC (futsal, desporto, rugby): deixa os contactos e o clube liga-te.',
      path: '/pre-inscricao',
    });
  }

  ngOnInit() {
    // O aviso desaparece assim que se mexe no formulário
    this.form.valueChanges.subscribe(() => this.error() && this.error.set(null));
    const m = this.modalidade();
    if (m && SPORTS.some((s) => s.slug === m)) this.form.controls.sport.setValue(m);
  }

  async submit() {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const c = this.form.controls;
      this.error.set(
        c.consent.invalid
          ? 'Para enviarmos o pedido, autoriza o contacto (última caixa).'
          : c.phone.invalid
            ? 'Verifica o telemóvel (9 algarismos).'
            : c.email.invalid
              ? 'Verifica o email.'
              : 'Preenche o nome da criança e o do encarregado.',
      );
      return;
    }
    this.error.set(null);
    const v = this.form.getRawValue();
    if (!this.apiMode) {
      this.done.set(true);
      return;
    }
    this.busy.set(true);
    try {
      await this.api.post('/interest', {
        ...v,
        birthDate: v.birthDate || null,
        email: v.email.trim(),
        childName: v.childName.trim(),
        guardianName: v.guardianName.trim(),
      });
      this.sentTo.set(v.email.trim().toLowerCase());
      this.done.set(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
