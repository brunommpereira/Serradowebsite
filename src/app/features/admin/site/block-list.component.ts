import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BlockField } from '../../../core/site/site.models';
import { IconComponent } from '../../../shared/icon.component';
import { BlockFieldComponent } from './block-field.component';

/** Valor inicial de um campo num elemento novo. */
export function emptyValue(f: BlockField): unknown {
  switch (f.kind) {
    case 'checkbox':
      return f.key === 'available' || f.key === 'active';
    case 'number':
      return f.required ? 0 : null;
    case 'lines':
    case 'list':
      return [];
    case 'select':
      return f.required ? (f.options?.[0] ?? null) : null;
    case 'image':
    case 'file':
      return null;
    default:
      return '';
  }
}

/** Lista editável de um bloco (jogos, produtos, documentos…): resumo por linha, um elemento aberto de cada vez. */
@Component({
  selector: 'sfc-block-list',
  imports: [FormsModule, IconComponent, BlockFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'wide' },
  template: `
    @let f = field();
    @let items = list();
    <div class="head">
      <h3>
        {{ f.label }} <span class="caption">({{ items.length }})</span>
      </h3>
      <button type="button" class="btn btn--outline btn--sm" (click)="add()">
        <sfc-icon name="list" size="16" />Adicionar {{ f.singular ?? 'elemento' }}
      </button>
    </div>
    @if (f.hint) {
      <p class="hint">{{ f.hint }}</p>
    }
    @if (items.length > 8) {
      <input
        class="adm-search filter"
        type="search"
        [placeholder]="'Procurar ' + (f.singular ?? '') + '…'"
        [ngModel]="q()"
        (ngModelChange)="q.set($event)"
        [attr.aria-label]="'Procurar em ' + f.label"
      />
    }
    <ol class="items">
      @for (it of items; track it; let i = $index; let first = $first; let last = $last) {
        @if (matches(it)) {
          <li class="item" [class.item--open]="open() === it">
            <div class="row">
              <button
                type="button"
                class="row__title"
                (click)="toggle(it)"
                [attr.aria-expanded]="open() === it"
              >
                <sfc-icon name="chevron" size="16" [class.rot]="open() === it" />
                <span>{{ summary(it) || 'Novo ' + (f.singular ?? 'elemento') }}</span>
              </button>
              <span class="row__acts">
                <button
                  type="button"
                  class="ic"
                  (click)="move(i, -1)"
                  [disabled]="first"
                  [attr.aria-label]="'Subir ' + summary(it)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="ic"
                  (click)="move(i, 1)"
                  [disabled]="last"
                  [attr.aria-label]="'Descer ' + summary(it)"
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="ic"
                  (click)="duplicate(i)"
                  [attr.aria-label]="'Duplicar ' + summary(it)"
                  title="Duplicar"
                >
                  <sfc-icon name="copy" size="16" />
                </button>
                <button
                  type="button"
                  class="ic ic--danger"
                  (click)="remove(i)"
                  [attr.aria-label]="'Apagar ' + summary(it)"
                  title="Apagar"
                >
                  <sfc-icon name="trash" size="16" />
                </button>
              </span>
            </div>
            @if (open() === it) {
              <div class="grid">
                @for (sf of f.fields; track sf.key) {
                  <sfc-block-field [field]="sf" [model]="it" />
                }
              </div>
            }
          </li>
        }
      } @empty {
        <li class="caption empty">Lista vazia.</li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-s);
      padding: 0.8rem 1rem;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      h3 {
        margin: 0;
        font-size: 1.05rem;
      }
    }
    .filter {
      margin-top: 0.6rem;
      width: 100%;
    }
    .items {
      list-style: none;
      margin: 0.6rem 0 0;
      padding: 0;
    }
    .item {
      border-top: 1px solid var(--color-line);
      &.item--open {
        background: #f8f9fc;
        border-radius: var(--radius-s);
        padding-bottom: 0.8rem;
      }
    }
    .row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .row__title {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.6rem 0.3rem;
      border: 0;
      background: none;
      font: inherit;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      sfc-icon {
        flex: none;
        transform: rotate(-90deg);
        transition: transform 0.15s;
        &.rot {
          transform: none;
        }
      }
    }
    .row__acts {
      display: flex;
      gap: 0.15rem;
      flex: none;
    }
    .ic {
      width: 34px;
      height: 34px;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: none;
      color: var(--sfc-blue);
      font-weight: 800;
      cursor: pointer;
      &:hover:not(:disabled) {
        background: var(--color-bg-soft);
      }
      &:disabled {
        opacity: 0.3;
        cursor: default;
      }
    }
    .ic--danger {
      color: var(--color-danger);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.9rem 1.1rem;
      padding: 0.4rem 0.6rem 0;
    }
    .empty {
      padding: 0.6rem 0;
    }
    @media (max-width: 560px) {
      :host {
        padding: 0.7rem;
      }
      .grid {
        grid-template-columns: minmax(0, 1fr);
        padding: 0.4rem 0 0;
      }
      .ic {
        width: 30px;
      }
    }
  `,
})
export class BlockListComponent {
  readonly field = input.required<BlockField>();
  readonly model = input.required<Record<string, unknown>>();

  protected readonly open = signal<Record<string, unknown> | null>(null);
  protected readonly q = signal('');
  /** Força nova leitura da lista depois de alterações (a lista é mutável) */
  private readonly version = signal(0);
  protected readonly list = computed(() => {
    this.version();
    const v = this.model()[this.field().key];
    return (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  });

  protected summary(it: Record<string, unknown>) {
    const f = this.field();
    return f.summary ? f.summary(it).replace(/^[\s·|-]+|[\s·|-]+$/g, '') : '';
  }

  protected matches(it: Record<string, unknown>) {
    const q = this.q().trim().toLowerCase();
    return !q || this.summary(it).toLowerCase().includes(q) || this.open() === it;
  }

  protected toggle(it: Record<string, unknown>) {
    this.open.set(this.open() === it ? null : it);
  }

  protected add() {
    const f = this.field();
    const item = Object.fromEntries((f.fields ?? []).map((sf) => [sf.key, emptyValue(sf)]));
    const items = [...this.list()];
    if (f.newFirst) items.unshift(item);
    else items.push(item);
    this.set(items);
    this.q.set('');
    this.open.set(item);
  }

  protected duplicate(i: number) {
    const items = [...this.list()];
    const copy = structuredClone(items[i]);
    items.splice(i + 1, 0, copy);
    this.set(items);
    this.open.set(copy);
  }

  protected move(i: number, delta: number) {
    const items = [...this.list()];
    const [it] = items.splice(i, 1);
    items.splice(i + delta, 0, it);
    this.set(items);
  }

  protected remove(i: number) {
    const items = [...this.list()];
    const label = this.summary(items[i]) || (this.field().singular ?? 'elemento');
    if (!confirm(`Apagar «${label}»?`)) return;
    items.splice(i, 1);
    this.set(items);
  }

  private set(items: Record<string, unknown>[]) {
    this.model()[this.field().key] = items;
    this.version.update((v) => v + 1);
  }
}
