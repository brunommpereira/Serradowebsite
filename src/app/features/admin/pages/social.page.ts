import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiClient } from '../../../core/api/api-client';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { SocialItem } from '../../../shared/social-feed.component';

type AdminItem = SocialItem & { hidden: boolean; expired: boolean };

/** Reels e histórias importados da página de Facebook: ver o que está no site e esconder o que não deve aparecer. */
@Component({
  selector: 'sfc-admin-social',
  imports: [DatePipe, IconComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Reels e histórias</h1>
        <p>
          Vêm da página de Facebook do clube a cada 15 minutos e aparecem na página inicial e em Multimédia. As histórias só se
          veem durante 24 horas. Esconde o que não deve aparecer no site.
        </p>
      </div>
    </div>

    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="Os reels e histórias do Facebook são importados no servidor (VPS)." />
    } @else {
      <div class="chips" role="group" aria-label="Tipo">
        <button type="button" class="chip" [attr.aria-pressed]="kind() === 'reel'" (click)="kind.set('reel')">Reels ({{ count('reel') }})</button>
        <button type="button" class="chip" [attr.aria-pressed]="kind() === 'story'" (click)="kind.set('story')">Histórias ({{ count('story') }})</button>
      </div>

      @if (message(); as m) {
        <p class="alert" [class.alert--success]="m.ok" [class.alert--warning]="!m.ok" role="status">{{ m.text }}</p>
      }

      <ul class="grid">
        @for (i of rows(); track i.id) {
          <li class="adm-panel item" [class.off]="i.hidden || i.expired">
            @if (i.thumbUrl) {
              <img [src]="i.thumbUrl" [alt]="i.caption || 'Miniatura'" loading="lazy" />
            } @else {
              <div class="noimg"><sfc-icon name="image" size="28" /></div>
            }
            <div class="meta">
              <span class="caption">{{ i.postedAt | date: 'dd/MM/y HH:mm' }}</span>
              @if (i.expired) {
                <span class="st st--warn">Expirada</span>
              } @else if (i.hidden) {
                <span class="st st--bad">Escondido</span>
              } @else if (!i.thumbUrl) {
                <span class="st st--warn">Sem miniatura</span>
              } @else {
                <span class="st st--ok">No site</span>
              }
            </div>
            @if (i.caption) {
              <p class="cap">{{ i.caption }}</p>
            }
            <div class="actions">
              @if (i.permalink) {
                <a class="btn btn--outline btn--sm" [href]="i.permalink" target="_blank" rel="noopener">Facebook</a>
              }
              <button type="button" class="btn btn--sm" [class.btn--primary]="i.hidden" [class.btn--outline]="!i.hidden" (click)="toggle(i)">
                {{ i.hidden ? 'Mostrar' : 'Esconder' }}
              </button>
            </div>
          </li>
        } @empty {
          <li class="adm-empty">
            {{ loading() ? 'A carregar…' : 'Nada importado ainda. Confirma no servidor: serrado facebook check (e as permissões do token).' }}
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .chips {
      margin-bottom: 1rem;
    }
    .alert {
      margin-bottom: 1rem;
    }
    .grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
    }
    .item {
      display: grid;
      gap: 0.5rem;
      align-content: start;
      img,
      .noimg {
        width: 100%;
        aspect-ratio: 9 / 16;
        object-fit: cover;
        border-radius: var(--radius-s);
        background: var(--color-bg-soft);
      }
      .noimg {
        display: grid;
        place-items: center;
        color: var(--color-muted);
      }
      &.off img {
        opacity: 0.45;
      }
    }
    .meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
    }
    .cap {
      margin: 0;
      font-size: 0.88rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .actions {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
  `,
})
export class SocialPage {
  protected readonly api = inject(ApiClient);
  protected readonly all = signal<AdminItem[]>([]);
  protected readonly kind = signal<'reel' | 'story'>('reel');
  protected readonly loading = signal(true);
  protected readonly message = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly rows = computed(() => this.all().filter((i) => i.kind === this.kind()));

  constructor() {
    if (this.api.enabled) void this.load();
  }

  protected count(kind: 'reel' | 'story') {
    return this.all().filter((i) => i.kind === kind).length;
  }

  async toggle(i: AdminItem) {
    try {
      await this.api.patch(`/admin/social/${i.id}`, { hidden: !i.hidden });
      this.all.update((l) => l.map((x) => (x.id === i.id ? { ...x, hidden: !i.hidden } : x)));
      this.message.set({ ok: true, text: i.hidden ? 'Volta a aparecer no site (pode demorar 1 minuto).' : 'Escondido do site (pode demorar 1 minuto).' });
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    }
  }

  private async load() {
    try {
      this.all.set(await this.api.get<AdminItem[]>('/admin/social'));
    } catch (e) {
      this.message.set({ ok: false, text: (e as Error).message });
    } finally {
      this.loading.set(false);
    }
  }
}
