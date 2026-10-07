import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CMS_TYPES, CmsEntry, CmsType, STATUS_LABEL } from '../../../core/cms/cms.models';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource } from '../data/admin-source';

const TYPES = Object.values(CMS_TYPES);

/** CMS: lista de conteúdos de um tipo, com pesquisa e filtro por estado. */
@Component({
  selector: 'sfc-admin-cms-list',
  imports: [DatePipe, FormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = def();
    <div class="adm-head">
      <div>
        <h1>{{ d.label }}</h1>
        <p>{{ total() }} {{ total() === 1 ? d.singular : d.label.toLowerCase() }}{{ status() ? ' · ' + statusLabel[status()!].toLowerCase() : '' }}</p>
      </div>
      <a class="btn btn--primary btn--sm" [routerLink]="['/admin/conteudos', d.type, 'novo']"><sfc-icon [name]="d.icon" size="16" />Novo {{ d.singular }}</a>
    </div>

    <nav class="types" aria-label="Tipos de conteúdo">
      @for (t of types; track t.type) {
        <a [routerLink]="['/admin/conteudos', t.type]" [class.on]="t.type === d.type" [attr.aria-current]="t.type === d.type ? 'page' : null">{{ t.label }}</a>
      }
    </nav>

    <div class="adm-toolbar">
      <label class="visually-hidden" for="cms-q">Pesquisar</label>
      <input id="cms-q" class="adm-search" type="search" placeholder="Pesquisar por título…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
      <div class="chips" role="group" aria-label="Estado">
        <button type="button" class="chip" [attr.aria-pressed]="!status()" (click)="status.set(null)">Todos</button>
        @for (s of statuses; track s) {
          <button type="button" class="chip" [attr.aria-pressed]="status() === s" (click)="status.set(s)">{{ statusLabel[s] }}</button>
        }
      </div>
    </div>

    @if (error()) {
      <p class="alert alert--warning adm-error" role="alert">{{ error() }}</p>
    }

    <div class="adm-table-wrap">
      <table class="adm-table">
        <caption class="visually-hidden">{{ d.label }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ d.titleKey === 'name' ? 'Nome' : 'Título' }}</th>
            <th scope="col">Estado</th>
            <th scope="col" class="hide-sm">{{ d.type === 'events' ? 'Data' : d.type === 'pages' ? 'Endereço' : 'Categoria' }}</th>
            <th scope="col" class="hide-sm">Atualizado</th>
            <th scope="col" class="act"><span class="visually-hidden">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          @for (e of items(); track e.id) {
            <tr>
              <td>
                <a class="row-title" [routerLink]="['/admin/conteudos', d.type, e.id]">{{ title(e) }}</a>
                <span class="caption row-sub">/{{ e.slug }}</span>
              </td>
              <td><span class="st" [class]="'st st--' + e.status">{{ statusLabel[e.status] }}</span></td>
              <td class="hide-sm">
                @if (d.type === 'events') {
                  {{ $any(e['startsAt']) | date: 'dd/MM/y HH:mm' }}
                } @else if (d.type === 'pages') {
                  /paginas/{{ e.slug }}
                } @else {
                  {{ e['category'] }}
                }
              </td>
              <td class="hide-sm">{{ e.updatedAt | date: 'dd/MM/y HH:mm' }}</td>
              <td class="act">
                @if (e.status === 'published' && d.publicPath) {
                  <a class="icon-act" [href]="d.publicPath(e)" target="_blank" rel="noopener" [attr.aria-label]="'Ver no site: ' + title(e)"><sfc-icon name="external" size="18" /></a>
                }
                <a class="btn btn--outline btn--sm" [routerLink]="['/admin/conteudos', d.type, e.id]">Editar</a>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="5" class="adm-empty">{{ loading() ? 'A carregar…' : 'Sem resultados.' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .types {
      display: flex;
      gap: 0.2rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--color-line);
      overflow-x: auto;
      a {
        padding: 0.6rem 0.9rem;
        font-weight: 700;
        font-size: 0.92rem;
        color: var(--color-muted);
        text-decoration: none;
        border-bottom: 3px solid transparent;
        white-space: nowrap;
        &.on {
          color: var(--sfc-blue-900);
          border-bottom-color: var(--sfc-yellow);
        }
      }
    }
    .row-title {
      font-weight: 700;
      color: var(--color-text);
      text-decoration: none;
      &:hover {
        color: var(--sfc-blue);
        text-decoration: underline;
      }
    }
    .row-sub {
      display: block;
    }
    .icon-act {
      display: inline-grid;
      place-items: center;
      width: 36px;
      height: 36px;
      margin-right: 0.3rem;
      vertical-align: middle;
      color: var(--sfc-blue);
    }
    @media (max-width: 640px) {
      .hide-sm {
        display: none;
      }
    }
  `,
})
export class CmsListPage {
  readonly type = input.required<string>();
  private readonly source = inject(AdminSource);

  protected readonly types = TYPES;
  protected readonly statuses = ['draft', 'published', 'archived'] as const;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly def = computed(() => CMS_TYPES[(this.type() as CmsType) in CMS_TYPES ? (this.type() as CmsType) : 'news']);

  protected readonly q = signal('');
  protected readonly status = signal<'draft' | 'published' | 'archived' | null>(null);
  protected readonly items = signal<CmsEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    // Recarrega quando muda o tipo, o filtro ou a pesquisa (com pequeno atraso na pesquisa)
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const type = this.def().type;
      const filter = { status: this.status() ?? undefined, q: this.q().trim() || undefined };
      clearTimeout(timer);
      timer = setTimeout(() => this.load(type, filter), filter.q ? 250 : 0);
    });
  }

  protected title(e: CmsEntry) {
    return String(e[this.def().titleKey] ?? '');
  }

  private async load(type: CmsType, filter: { status?: string; q?: string }) {
    this.loading.set(true);
    try {
      const r = await this.source.cmsList(type, filter);
      this.items.set(r.items);
      this.total.set(r.total);
      this.error.set('');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
