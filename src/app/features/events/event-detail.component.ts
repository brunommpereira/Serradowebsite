import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { nifValidator, PHONE_PATTERN } from '../../core/validators';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';
import { CapitalizePipe } from '../../shared/capitalize.pipe';
import { QrCodeComponent } from '../../shared/qr-code.component';
import { PaymentMethod, PaymentStepComponent } from '../../shared/payment-step.component';
import { NotFoundComponent } from '../not-found/not-found.component';

type Step = 'form' | 'payment' | 'done';

@Component({
  selector: 'sfc-event-detail',
  imports: [CapitalizePipe, RouterLink, DatePipe, CurrencyPipe, ReactiveFormsModule, PageHeroComponent, IconComponent, QrCodeComponent, PaymentStepComponent, NotFoundComponent],
  templateUrl: './event-detail.component.html',
  styleUrl: './event-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailComponent {
  readonly slug = input.required<string>();
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);

  protected readonly event = computed(() => this.content.event(this.slug()));
  protected readonly spotsLeft = computed(() => {
    const e = this.event();
    return e ? Math.max(0, e.capacity - e.registered) : 0;
  });
  protected readonly sports = this.content.sports();

  protected readonly step = signal<Step>('form');
  protected readonly registration = signal<{ number: string; method?: PaymentMethod } | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    nif: ['', nifValidator()],
    birthDate: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    isMember: [false],
    memberNumber: [''],
    sport: [''],
    shirtSize: [''],
    consentData: [false, Validators.requiredTrue],
    consentImage: [false],
  });

  protected readonly price = computed(() => {
    const e = this.event();
    if (!e) return 0;
    return this.isMember() && e.memberPrice !== undefined ? e.memberPrice : e.price;
  });
  protected readonly isMember = signal(false);

  constructor() {
    effect(() => {
      const e = this.event();
      if (e) this.seo.set({ title: e.title, description: e.summary, path: `/eventos/${e.slug}` });
    });
    this.form.controls.isMember.valueChanges.subscribe((v) => this.isMember.set(v));
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  submit() {
    const e = this.event();
    if (!e) return;
    if (e.askShirtSize) this.form.controls.shirtSize.addValidators(Validators.required);
    this.form.controls.shirtSize.updateValueAndValidity();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Fase 5: POST /api/events/{id}/registrations
    const number = `EV${e.id}-${Date.now().toString().slice(-6)}`;
    this.registration.set({ number });
    this.step.set(this.price() > 0 ? 'payment' : 'done');
    scrollToForm();
  }

  onPaid(method: PaymentMethod) {
    this.registration.update((r) => (r ? { ...r, method } : r));
    this.step.set('done');
    scrollToForm();
  }
}

function scrollToForm() {
  if (typeof document !== 'undefined') document.getElementById('inscricao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
