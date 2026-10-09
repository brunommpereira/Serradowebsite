import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { nifValidator, PHONE_PATTERN, POSTAL_CODE_PATTERN } from '../../core/validators';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';
import { PaymentMethod, PaymentStepComponent } from '../../shared/payment-step.component';
import { MemberSignupComponent } from '../signup/member-signup.component';
import { ApiClient } from '../../core/api/api-client';
import { MemberCardComponent } from '../../shared/member-card.component';
import { PasswordFieldComponent } from '../../shared/password-field.component';

type Step = 1 | 2 | 3 | 4;

/** Registo de sócio — fluxo da secção 49 (categoria → formulário → pagamento → confirmação). */

@Component({
  selector: 'sfc-register',
  imports: [RouterLink, CurrencyPipe, ReactiveFormsModule, PageHeroComponent, IconComponent, PasswordFieldComponent, PaymentStepComponent, MemberCardComponent, MemberSignupComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  /** Ligado ao servidor: registo com documentos e assinatura (MemberSignupComponent) */
  protected readonly apiMode = inject(ApiClient).enabled;
  /** ?categoria= pré-seleciona a categoria */
  readonly categoria = input<string>();
  private readonly content = inject(ContentService);

  protected readonly categories = this.content.membershipCategories();
  protected readonly category = linkedSignal(() => this.categories.find((c) => c.id === this.categoria())?.id ?? 'senior');
  protected readonly selected = computed(() => this.categories.find((c) => c.id === this.category())!);
  protected readonly period = signal<'monthly' | 'yearly'>('monthly');
  protected readonly amount = computed(() => (this.period() === 'monthly' ? this.selected().monthly : this.selected().yearly));

  protected readonly step = signal<Step>(1);
  protected readonly stepLabels = ['Categoria', 'Dados', 'Pagamento', 'Confirmação'];
  protected readonly result = signal<{ number: string; receipt: string; method: PaymentMethod } | null>(null);
  protected readonly year = new Date().getFullYear();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(5)]],
    birthDate: ['', Validators.required],
    nif: ['', [Validators.required, nifValidator()]],
    docType: ['Cartão de Cidadão', Validators.required],
    docNumber: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    address: ['', Validators.required],
    postalCode: ['', [Validators.required, Validators.pattern(POSTAL_CODE_PATTERN)]],
    locality: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    consentData: [false, Validators.requiredTrue],
    consentStatutes: [false, Validators.requiredTrue],
    consentComms: [false],
  });

  constructor() {
    inject(SeoService).set({
      title: 'Registo de Sócio',
      description: 'Torna-te sócio do Serrado FC online: escolhe a categoria, preenche os teus dados e recebe o teu cartão digital.',
      path: '/socios/registo',
    });
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  next() {
    if (this.step() === 2 && this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid();
      return;
    }
    this.go((this.step() + 1) as Step);
  }

  back() {
    this.go((this.step() - 1) as Step);
  }

  onPaid(method: PaymentMethod) {
    // Fase 2/3: POST /api/members → número de sócio; POST /api/membership/payments → recibo.
    const n = String(500 + Math.floor(Math.random() * 400)).padStart(5, '0');
    this.result.set({ number: n, receipt: `R${this.year}/${Math.floor(Math.random() * 9000 + 1000)}`, method });
    this.go(4);
  }

  private go(step: Step) {
    this.step.set(step);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function focusFirstInvalid() {
  if (typeof document === 'undefined') return;
  setTimeout(() => document.querySelector<HTMLElement>('form .ng-invalid:not(form)')?.focus());
}
