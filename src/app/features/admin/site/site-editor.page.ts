import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BLOCK_BY_KEY } from '../../../core/site/site-blocks';
import { SITE_DEFAULTS } from '../../../core/site/site-defaults';
import { BlockField, BlockKey, BlockRevision } from '../../../core/site/site.models';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource } from '../data/admin-source';
import { HasUnsavedChanges } from '../pages/unsaved.guard';
import { BlockFieldComponent } from './block-field.component';
import { BlockListComponent } from './block-list.component';
import { EmailPreviewComponent } from './email-preview.component';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Editor de um bloco de conteúdo do site (formulário gerado a partir de BLOCKS). */
@Component({
  selector: 'sfc-admin-site-editor',
  imports: [DatePipe, RouterLink, IconComponent, BlockFieldComponent, BlockListComponent, EmailPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = def();
    <p class="crumbs">
      <a routerLink="/admin/site"
        ><sfc-icon name="chevron" size="16" class="back" />Conteúdos do site</a
      >
    </p>
    <div class="adm-head">
      <div>
        <h1>{{ d?.label ?? 'Conteúdo' }}</h1>
        <p>{{ d?.description }}</p>
      </div>
    </div>

    @if (!d) {
      <p class="alert alert--warning">Este conteúdo não existe.</p>
    } @else if (loading()) {
      <p class="adm-empty">A carregar…</p>
    } @else {
      @if (message(); as m) {
        <div
          class="alert"
          [class.alert--success]="m.ok"
          [class.alert--warning]="!m.ok"
          role="status"
          aria-live="polite"
        >
          <p>{{ m.text }}</p>
          @if (m.list?.length) {
            <ul>
              @for (x of m.list; track $index) {
                <li>{{ x }}</li>
              }
            </ul>
          }
        </div>
      }
      <div class="layout">
        <form class="adm-panel grid" (submit)="$event.preventDefault(); save()" novalidate>
          @for (f of d.fields; track f.key) {
            @if (f.kind === 'list') {
              <sfc-block-list [field]="f" [model]="model" />
            } @else {
              <sfc-block-field [field]="f" [model]="model" />
            }
          }
        </form>

        <aside class="side">
          @if (d.key === 'email') {
            <section class="adm-panel">
              <sfc-email-preview [model]="model" />
            </section>
          }
          <section class="adm-panel">
            <h2>Publicação</h2>
            <p class="caption">
              @if (updatedAt(); as u) {
                Alterado a {{ u | date: 'dd/MM/y HH:mm'
                }}{{ updatedBy() ? ' por ' + updatedBy() : '' }}.
              } @else {
                Ainda não foi alterado: o site mostra o conteúdo original.
              }
            </p>
            <div class="actions">
              <button
                type="button"
                class="btn btn--primary btn--block"
                [disabled]="busy()"
                (click)="save()"
              >
                <sfc-icon name="check" size="16" />Guardar e publicar
              </button>
              <a class="linkish" [href]="d.publicPath" target="_blank" rel="noopener"
                ><sfc-icon name="external" size="16" />Ver no site</a
              >
              @if (updatedAt()) {
                <button
                  type="button"
                  class="linkish linkish--danger"
                  [disabled]="busy()"
                  (click)="reset()"
                >
                  Repor o conteúdo original
                </button>
              }
            </div>
            <p class="caption">
              Ao guardar, as alterações ficam logo visíveis no site. As versões anteriores ficam no
              histórico.
            </p>
          </section>
          <section class="adm-panel">
            <h2>Histórico</h2>
            @if (!revisions().length) {
              <p class="caption">Ainda sem versões guardadas.</p>
            }
            <ol class="revs">
              @for (r of revisions(); track r.id; let first = $first) {
                <li>
                  <span>
                    <strong>{{ r.createdAt | date: 'dd/MM/y HH:mm' }}</strong>
                    <span class="caption"
                      >{{ r.author ?? '—' }}{{ r.original ? ' · original' : ''
                      }}{{ first ? ' · atual' : '' }}</span
                    >
                  </span>
                  @if (!first) {
                    <button type="button" class="linkish" [disabled]="busy()" (click)="restore(r)">
                      Repor
                    </button>
                  }
                </li>
              }
            </ol>
          </section>
        </aside>
      </div>
    }
  `,
  styles: `
    .crumbs {
      margin-bottom: 0.4rem;
      a {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        font-weight: 700;
        font-size: 0.88rem;
        color: var(--sfc-blue);
        text-decoration: none;
      }
      .back {
        transform: rotate(90deg);
      }
    }
    .alert {
      margin-bottom: 1rem;
      p {
        margin: 0;
      }
      ul {
        margin: 0.4rem 0 0;
        padding-left: 1.2rem;
      }
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 1rem;
      align-items: start;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem 1.2rem;
      align-items: start;
    }
    :host ::ng-deep .wide {
      grid-column: 1 / -1;
    }
    :host ::ng-deep .field--check {
      align-self: end;
    }
    .side {
      display: grid;
      gap: 1rem;
      position: sticky;
      top: 1rem;
    }
    .actions {
      display: grid;
      gap: 0.5rem;
      margin-bottom: 0.6rem;
    }
    .revs {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 320px;
      overflow-y: auto;
      li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0;
        border-top: 1px solid var(--color-line);
        font-size: 0.88rem;
        > span {
          display: grid;
        }
      }
    }
    @media (max-width: 960px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .side {
        position: static;
      }
    }
    @media (max-width: 560px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class SiteEditorPage implements HasUnsavedChanges {
  readonly key = input.required<string>();
  private readonly source = inject(AdminSource);

  protected readonly def = computed(() => BLOCK_BY_KEY[this.key()] ?? null);
  protected model: Record<string, unknown> = {};
  private saved = '';
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly updatedAt = signal<string | null>(null);
  protected readonly updatedBy = signal<string | null>(null);
  protected readonly revisions = signal<BlockRevision[]>([]);
  protected readonly message = signal<{ ok: boolean; text: string; list?: string[] } | null>(null);

  constructor() {
    effect(() => {
      const key = this.key();
      untracked(() => this.load(key));
    });
  }

  hasUnsavedChanges() {
    return !this.loading() && !!this.def() && JSON.stringify(this.model) !== this.saved;
  }

  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(e: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) e.preventDefault();
  }

  async save() {
    const d = this.def();
    if (!d || this.busy()) return;
    const errors = validate(d.fields, this.model, '');
    if (errors.length) {
      this.message.set({
        ok: false,
        text: `Há ${errors.length} campo(s) por corrigir:`,
        list: errors.slice(0, 12),
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await this.run(async () => {
      const out = await this.source.siteSave(d.key, this.model);
      this.apply(out.data, out.updatedAt, out.updatedBy);
      this.revisions.set(await this.source.siteRevisions(d.key));
      this.message.set({ ok: true, text: 'Guardado. Já está visível no site.' });
    });
  }

  async reset() {
    const d = this.def();
    if (!d || !confirm('Repor o conteúdo original? A versão atual fica guardada no histórico.'))
      return;
    await this.run(async () => {
      await this.source.siteReset(d.key);
      this.apply(null, null, null);
      this.revisions.set(await this.source.siteRevisions(d.key));
      this.message.set({ ok: true, text: 'O site voltou a mostrar o conteúdo original.' });
    });
  }

  async restore(r: BlockRevision) {
    const d = this.def();
    if (
      !d ||
      !confirm(
        `Repor a versão de ${new Date(r.createdAt).toLocaleString('pt-PT')}? A versão atual fica no histórico.`,
      )
    )
      return;
    await this.run(async () => {
      const out = await this.source.siteRestore(d.key, r.id);
      this.apply(out.data, out.updatedAt, out.updatedBy);
      this.revisions.set(await this.source.siteRevisions(d.key));
      this.message.set({ ok: true, text: 'Versão reposta.' });
    });
  }

  private async load(key: string) {
    this.loading.set(true);
    this.message.set(null);
    try {
      if (!BLOCK_BY_KEY[key]) return;
      const [state, revs] = await Promise.all([
        this.source.siteBlock(key),
        this.source.siteRevisions(key),
      ]);
      this.apply(state.data, state.updatedAt, state.updatedBy);
      this.revisions.set(revs);
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.loading.set(false);
    }
  }

  /** Formulário = conteúdo original + campos editados (cópia: só muda ao guardar). */
  private apply(
    data: Record<string, unknown> | null,
    updatedAt: string | null,
    updatedBy: string | null,
  ) {
    const base = SITE_DEFAULTS[this.key() as BlockKey] as unknown as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(data ?? {})) if (k in base) merged[k] = v;
    this.model = structuredClone(merged);
    this.saved = JSON.stringify(this.model);
    this.updatedAt.set(updatedAt);
    this.updatedBy.set(updatedBy);
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    try {
      await fn();
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.busy.set(false);
    }
  }
}

/** Erros legíveis («Jogos › 3.º jogo › Adversário: obrigatório»). */
function validate(fields: BlockField[], model: Record<string, unknown>, prefix: string): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const v = model[f.key];
    const where = `${prefix}${f.label}`;
    if (f.kind === 'list') {
      (Array.isArray(v) ? v : []).forEach((item, i) =>
        out.push(
          ...validate(
            f.fields ?? [],
            item as Record<string, unknown>,
            `${f.label} › ${i + 1}.º ${f.singular ?? 'elemento'} › `,
          ),
        ),
      );
      continue;
    }
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (f.required && !s) out.push(`${where}: obrigatório.`);
    else if (f.max && s.length > f.max) out.push(`${where}: máximo ${f.max} caracteres.`);
    else if (f.kind === 'url' && s && !/^https?:\/\/\S+$/.test(s))
      out.push(`${where}: endereço completo, a começar por https://`);
    else if (f.kind === 'email' && s && !EMAIL.test(s)) out.push(`${where}: email inválido.`);
    else if (f.kind === 'number' && s && Number.isNaN(Number(s)))
      out.push(`${where}: número inválido.`);
    else if (f.key === 'link' && s && !/^(\/|https?:\/\/)\S*$/.test(s))
      out.push(`${where}: uma página do site (/…) ou um endereço https://`);
  }
  return out;
}
