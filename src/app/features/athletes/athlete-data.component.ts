import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ageOn,
  AthleteAreaService,
  isValidEmail,
  isValidIdNumber,
  isValidNif,
  isValidPhone,
  isValidPostalCode,
} from '../../core/services/athlete-area.service';
import { Athlete, AthleteDetails, CURRENT_SEASON } from '../../core/data/athletes-data';
import { IconComponent } from '../../shared/icon.component';

const SHIRT_SIZES = ['6A', '8A', '10A', '12A', '14A', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];

interface Draft {
  name: string;
  birthDate: string;
  details: AthleteDetails;
}

/**
 * Ficha do atleta: ver, alterar e confirmar os dados da época.
 * Usada pelo encarregado (para cada educando) e pelo próprio atleta.
 */
@Component({
  selector: 'sfc-athlete-data',
  imports: [DatePipe, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './athlete-data.component.html',
  styleUrl: './athlete-data.component.scss',
})
export class AthleteDataComponent {
  readonly athlete = input.required<Athlete>();

  protected readonly area = inject(AthleteAreaService);
  protected readonly season = CURRENT_SEASON.label;
  protected readonly sizes = SHIRT_SIZES;
  protected readonly today = new Date().toISOString().slice(0, 10);

  protected readonly confirmed = computed(() => this.area.isConfirmed(this.athlete()));
  protected readonly missing = computed(() => this.area.missingFields(this.athlete()));
  protected readonly minor = computed(() => ageOn(this.athlete().birthDate) < 18);
  protected readonly self = computed(() => this.area.isSelf(this.athlete().id));
  protected readonly idExpired = computed(() => {
    const exp = this.athlete().details.idExpiry;
    return !!exp && exp < this.today;
  });

  protected readonly editing = signal(false);
  /** Cópia editável (só existe em modo de edição) */
  protected draft!: Draft;
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly errorCount = computed(() => Object.keys(this.errors()).length);
  protected readonly message = signal<{ kind: 'ok' | 'info'; text: string } | null>(null);

  /** «12345678» → «••••5678» */
  protected mask(v: string) {
    return v ? '•'.repeat(Math.max(0, v.length - 4)) + v.slice(-4) : '—';
  }

  startEdit() {
    this.draft = this.toDraft();
    this.errors.set({});
    this.message.set(null);
    this.editing.set(true);
  }

  cancel() {
    this.editing.set(false);
    this.errors.set({});
  }

  confirm() {
    if (this.area.confirmData(this.athlete().id)) {
      this.message.set({ kind: 'ok', text: `Obrigado! Dados confirmados para a época ${this.season}.` });
    }
  }

  save() {
    const errors = this.validate(this.draft);
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      // Leva o foco ao primeiro campo com erro
      queueMicrotask(() => document.getElementById(`ad-${Object.keys(errors)[0]}-${this.athlete().id}`)?.focus());
      return;
    }
    const d = this.draft.details;
    const changed = this.area.updateAthlete(this.athlete().id, {
      name: this.draft.name.trim(),
      birthDate: this.draft.birthDate,
      details: { ...d, email: d.email.trim(), phone: d.phone.replace(/\s/g, ''), emergencyPhone: d.emergencyPhone.replace(/\s/g, '') },
    });
    this.editing.set(false);
    this.message.set(
      changed.length
        ? { kind: 'info', text: `Dados guardados e confirmados. A alteração de ${changed.join(', ')} fica em validação pela secretaria.` }
        : { kind: 'ok', text: `Dados guardados e confirmados para a época ${this.season}.` },
    );
  }

  private validate(v: Draft): Record<string, string> {
    const e: Record<string, string> = {};
    const d = v.details;
    if (v.name.trim().split(/\s+/).length < 2) e['name'] = 'Indica o nome completo (nome e apelido).';
    if (!v.birthDate || v.birthDate > this.today) e['birth'] = 'Data de nascimento inválida.';
    if (!d.gender) e['gender'] = 'Escolhe uma opção.';
    if (!isValidIdNumber(d.idNumber)) e['cc'] = 'N.º de identificação civil com 7 ou 8 dígitos.';
    if (!d.idExpiry) e['ccexp'] = 'Indica a validade do documento.';
    if (!isValidNif(d.taxNumber)) e['nif'] = 'NIF inválido (9 dígitos com dígito de controlo).';
    if (!isValidEmail(d.email.trim())) e['email'] = 'Email inválido.';
    if (!isValidPhone(d.phone)) e['phone'] = 'Telemóvel com 9 dígitos (ou formato internacional +…).';
    if (!d.address.trim()) e['address'] = 'Indica a morada.';
    if (!isValidPostalCode(d.postalCode)) e['postal'] = 'Código postal no formato 0000-000.';
    if (!d.city.trim()) e['city'] = 'Indica a localidade.';
    if (!d.shirtSize) e['size'] = 'Escolhe o tamanho.';
    if (!d.emergencyName.trim()) e['ename'] = 'Indica um contacto de emergência.';
    if (!isValidPhone(d.emergencyPhone)) e['ephone'] = 'Telefone de emergência inválido.';
    else if (d.emergencyPhone.replace(/\s/g, '') === d.phone.replace(/\s/g, '') && !this.minor())
      e['ephone'] = 'Usa um contacto diferente do teu.';
    if (!d.consentRgpd) e['rgpd'] = 'Necessário para a inscrição.';
    return e;
  }

  private toDraft(): Draft {
    const a = this.athlete();
    return { name: a.name, birthDate: a.birthDate, details: { ...a.details } };
  }
}
