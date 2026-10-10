import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { nifValidator, PHONE_PATTERN, POSTAL_CODE_PATTERN } from '../../core/validators';
import { IconComponent } from '../../shared/icon.component';
import { OfflineNoticeComponent } from '../../shared/offline-notice.component';
import { SignaturePadComponent } from '../../shared/signature-pad.component';
import { LegalAcceptComponent } from './legal-accept.component';
import { SignupForm, SignupResult, SignupService } from './signup.service';

/**
 * Registo de sócio online (modo API): dados, condições de admissão, RGPD, autorização de imagem
 * (facultativa) e assinatura desenhada. É uma proposta: fica pendente até a secretaria aceitar (Backoffice → Propostas).
 */
@Component({
  selector: 'sfc-member-signup',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, OfflineNoticeComponent, SignaturePadComponent, LegalAcceptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (done(); as d) {
      <div class="card done" role="status">
        <sfc-icon name="check" size="40" />
        <h2>Proposta enviada!</h2>
        <p>A secretaria do clube vai analisar a tua proposta de sócio. Quando for aceite, recebes um email com o teu <strong>n.º de sócio</strong> e uma ligação para entrares na área reservada.</p>
        <p>Enviámos para <strong>{{ form.value.email }}</strong> a proposta assinada (PDF).</p>
        <p class="caption">Referência do registo: {{ d.id.slice(0, 8) }} · prova {{ d.evidenceSha256.slice(0, 16) }}…</p>
        <a class="btn btn--primary" routerLink="/">Voltar ao início</a>
      </div>
    } @else if (loadError()) {
      <sfc-offline-notice title="Registo de sócio" [text]="loadError()!" />
    } @else if (info(); as f) {
      @if (!f.ready.member) {
        <sfc-offline-notice title="Registo de sócio" text="O registo online ainda não está disponível. Podes inscrever-te na secretaria do clube." />
      } @else {
        <form class="signup card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <h2 class="h-s">1. Os teus dados</h2>
          <div class="grid">
            <div class="field wide">
              <label for="ms-name">Nome completo <span class="req">*</span></label>
              <input id="ms-name" formControlName="name" autocomplete="name" />
            </div>
            <div class="field">
              <label for="ms-email">Email <span class="req">*</span></label>
              <input id="ms-email" type="email" formControlName="email" autocomplete="email" />
            </div>
            <div class="field">
              <label for="ms-phone">Telemóvel <span class="req">*</span></label>
              <input id="ms-phone" formControlName="phone" inputmode="tel" autocomplete="tel" />
            </div>
            <div class="field">
              <label for="ms-birth">Data de nascimento <span class="req">*</span></label>
              <input id="ms-birth" type="date" formControlName="birthDate" autocomplete="bday" />
            </div>
            <div class="field">
              <label for="ms-nif">NIF</label>
              <input id="ms-nif" formControlName="taxNumber" inputmode="numeric" maxlength="9" />
              @if (invalid('taxNumber')) {
                <span class="error">NIF inválido.</span>
              }
            </div>
            <div class="field wide">
              <label for="ms-addr">Morada</label>
              <input id="ms-addr" formControlName="address" autocomplete="street-address" />
            </div>
            <div class="field">
              <label for="ms-cp">Código postal</label>
              <input id="ms-cp" formControlName="postalCode" placeholder="0000-000" autocomplete="postal-code" />
            </div>
            <div class="field">
              <label for="ms-city">Localidade</label>
              <input id="ms-city" formControlName="city" autocomplete="address-level2" />
            </div>
            <div class="field">
              <label for="ms-proposer">N.º do sócio proponente</label>
              <input id="ms-proposer" formControlName="proposerNumber" inputmode="numeric" maxlength="8" placeholder="se um sócio te propôs" />
              <span class="hint">Facultativo (Regulamento Interno, art.º 9.º).</span>
            </div>
            @if (f.categories.length > 1) {
              <div class="field">
                <label for="ms-cat">Categoria</label>
                <select id="ms-cat" formControlName="category">
                  @for (c of f.categories; track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
              </div>
            }
          </div>

          <h2 class="h-s">2. Condições</h2>
          <sfc-legal-accept [doc]="f.documents.socio!" [(accepted)]="acceptSocio" label="Li e aceito as condições de admissão de sócio" />
          <sfc-legal-accept [doc]="f.documents.rgpd!" [(accepted)]="acceptRgpd" label="Li a informação sobre proteção de dados" />
          <sfc-legal-accept [doc]="f.documents.imagem!" [(accepted)]="imageConsent" [required]="false" label="Autorizo a utilização da minha imagem (facultativo)" />

          <h2 class="h-s">3. Assinatura</h2>
          <p class="caption">Ao assinar, confirmas que os dados estão corretos e aceitas os documentos acima. Guardamos a assinatura, a data e hora, o endereço IP e o navegador como prova, e enviamos-te o documento assinado.</p>
          <sfc-signature-pad (changed)="signature.set($event)" />

          <!-- Armadilha para robôs: invisível para as pessoas -->
          <div class="hp" aria-hidden="true"><label>Website <input tabindex="-1" autocomplete="off" formControlName="website" /></label></div>

          @if (error(); as e) {
            <p class="alert alert--warning" role="alert"><sfc-icon name="warning" size="18" /><span>{{ e }}</span></p>
          }
          <button class="btn btn--accent btn--block" type="submit" [disabled]="busy()">{{ busy() ? 'A registar…' : 'Assinar e tornar-me sócio' }}</button>
          @if (missing().length && tried()) {
            <p class="caption miss" role="status">Falta: {{ missing().join(', ') }}.</p>
          }
        </form>
      }
    } @else {
      <p class="caption" aria-live="polite">A carregar…</p>
    }
  `,
  styleUrl: './signup.scss',
})
export class MemberSignupComponent {
  private readonly api = inject(SignupService);
  protected readonly info = signal<SignupForm | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly tried = signal(false);
  protected readonly done = signal<SignupResult | null>(null);
  protected readonly signature = signal<string | null>(null);
  protected acceptSocio = signal(false);
  protected acceptRgpd = signal(false);
  protected imageConsent = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(5)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    birthDate: ['', Validators.required],
    taxNumber: ['', nifValidator],
    address: [''],
    postalCode: ['', Validators.pattern(POSTAL_CODE_PATTERN)],
    city: [''],
    category: [''],
    proposerNumber: ['', Validators.pattern(/^\d{1,8}$/)],
    website: [''],
  });

  protected readonly missing = computed(() => {
    const out: string[] = [];
    if (!this.acceptSocio()) out.push('aceitar as condições');
    if (!this.acceptRgpd()) out.push('ler a informação RGPD');
    if (!this.signature()) out.push('assinar');
    return out;
  });

  constructor() {
    this.api
      .form()
      .then((f) => {
        this.info.set(f);
        this.form.controls.category.setValue(f.categories[0] ?? '');
      })
      .catch(() => this.loadError.set('O registo online não está disponível de momento. Tenta mais tarde ou contacta a secretaria.'));
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.tried());
  }

  async submit() {
    this.tried.set(true);
    this.form.markAllAsTouched();
    const f = this.info();
    if (!f || this.form.invalid || this.missing().length || this.busy()) {
      if (this.form.invalid) this.error.set('Revê os campos assinalados.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    try {
      const out = await this.api.submit('member', {
        ...v,
        taxNumber: v.taxNumber || null,
        address: v.address || null,
        postalCode: v.postalCode || null,
        city: v.city || null,
        category: v.category || null,
        proposerNumber: v.proposerNumber || null,
        accept: Object.fromEntries(Object.entries(f.documents).map(([k, d]) => [k, d!.version])),
        imageConsent: this.imageConsent(),
        signature: this.signature(),
      });
      this.done.set(out);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível registar. Tenta outra vez.');
    } finally {
      this.busy.set(false);
    }
  }
}
