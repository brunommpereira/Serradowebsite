import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { nifValidator, PHONE_PATTERN, POSTAL_CODE_PATTERN } from '../../core/validators';
import { IconComponent } from '../../shared/icon.component';
import { OfflineNoticeComponent } from '../../shared/offline-notice.component';
import { SignaturePadComponent } from '../../shared/signature-pad.component';
import { LegalAcceptComponent } from './legal-accept.component';
import { SignupForm, SignupResult, SignupService } from './signup.service';

const SPORT_LABEL: Record<string, string> = {
  atletismo: 'Atletismo',
  futsal: 'Escola de Futsal',
  rugby: 'Escola de Rugby',
  formacao: 'Formação',
  'escola-de-desporto': 'Escola de Desporto',
};

function ageOn(birth: string, today = new Date()): number {
  const b = new Date(birth + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return 99;
  let age = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--;
  return age;
}

/**
 * Inscrição de atleta online (modo API). Menor de 18 anos: assina o encarregado de educação.
 * Adulto: assina o próprio. Fica pendente até a secretaria aceitar; o documento assinado segue por email.
 */
@Component({
  selector: 'sfc-athlete-signup',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, OfflineNoticeComponent, SignaturePadComponent, LegalAcceptComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (done(); as d) {
      <div class="card done" role="status">
        <sfc-icon name="check" size="40" />
        <h2>Proposta de inscrição enviada!</h2>
        <p>A secretaria do clube vai analisar a inscrição. Quando for aceite, recebes um email com o <strong>código de atleta</strong> e uma ligação para a Área de Atletas, onde podes entregar os documentos em falta (exame médico, fotografia…).</p>
        <p>Enviámos para <strong>{{ signerEmail() }}</strong> a proposta assinada (PDF).</p>
        <p class="caption">Referência do registo: {{ d.id.slice(0, 8) }} · prova {{ d.evidenceSha256.slice(0, 16) }}…</p>
        <a class="btn btn--primary" routerLink="/">Voltar ao início</a>
      </div>
    } @else if (loadError()) {
      <sfc-offline-notice title="Inscrição de atleta" [text]="loadError()!" />
    } @else if (info(); as f) {
      @if (!f.ready.athlete) {
        <sfc-offline-notice title="Inscrição de atleta" text="A inscrição online ainda não está disponível. Fala com a secretaria ou com o treinador da modalidade." />
      } @else {
        <form class="signup card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <h2 class="h-s">1. Atleta</h2>
          <div class="grid">
            <div class="field wide">
              <label for="as-name">Nome completo do atleta <span class="req">*</span></label>
              <input id="as-name" formControlName="name" autocomplete="off" />
            </div>
            <div class="field">
              <label for="as-birth">Data de nascimento <span class="req">*</span></label>
              <input id="as-birth" type="date" formControlName="birthDate" />
            </div>
            <div class="field">
              <label for="as-gender">Género <span class="req">*</span></label>
              <select id="as-gender" formControlName="gender">
                <option value="">—</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
              </select>
            </div>
            <div class="field">
              <label for="as-sport">Modalidade <span class="req">*</span></label>
              <select id="as-sport" formControlName="sport">
                @for (s of f.sports; track s) {
                  <option [value]="s">{{ sportLabel(s) }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="as-shirt">Tamanho da t-shirt</label>
              <select id="as-shirt" formControlName="shirtSize">
                <option value="">—</option>
                @for (s of shirts; track s) {
                  <option [value]="s">{{ s }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label for="as-cc">N.º do Cartão de Cidadão</label>
              <input id="as-cc" formControlName="idNumber" inputmode="numeric" maxlength="12" />
            </div>
            <div class="field">
              <label for="as-ccv">Validade do CC</label>
              <input id="as-ccv" type="date" formControlName="idExpiry" />
            </div>
            <div class="field">
              <label for="as-nif">NIF do atleta</label>
              <input id="as-nif" formControlName="taxNumber" inputmode="numeric" maxlength="9" />
              @if (invalid('taxNumber')) {
                <span class="error">NIF inválido.</span>
              }
            </div>
            <div class="field wide">
              <label for="as-addr">Morada</label>
              <input id="as-addr" formControlName="address" autocomplete="street-address" />
            </div>
            <div class="field">
              <label for="as-cp">Código postal</label>
              <input id="as-cp" formControlName="postalCode" placeholder="0000-000" autocomplete="postal-code" />
            </div>
            <div class="field">
              <label for="as-city">Localidade</label>
              <input id="as-city" formControlName="city" autocomplete="address-level2" />
            </div>
            @if (!minor()) {
              <div class="field">
                <label for="as-email">Email do atleta <span class="req">*</span></label>
                <input id="as-email" type="email" formControlName="email" autocomplete="email" />
              </div>
              <div class="field">
                <label for="as-phone">Telemóvel do atleta</label>
                <input id="as-phone" formControlName="phone" inputmode="tel" autocomplete="tel" />
              </div>
            }
            <div class="field">
              <label for="as-ename">Contacto de emergência (nome) <span class="req">*</span></label>
              <input id="as-ename" formControlName="emergencyName" />
            </div>
            <div class="field">
              <label for="as-ephone">Contacto de emergência (telemóvel) <span class="req">*</span></label>
              <input id="as-ephone" formControlName="emergencyPhone" inputmode="tel" />
            </div>
          </div>

          @if (minor()) {
            <h2 class="h-s">2. Encarregado de educação</h2>
            <p class="caption">O atleta tem menos de 18 anos: é o encarregado de educação quem aceita e assina, e quem fica com acesso à Área de Atletas.</p>
            <div class="grid" formGroupName="guardian">
              <div class="field wide">
                <label for="as-gname">Nome completo <span class="req">*</span></label>
                <input id="as-gname" formControlName="name" autocomplete="name" />
              </div>
              <div class="field">
                <label for="as-gemail">Email <span class="req">*</span></label>
                <input id="as-gemail" type="email" formControlName="email" autocomplete="email" />
              </div>
              <div class="field">
                <label for="as-gphone">Telemóvel <span class="req">*</span></label>
                <input id="as-gphone" formControlName="phone" inputmode="tel" autocomplete="tel" />
              </div>
              <div class="field">
                <label for="as-grel">Relação com o atleta</label>
                <select id="as-grel" formControlName="relation">
                  @for (r of relations; track r) {
                    <option [value]="r">{{ r }}</option>
                  }
                </select>
              </div>
            </div>
          }

          <h2 class="h-s">{{ minor() ? '3' : '2' }}. Condições</h2>
          <sfc-legal-accept [doc]="f.documents.atleta!" [(accepted)]="acceptRules" label="Li e aceito o regulamento e as condições de inscrição" />
          <sfc-legal-accept [doc]="f.documents.rgpd!" [(accepted)]="acceptRgpd" label="Li a informação sobre proteção de dados" />
          <sfc-legal-accept
            [doc]="f.documents.imagem!"
            [(accepted)]="imageConsent"
            [required]="false"
            [label]="minor() ? 'Autorizo a utilização da imagem do meu educando (facultativo)' : 'Autorizo a utilização da minha imagem (facultativo)'"
          />

          <h2 class="h-s">{{ minor() ? '4' : '3' }}. Assinatura {{ minor() ? 'do encarregado de educação' : 'do atleta' }}</h2>
          <p class="caption">Ao assinar, confirmas que os dados estão corretos e aceitas os documentos acima. Guardamos a assinatura, a data e hora, o endereço IP e o navegador como prova, e enviamos-te o documento assinado.</p>
          <sfc-signature-pad (changed)="signature.set($event)" />

          <div class="hp" aria-hidden="true"><label>Website <input tabindex="-1" autocomplete="off" formControlName="website" /></label></div>

          @if (error(); as e) {
            <p class="alert alert--warning" role="alert"><sfc-icon name="warning" size="18" /><span>{{ e }}</span></p>
          }
          <button class="btn btn--accent btn--block" type="submit" [disabled]="busy()">{{ busy() ? 'A inscrever…' : 'Assinar e inscrever' }}</button>
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
export class AthleteSignupComponent {
  /** Modalidade escolhida à partida (?modalidade=futsal) */
  readonly modalidade = input<string>('');
  private readonly api = inject(SignupService);
  protected readonly shirts = ['6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];
  protected readonly relations = ['Mãe', 'Pai', 'Tutor legal', 'Avó/Avô', 'Outro'];
  protected readonly info = signal<SignupForm | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly tried = signal(false);
  protected readonly done = signal<SignupResult | null>(null);
  protected readonly signature = signal<string | null>(null);
  protected acceptRules = signal(false);
  protected acceptRgpd = signal(false);
  protected imageConsent = signal(false);

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(5)]],
    birthDate: ['', Validators.required],
    gender: ['', Validators.required],
    sport: ['atletismo', Validators.required],
    shirtSize: [''],
    idNumber: ['', Validators.pattern(/^\d{7,8}/)],
    idExpiry: [''],
    taxNumber: ['', nifValidator],
    address: [''],
    postalCode: ['', Validators.pattern(POSTAL_CODE_PATTERN)],
    city: [''],
    email: ['', Validators.email],
    phone: ['', Validators.pattern(PHONE_PATTERN)],
    emergencyName: ['', [Validators.required, Validators.minLength(3)]],
    emergencyPhone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    guardian: this.fb.group({
      name: ['', [Validators.required, Validators.minLength(5)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      relation: ['Mãe'],
    }),
    website: [''],
  });

  private readonly birth = toSignal(this.form.controls.birthDate.valueChanges, { initialValue: '' });
  protected readonly minor = computed(() => !this.birth() || ageOn(this.birth()) < 18);
  protected readonly signerEmail = computed(() => (this.minor() ? this.form.controls.guardian.value.email : this.form.value.email));

  protected readonly missing = computed(() => {
    const out: string[] = [];
    if (!this.acceptRules()) out.push('aceitar o regulamento');
    if (!this.acceptRgpd()) out.push('ler a informação RGPD');
    if (!this.signature()) out.push('assinar');
    return out;
  });

  constructor() {
    this.api
      .form()
      .then((f) => {
        this.info.set(f);
        if (this.modalidade() && f.sports.includes(this.modalidade())) this.form.controls.sport.setValue(this.modalidade());
      })
      .catch(() => this.loadError.set('A inscrição online não está disponível de momento. Tenta mais tarde ou contacta a secretaria.'));
  }

  protected sportLabel(s: string) {
    return SPORT_LABEL[s] ?? s;
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.tried());
  }

  async submit() {
    this.tried.set(true);
    this.form.markAllAsTouched();
    const minor = this.minor();
    // O encarregado só conta para menores; o email do atleta é obrigatório para adultos
    const guardian = this.form.controls.guardian;
    if (minor) guardian.enable();
    else guardian.disable();
    const email = this.form.controls.email;
    email.setValidators(minor ? Validators.email : [Validators.required, Validators.email]);
    email.updateValueAndValidity();
    const f = this.info();
    if (!f || this.form.invalid || this.missing().length || this.busy()) {
      if (this.form.invalid) this.error.set('Revê os campos assinalados.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const nul = (s: string) => s.trim() || null;
    try {
      const out = await this.api.submit('athlete', {
        name: v.name,
        birthDate: v.birthDate,
        gender: v.gender,
        sport: v.sport,
        shirtSize: nul(v.shirtSize),
        idNumber: nul(v.idNumber),
        idExpiry: nul(v.idExpiry),
        taxNumber: nul(v.taxNumber),
        address: nul(v.address),
        postalCode: nul(v.postalCode),
        city: nul(v.city),
        email: minor ? null : nul(v.email),
        phone: minor ? null : nul(v.phone),
        emergencyName: v.emergencyName,
        emergencyPhone: v.emergencyPhone,
        guardian: minor ? v.guardian : null,
        website: v.website,
        accept: Object.fromEntries(Object.entries(f.documents).map(([k, d]) => [k, d!.version])),
        imageConsent: this.imageConsent(),
        signature: this.signature(),
      });
      this.done.set(out);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível inscrever. Tenta outra vez.');
    } finally {
      this.busy.set(false);
    }
  }
}
