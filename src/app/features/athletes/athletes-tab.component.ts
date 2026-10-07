import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ageOn, AthleteAreaService, MAX_CO_GUARDIANS } from '../../core/services/athlete-area.service';
import { ContentService } from '../../core/services/content.service';
import { Athlete, DocStatus } from '../../core/data/athletes-data';
import { SportSlug } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

const LEVELS = ['Sub-7', 'Sub-9', 'Sub-11', 'Sub-13', 'Sub-15', 'Sub-17', 'Sub-19', 'Seniores'];
const MAX_FILE_MB = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const STATUS_CLASS: Record<DocStatus, string> = {
  Aprovado: 'success',
  'Em análise': 'accent',
  Rejeitado: 'danger',
  'Em falta': 'neutral',
};

/** Separador «Os Meus Atletas»: dados, documentos de inscrição e partilha de acesso. */
@Component({
  selector: 'sfc-athletes-tab',
  imports: [DatePipe, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './athletes-tab.component.html',
  styleUrl: './athletes-tab.component.scss',
})
export class AthletesTabComponent {
  readonly athleteId = input.required<string>();
  /** «atleta»: o próprio atleta vê os seus dados (sem adicionar atletas nem partilhar acesso) */
  readonly profile = input<'encarregado' | 'atleta'>('encarregado');
  readonly selected = output<string>();

  protected readonly area = inject(AthleteAreaService);
  private readonly content = inject(ContentService);
  protected readonly sportName = (slug: string) => this.content.sport(slug)?.name ?? '';
  // O rugby tem inscrições no site do núcleo (almadarugby.pt)
  protected readonly sports = this.content.sports().filter((s) => !s.external);
  protected readonly levels = LEVELS;
  protected readonly maxCo = MAX_CO_GUARDIANS;
  protected readonly maxFileMb = MAX_FILE_MB;
  protected readonly statusClass = (s: DocStatus) => STATUS_CLASS[s];
  protected readonly age = (birthDate: string) => ageOn(birthDate);
  protected readonly today = new Date().toISOString().slice(0, 10);

  // ---- Adicionar atleta
  protected readonly adding = signal(false);
  protected newAthlete = emptyAthlete();
  protected readonly addError = signal(false);

  // ---- Editar dados
  protected readonly editingId = signal<string | null>(null);
  protected edit = { name: '', birthDate: '' };

  // ---- Documentos
  protected readonly docsOpen = signal<Record<string, boolean>>({});
  protected readonly uploadError = signal<{ athleteId: string; message: string } | null>(null);

  // ---- Partilha
  protected readonly inviteEmail = signal<Record<string, string>>({});
  protected readonly inviteMsg = signal<{ athleteId: string; kind: 'ok' | 'erro'; text: string } | null>(null);

  protected readonly ordered = computed(() => {
    // O educando selecionado aparece primeiro
    const list = this.area.athletes();
    const id = this.athleteId();
    return [...list.filter((a) => a.id === id), ...list.filter((a) => a.id !== id)];
  });

  approved(a: Athlete) {
    return a.documents.filter((d) => d.status === 'Aprovado').length;
  }

  rejected(a: Athlete) {
    return a.documents.filter((d) => d.status === 'Rejeitado');
  }

  toggleDocs(id: string) {
    this.docsOpen.update((o) => ({ ...o, [id]: !o[id] }));
  }

  // ---- Adicionar
  openAdd() {
    this.newAthlete = emptyAthlete();
    this.addError.set(false);
    this.adding.set(true);
  }

  suggestLevel() {
    if (!this.newAthlete.birthDate) return;
    // Escalão pela idade a 31 de dezembro do ano de início da época
    const age = ageOn(this.newAthlete.birthDate, new Date(2026, 11, 31));
    this.newAthlete.level = LEVELS.find((l) => l !== 'Seniores' && Number(l.slice(4)) > age) ?? 'Seniores';
  }

  saveNew() {
    const n = this.newAthlete;
    if (!n.name.trim() || !n.birthDate || !n.sportSlug || !n.level || n.birthDate > this.today) {
      this.addError.set(true);
      return;
    }
    const created = this.area.addAthlete({ name: n.name.trim(), birthDate: n.birthDate, sportSlug: n.sportSlug as SportSlug, level: n.level });
    this.adding.set(false);
    this.docsOpen.update((o) => ({ ...o, [created.id]: true }));
    this.selected.emit(created.id);
  }

  // ---- Editar
  startEdit(a: Athlete) {
    this.edit = { name: a.name, birthDate: a.birthDate };
    this.editingId.set(a.id);
  }

  saveEdit(a: Athlete) {
    if (!this.edit.name.trim() || !this.edit.birthDate || this.edit.birthDate > this.today) return;
    this.area.updateAthlete(a.id, { name: this.edit.name.trim(), birthDate: this.edit.birthDate });
    this.editingId.set(null);
  }

  // ---- Documentos (demo: o ficheiro não sai do browser)
  upload(a: Athlete, docId: string, event: Event) {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      this.uploadError.set({ athleteId: a.id, message: `«${file.name}» excede ${MAX_FILE_MB} MB.` });
      return;
    }
    if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.type)) {
      this.uploadError.set({ athleteId: a.id, message: `«${file.name}»: usa PDF, JPG ou PNG.` });
      return;
    }
    this.uploadError.set(null);
    this.area.uploadDocument(a.id, docId);
  }

  // ---- Partilhar acesso
  setInvite(athleteId: string, value: string) {
    this.inviteEmail.update((m) => ({ ...m, [athleteId]: value }));
  }

  invite(a: Athlete) {
    const email = (this.inviteEmail()[a.id] ?? '').trim();
    if (!EMAIL_RE.test(email)) {
      this.inviteMsg.set({ athleteId: a.id, kind: 'erro', text: 'Indica um email válido.' });
      return;
    }
    const result = this.area.inviteCoGuardian(a.id, email);
    const text = {
      ok: `Convite enviado para ${email.toLowerCase()}. O link expira em 7 dias.`,
      limite: `Já atingiste o limite de ${MAX_CO_GUARDIANS} co-encarregados para este atleta.`,
      duplicado: 'Esse email já tem acesso a este atleta.',
    }[result];
    this.inviteMsg.set({ athleteId: a.id, kind: result === 'ok' ? 'ok' : 'erro', text });
    if (result === 'ok') this.setInvite(a.id, '');
  }

  revoke(a: Athlete, email: string) {
    this.area.revokeCoGuardian(a.id, email);
    this.inviteMsg.set({ athleteId: a.id, kind: 'ok', text: `Acesso de ${email} removido.` });
  }
}

function emptyAthlete() {
  return { name: '', birthDate: '', sportSlug: '' as SportSlug | '', level: '' };
}
