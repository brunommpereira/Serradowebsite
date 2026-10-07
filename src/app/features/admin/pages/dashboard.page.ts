import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource, Dashboard, DOC_LABELS, FIELD_LABELS } from '../data/admin-source';
import { actionLabel } from './labels';

/** Início do backoffice: indicadores, o que precisa de atenção e atividade recente. */
@Component({
  selector: 'sfc-admin-dashboard',
  imports: [DatePipe, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Olá, {{ (data()?.user?.name ?? auth.account()?.name ?? '').split(' ')[0] }}</h1>
        <p>Resumo do site e do clube{{ data() ? ' · época ' + data()!.stats.season : '' }}.</p>
      </div>
      <div class="quick">
        @if (auth.hasRole('editor')) {
          <a class="btn btn--primary btn--sm" routerLink="/admin/conteudos/news/novo"><sfc-icon name="file" size="16" />Nova notícia</a>
          <a class="btn btn--outline btn--sm" routerLink="/admin/conteudos/events/novo"><sfc-icon name="calendar" size="16" />Novo evento</a>
        }
        @if (auth.hasRole('secretaria')) {
          <a class="btn btn--outline btn--sm" routerLink="/admin/resultados"><sfc-icon name="trophy" size="16" />Importar resultados</a>
        }
      </div>
    </div>

    @if (error()) {
      <p class="alert alert--warning adm-error" role="alert">{{ error() }}</p>
    }

    @if (data(); as d) {
      <div class="tiles">
        @if (auth.hasRole('editor')) {
          <a class="tile" routerLink="/admin/conteudos/news">
            <span class="tile__label">Notícias publicadas</span>
            <span class="tile__value">{{ d.stats.newsPublished }}</span>
            <span class="tile__hint">{{ d.stats.newsDrafts }} em rascunho</span>
          </a>
          <a class="tile" routerLink="/admin/conteudos/events">
            <span class="tile__label">Próximos eventos</span>
            <span class="tile__value">{{ d.stats.eventsUpcoming }}</span>
            <span class="tile__hint">{{ d.stats.otherDrafts }} outros rascunhos</span>
          </a>
        }
        @if (auth.hasRole('secretaria', 'treinador')) {
          <a class="tile" routerLink="/admin/atletas">
            <span class="tile__label">Atletas</span>
            <span class="tile__value">{{ d.stats.athletes }}</span>
            <span class="tile__hint">{{ d.stats.athletesToConfirm }} fichas por confirmar</span>
          </a>
        }
        @if (auth.hasRole('secretaria')) {
          <a class="tile" [class.tile--alert]="d.stats.changeRequests + d.stats.documentsToReview > 0" routerLink="/admin/validacoes">
            <span class="tile__label">Por validar</span>
            <span class="tile__value">{{ d.stats.changeRequests + d.stats.documentsToReview }}</span>
            <span class="tile__hint">{{ d.stats.changeRequests }} pedidos · {{ d.stats.documentsToReview }} documentos</span>
          </a>
        }
      </div>

      <div class="cols">
        @if (auth.hasRole('secretaria')) {
          <section class="adm-panel">
            <h2>Precisa de atenção</h2>
            @if (!d.attention.requests.length && !d.attention.documents.length) {
              <p class="adm-empty"><sfc-icon name="check" size="20" /> Nada pendente. Bom trabalho!</p>
            }
            <ul class="todo">
              @for (r of d.attention.requests; track r.id) {
                <li>
                  <span class="st st--warn">Pedido</span>
                  <span class="todo__text"><strong>{{ r.athleteName }}</strong> pede alteração de {{ fields(r.changes) }}</span>
                  <a routerLink="/admin/validacoes" class="link-arrow">Rever</a>
                </li>
              }
              @for (doc of d.attention.documents; track doc.id) {
                <li>
                  <span class="st st--muted">Documento</span>
                  <span class="todo__text"><strong>{{ doc.athleteName }}</strong> · {{ docLabel(doc.kind) }}</span>
                  <a routerLink="/admin/validacoes" class="link-arrow">Validar</a>
                </li>
              }
            </ul>
          </section>
        }
        <section class="adm-panel">
          <h2>Atividade recente</h2>
          @if (!d.activity.length) {
            <p class="adm-empty">Ainda sem atividade registada.</p>
          }
          <ol class="feed">
            @for (a of d.activity; track a.id) {
              <li>
                <span class="feed__dot" aria-hidden="true"></span>
                <span>
                  <strong>{{ a.actor ?? 'Sistema' }}</strong> {{ label(a.action) }}
                  @if (a.details['titulo'] || a.details['slug']) {
                    <em>«{{ a.details['titulo'] ?? a.details['slug'] }}»</em>
                  }
                  <span class="caption">{{ a.at | date: 'dd/MM HH:mm' }}</span>
                </span>
              </li>
            }
          </ol>
          <a routerLink="/admin/auditoria" class="link-arrow">Ver registo completo</a>
        </section>
      </div>
    } @else if (!error()) {
      <p class="adm-empty">A carregar…</p>
    }
  `,
  styles: `
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .tile {
      display: grid;
      gap: 0.25rem;
      padding: 1.1rem 1.2rem;
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: var(--radius);
      color: var(--color-text);
      text-decoration: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      &:hover {
        border-color: var(--sfc-blue);
        box-shadow: var(--shadow);
      }
      &--alert {
        border-left: 5px solid var(--sfc-yellow);
      }
    }
    .tile__label {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-muted);
    }
    .tile__value {
      font: 800 2.4rem/1 var(--font-display);
      font-variant-numeric: tabular-nums;
    }
    .tile__hint {
      font-size: 0.84rem;
      color: var(--color-muted);
    }
    .cols {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
      gap: 1rem;
      align-items: start;
    }
    .todo {
      list-style: none;
      margin: 0;
      padding: 0;
      li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem 0.7rem;
        padding: 0.6rem 0;
        border-top: 1px solid var(--color-line);
      }
    }
    .todo__text {
      flex: 1 1 200px;
      font-size: 0.9rem;
    }
    .feed {
      list-style: none;
      margin: 0 0 0.8rem;
      padding: 0;
      li {
        display: flex;
        gap: 0.7rem;
        padding: 0.45rem 0;
        font-size: 0.9rem;
      }
      em {
        font-style: normal;
        color: var(--sfc-blue-900);
      }
      .caption {
        display: block;
      }
    }
    .feed__dot {
      flex: none;
      width: 9px;
      height: 9px;
      margin-top: 0.4rem;
      border-radius: 50%;
      background: var(--sfc-blue);
    }
  `,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  private readonly source = inject(AdminSource);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal('');
  protected readonly label = actionLabel;
  protected readonly docLabel = (k: string) => DOC_LABELS[k] ?? k;
  protected readonly fields = (c: Record<string, string>) =>
    Object.keys(c)
      .map((k) => FIELD_LABELS[k] ?? k)
      .join(', ');

  constructor() {
    this.source
      .dashboard()
      .then((d) => this.data.set(d))
      .catch((e: Error) => this.error.set(e.message));
  }
}
