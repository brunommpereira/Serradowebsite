import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PHONE_PATTERN } from '../../core/validators';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';
import { CapitalizePipe } from '../../shared/capitalize.pipe';
import { QrCodeComponent } from '../../shared/qr-code.component';
import { NotFoundComponent } from '../not-found/not-found.component';
import { ApiClient } from '../../core/api/api-client';

interface Availability {
  registered: number;
  capacity: number;
  open: boolean;
}

interface Registration {
  code: string;
  people: number;
  amount: number;
  email: string;
}

/**
 * /eventos/:slug — detalhe do evento e, se exigir inscrição, o formulário (POST /events/{slug}/registrations).
 * Uma inscrição pode ser para várias pessoas; o pagamento não é feito no site (o clube marca «pago» no backoffice).
 */
@Component({
  selector: 'sfc-event-detail',
  imports: [CapitalizePipe, RouterLink, DatePipe, CurrencyPipe, ReactiveFormsModule, PageHeroComponent, IconComponent, QrCodeComponent, NotFoundComponent],
  templateUrl: './event-detail.component.html',
  styleUrl: './event-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailComponent {
  private readonly api = inject(ApiClient);
  protected readonly apiMode = this.api.enabled;
  readonly slug = input.required<string>();
  private readonly content = inject(ContentService);
  private readonly seo = inject(SeoService);

  protected readonly event = computed(() => this.content.event(this.slug()));
  /** Vagas reais (no servidor); sem servidor, os dados de demonstração */
  protected readonly availability = signal<Availability | null>(null);
  protected readonly registered = computed(() => this.availability()?.registered ?? this.event()?.registered ?? 0);
  /** null = sem limite de lotação */
  protected readonly spotsLeft = computed(() => {
    const e = this.event();
    if (!e || !e.capacity) return null;
    return Math.max(0, e.capacity - this.registered());
  });
  protected readonly open = computed(() => {
    const e = this.event();
    if (!e?.registrationRequired) return false;
    const a = this.availability();
    if (a) return a.open;
    return this.spotsLeft() !== 0 && e.date > new Date().toISOString().slice(0, 16);
  });

  protected readonly peopleOptions = Array.from({ length: 10 }, (_, i) => i + 1);
  protected readonly shirtSizes = ['6A', '10A', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
  protected readonly sports = [
    { slug: 'atletismo', name: 'Atletismo' },
    { slug: 'futsal', name: 'Futsal' },
    { slug: 'rugby', name: 'Rugby' },
  ];

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly registration = signal<Registration | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    people: [1],
    isMember: [false],
    memberNumber: [''],
    sport: [''],
    shirtSize: [''],
    notes: [''],
    website: [''],
    consent: [false, Validators.requiredTrue],
    consentImage: [false],
  });

  protected readonly isMember = signal(false);
  protected readonly people = signal(1);
  protected readonly unitPrice = computed(() => {
    const e = this.event();
    if (!e) return 0;
    return this.isMember() && e.memberPrice != null ? e.memberPrice : e.price;
  });
  protected readonly total = computed(() => this.unitPrice() * this.people());

  constructor() {
    effect(() => {
      const e = this.event();
      if (e) this.seo.set({ title: e.title, description: e.summary, path: `/eventos/${e.slug}`, image: e.coverUrl });
    });
    effect(() => {
      const slug = this.slug();
      if (this.apiMode && this.event()?.registrationRequired) void this.loadAvailability(slug);
    });
    this.form.controls.isMember.valueChanges.subscribe((v) => this.isMember.set(v));
    this.form.controls.people.valueChanges.subscribe((v) => this.people.set(Number(v) || 1));
    this.form.valueChanges.subscribe(() => this.error() && this.error.set(null));
  }

  private async loadAvailability(slug: string) {
    try {
      this.availability.set(await this.api.get<Availability>(`/events/${encodeURIComponent(slug)}/availability`));
    } catch {
      // Sem resposta: fica com os dados do evento
    }
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  async submit() {
    const e = this.event();
    if (!e || this.busy()) return;
    const shirt = this.form.controls.shirtSize;
    if (e.askShirtSize) shirt.setValidators(Validators.required);
    shirt.updateValueAndValidity({ emitEvent: false });
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const c = this.form.controls;
      this.error.set(
        c.consent.invalid
          ? 'Para te inscreveres, autoriza o tratamento dos dados.'
          : c.phone.invalid
            ? 'Verifica o telemóvel (9 algarismos).'
            : c.email.invalid
              ? 'Verifica o email.'
              : 'Preenche os campos obrigatórios.',
      );
      return;
    }
    const v = this.form.getRawValue();
    const email = v.email.trim().toLowerCase();
    if (!this.apiMode) {
      // Site de demonstração: não grava
      this.registration.set({ code: `EV${e.id}-DEMO`, people: v.people, amount: this.total(), email });
      scrollToForm();
      return;
    }
    this.busy.set(true);
    try {
      const r = await this.api.post<Omit<Registration, 'email'>>(`/events/${encodeURIComponent(e.slug)}/registrations`, {
        name: v.name.trim(),
        email,
        phone: v.phone,
        people: Number(v.people),
        isMember: v.isMember,
        memberNumber: v.isMember ? v.memberNumber.trim() : '',
        sport: v.sport || null,
        shirtSize: e.askShirtSize ? v.shirtSize : null,
        notes: v.notes.trim(),
        consent: v.consent,
        consentImage: v.consentImage,
        website: v.website,
      });
      this.registration.set({ ...r, email });
      void this.loadAvailability(e.slug);
      scrollToForm();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

function scrollToForm() {
  if (typeof document !== 'undefined') document.getElementById('inscricao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
