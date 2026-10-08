import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CMS_TYPES, CmsEntry, CmsField, CmsRevision, CmsType, emptyEntry, slugify, STATUS_LABEL } from '../../../core/cms/cms.models';
import { bodyToHtml } from '../../../core/cms/rich-text';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource, CmsAction } from '../data/admin-source';
import { MediaPickerComponent } from '../media/media-picker.component';
import { RichTextEditorComponent } from '../media/rich-text-editor.component';
import { HasUnsavedChanges } from './unsaved.guard';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Editor de um conteúdo do CMS (criação e edição). */
@Component({
  selector: 'sfc-admin-cms-editor',
  imports: [DatePipe, FormsModule, RouterLink, IconComponent, MediaPickerComponent, RichTextEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cms-editor.page.html',
  styleUrl: './cms-editor.page.scss',
})
export class CmsEditorPage implements HasUnsavedChanges {
  readonly type = input.required<string>();
  /** id numérico ou «novo» */
  readonly id = input.required<string>();

  private readonly source = inject(AdminSource);
  private readonly router = inject(Router);

  protected readonly def = computed(() => CMS_TYPES[(this.type() as CmsType) in CMS_TYPES ? (this.type() as CmsType) : 'news']);
  protected readonly isNew = computed(() => this.id() === 'novo');
  protected readonly statusLabel = STATUS_LABEL;

  protected readonly entry = signal<CmsEntry | null>(null);
  /** Valores do formulário (objeto simples ligado com ngModel) */
  protected model: Record<string, unknown> = {};
  private saved = '';
  private slugTouched = false;
  /** Mensagem a mostrar depois de navegar de «novo» para o id criado */
  private carryMessage: { kind: 'ok' | 'error'; text: string } | null = null;

  protected readonly revisions = signal<CmsRevision[]>([]);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  protected readonly busy = signal(false);
  protected readonly preview = signal(false);
  protected readonly loading = signal(true);

  protected readonly mainFields = computed(() => this.def().fields.filter((f) => f.kind !== 'richtext'));
  protected readonly bodyField = computed(() => this.def().fields.find((f) => f.kind === 'richtext'));
  /** O texto aparece logo a seguir ao campo que o antecede na definição (resumo ou imagem de capa) */
  protected readonly bodyAfter = computed(() => {
    const fields = this.def().fields;
    const i = fields.findIndex((f) => f.kind === 'richtext');
    return i > 0 ? fields[i - 1].key : null;
  });

  constructor() {
    effect(() => {
      const type = this.def().type;
      const id = this.id();
      untracked(() => this.load(type, id));
    });
  }

  hasUnsavedChanges() {
    return !this.loading() && JSON.stringify(this.payload()) !== this.saved;
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(e: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) e.preventDefault();
  }

  protected title() {
    return String(this.model[this.def().titleKey] ?? '') || `Novo ${this.def().singular}`;
  }

  protected bodyHtml() {
    return String(this.model['body'] ?? '');
  }

  protected onTitle(value: string) {
    this.model[this.def().titleKey] = value;
    // Enquanto o slug não for editado à mão, acompanha o título
    if (this.isNew() && !this.slugTouched) this.model['slug'] = slugify(value);
  }

  protected onSlug(value: string) {
    this.slugTouched = true;
    this.model['slug'] = value;
  }

  protected fieldId(f: CmsField) {
    return `cms-${f.key}`;
  }

  async save(andPublish = false) {
    const errors = this.validate();
    this.errors.set(errors);
    if (Object.keys(errors).length) {
      this.message.set({ kind: 'error', text: `Há ${Object.keys(errors).length} campo(s) por corrigir.` });
      queueMicrotask(() => document.getElementById(`cms-${Object.keys(errors)[0]}`)?.focus());
      return;
    }
    await this.run(async () => {
      const type = this.def().type;
      const data = this.payload();
      let e = this.isNew() ? await this.source.cmsCreate(type, data) : await this.source.cmsUpdate(type, this.entry()!.id, data);
      if (andPublish && e.status !== 'published') e = await this.source.cmsStatus(type, e.id, 'publish');
      this.applyEntry(e);
      const msg = { kind: 'ok' as const, text: andPublish ? 'Publicado — já está visível no site.' : 'Guardado.' };
      if (this.isNew()) {
        this.carryMessage = msg;
        await this.router.navigate(['/admin/conteudos', type, e.id], { replaceUrl: true });
        return;
      }
      this.message.set(msg);
      await this.loadRevisions();
    });
  }

  async setStatus(action: CmsAction) {
    if (this.hasUnsavedChanges()) {
      this.message.set({ kind: 'error', text: 'Guarda as alterações antes de mudar o estado.' });
      return;
    }
    await this.run(async () => {
      const e = await this.source.cmsStatus(this.def().type, this.entry()!.id, action);
      this.applyEntry(e);
      this.message.set({ kind: 'ok', text: { publish: 'Publicado — já está visível no site.', unpublish: 'Voltou a rascunho (deixou de estar visível).', archive: 'Arquivado.' }[action] });
    });
  }

  async remove() {
    const e = this.entry();
    if (!e || !confirm(`Apagar «${this.title()}»? Esta ação não pode ser desfeita.`)) return;
    await this.run(async () => {
      await this.source.cmsDelete(this.def().type, e.id);
      this.saved = JSON.stringify(this.payload());
      this.router.navigate(['/admin/conteudos', this.def().type]);
    });
  }

  async restore(rev: CmsRevision) {
    if (!confirm(`Repor a versão de ${new Date(rev.createdAt).toLocaleString('pt-PT')}? O conteúdo atual fica guardado no histórico.`)) return;
    await this.run(async () => {
      const e = await this.source.cmsRestore(this.def().type, this.entry()!.id, rev.id);
      this.applyEntry(e);
      await this.loadRevisions();
      this.message.set({ kind: 'ok', text: 'Versão reposta.' });
    });
  }

  // ---------------------------------------------------------------- interno
  private async load(type: CmsType, id: string) {
    this.loading.set(true);
    this.message.set(this.carryMessage);
    this.carryMessage = null;
    this.errors.set({});
    this.slugTouched = false;
    try {
      if (id === 'novo') {
        this.entry.set(null);
        this.model = emptyEntry(type);
        this.revisions.set([]);
      } else {
        this.applyEntry(await this.source.cmsGet(type, Number(id)));
        await this.loadRevisions();
      }
      this.saved = JSON.stringify(this.payload());
    } catch (e) {
      this.message.set({ kind: 'error', text: (e as Error).message });
    } finally {
      this.loading.set(false);
    }
  }

  private applyEntry(e: CmsEntry) {
    this.entry.set(e);
    this.model = Object.fromEntries(this.def().fields.map((f) => [f.key, e[f.key] ?? emptyEntry(this.def().type)[f.key]]));
    // Conteúdos antigos em texto simples passam a HTML para o editor visual
    if (this.bodyField()) this.model['body'] = bodyToHtml(this.model['body']);
    this.saved = JSON.stringify(this.payload());
  }

  private async loadRevisions() {
    const e = this.entry();
    this.revisions.set(e ? await this.source.cmsRevisions(this.def().type, e.id) : []);
  }

  /** Só os campos editáveis, com os tipos certos (a API recusa campos a mais). */
  private payload(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of this.def().fields) {
      const v = this.model[f.key];
      if (f.kind === 'number') out[f.key] = v === '' || v === null || v === undefined ? (f.key === 'memberPrice' ? null : 0) : Number(v);
      else if (f.kind === 'checkbox') out[f.key] = !!v;
      else if ((f.kind === 'select' && !f.required) || f.kind === 'url' || f.kind === 'time' || f.kind === 'image') out[f.key] = v ? String(v) : null;
      else out[f.key] = String(v ?? '');
    }
    return out;
  }

  private validate(): Record<string, string> {
    const e: Record<string, string> = {};
    for (const f of this.def().fields) {
      const v = this.model[f.key];
      const s = v === null || v === undefined ? '' : String(v).trim();
      if (f.required && !s) e[f.key] = 'Obrigatório.';
      else if (f.max && s.length > f.max) e[f.key] = `Máximo ${f.max} caracteres.`;
      else if (f.key === 'slug' && !SLUG_RE.test(s)) e[f.key] = 'Só letras minúsculas, números e hífenes (ex.: nova-epoca-futsal).';
      else if (f.kind === 'url' && s && !/^https?:\/\/.+/.test(s)) e[f.key] = 'Endereço completo, a começar por https://';
      else if (f.kind === 'image' && s && !/^(https:\/\/|\/api\/v1\/media\/|data:image\/)/.test(s)) e[f.key] = 'Escolhe uma imagem da biblioteca.';
      else if (f.kind === 'richtext' && s.length > 200000) e[f.key] = 'O texto é demasiado longo.';
      else if (f.kind === 'number' && s && (Number.isNaN(Number(s)) || Number(s) < 0)) e[f.key] = 'Número igual ou superior a 0.';
    }
    return e;
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.message.set({ kind: 'error', text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }
}
