import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiClient } from '../core/api/api-client';
import { ContentService } from '../core/services/content.service';
import { DialogComponent } from './dialog.component';
import { IconComponent } from './icon.component';

export interface SocialItem {
  id: number;
  kind: 'reel' | 'story';
  caption: string;
  permalink: string | null;
  mediaType: 'photo' | 'video';
  thumbUrl: string;
  durationSeconds: number | null;
  postedAt: string;
  expiresAt: string | null;
}

/** Só endereços do Facebook entram no leitor (o servidor já os valida; aqui fica a segunda barreira). */
const FACEBOOK = /^https:\/\/(www\.|m\.)?facebook\.com\//;

/**
 * Reels e histórias da página de Facebook do clube (importados no servidor a cada 15 minutos).
 * O vídeo só é carregado do Facebook quando o visitante carrega em «ver» (privacidade e rapidez).
 * Sem API (site de demonstração) ou sem nada para mostrar, não aparece.
 */
@Component({
  selector: 'sfc-social-feed',
  imports: [DialogComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stories().length || reels().length) {
      <section class="section social" aria-labelledby="h-social">
        <div class="container">
          <div class="section-head">
            <div>
              <p class="eyebrow">No Facebook</p>
              <h2 id="h-social">{{ reels().length ? 'Reels e histórias' : 'Histórias' }}</h2>
            </div>
            @if (pageUrl) {
              <a class="link-arrow" [href]="pageUrl" target="_blank" rel="noopener"><sfc-icon name="facebook" size="18" />Seguir a página</a>
            }
          </div>

          @if (stories().length) {
            <ul class="stories" aria-label="Histórias das últimas 24 horas">
              @for (s of stories(); track s.id) {
                <li>
                  <button type="button" class="story" (click)="current.set(s)">
                    <span class="story__ring"><img [src]="s.thumbUrl" alt="" loading="lazy" /></span>
                    <span class="caption">{{ ago(s.postedAt) }}</span>
                    <span class="visually-hidden">Ver história publicada {{ ago(s.postedAt) }}</span>
                  </button>
                </li>
              }
            </ul>
          }

          @if (reels().length) {
            <ul class="reels">
              @for (r of reels(); track r.id) {
                <li>
                  <button type="button" class="reel" (click)="current.set(r)">
                    <img [src]="r.thumbUrl" [alt]="r.caption || 'Reel do Serrado FC'" loading="lazy" />
                    <span class="reel__play" aria-hidden="true"><sfc-icon name="play" size="26" /></span>
                    @if (r.durationSeconds) {
                      <span class="reel__time">{{ duration(r.durationSeconds) }}</span>
                    }
                    @if (r.caption) {
                      <span class="reel__caption">{{ r.caption }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      </section>

      <sfc-dialog [heading]="current()?.kind === 'story' ? 'História' : 'Reel'" [open]="!!current()" (closed)="current.set(null)">
        @if (current(); as c) {
          <div class="viewer">
            @if (c.kind === 'reel' && embed(); as src) {
              <iframe [src]="src" title="Reel do Serrado FC no Facebook" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>
              <p class="caption">O vídeo é carregado a partir do Facebook.</p>
            } @else {
              <img [src]="c.thumbUrl" [alt]="c.caption || 'História do Serrado FC'" />
            }
            @if (c.caption) {
              <p>{{ c.caption }}</p>
            }
            @if (safeLink(c); as link) {
              <a class="btn btn--outline btn--sm" [href]="link" target="_blank" rel="noopener"><sfc-icon name="external" size="16" />Ver no Facebook</a>
            }
          </div>
        }
      </sfc-dialog>
    }
  `,
  styles: `
    .stories {
      list-style: none;
      margin: 0 0 1.5rem;
      padding: 0.2rem 0;
      display: flex;
      gap: 1rem;
      overflow-x: auto;
    }
    .story {
      display: grid;
      justify-items: center;
      gap: 0.35rem;
      border: 0;
      background: none;
      padding: 0;
      cursor: pointer;
      color: inherit;
    }
    .story__ring {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      padding: 3px;
      background: linear-gradient(135deg, var(--color-accent, #ffd21f), var(--color-primary, #0a4ea2));
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
        border: 3px solid var(--color-bg, #fff);
        display: block;
      }
    }
    .reels {
      list-style: none;
      margin: 0;
      padding: 0 0 0.5rem;
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(180px, 220px);
      gap: 1rem;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      li {
        scroll-snap-align: start;
      }
    }
    .reel {
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 9 / 16;
      border: 0;
      padding: 0;
      border-radius: var(--radius-m, 14px);
      overflow: hidden;
      background: #111;
      cursor: pointer;
      color: #fff;
      text-align: left;
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.3s;
      }
      &:hover img,
      &:focus-visible img {
        transform: scale(1.04);
      }
    }
    .reel__play {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: linear-gradient(to top, rgb(0 0 0 / 0.65), transparent 55%);
    }
    .reel__time {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
      background: rgb(0 0 0 / 0.55);
      padding: 0.1rem 0.4rem;
      border-radius: 6px;
    }
    .reel__caption {
      position: absolute;
      left: 0.7rem;
      right: 0.7rem;
      bottom: 0.7rem;
      font-size: 0.85rem;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .viewer {
      display: grid;
      gap: 0.8rem;
      justify-items: center;
      text-align: center;
      iframe,
      img {
        width: min(100%, 360px);
        aspect-ratio: 9 / 16;
        border: 0;
        border-radius: var(--radius-m, 14px);
        background: #111;
        object-fit: contain;
      }
      p {
        margin: 0;
      }
    }
  `,
})
export class SocialFeedComponent {
  private readonly api = inject(ApiClient);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly pageUrl = inject(ContentService).club.social.facebook || null;
  protected readonly stories = signal<SocialItem[]>([]);
  protected readonly reels = signal<SocialItem[]>([]);
  protected readonly current = signal<SocialItem | null>(null);
  /** Leitor do Facebook para o reel aberto (só se o endereço for mesmo do Facebook) */
  protected readonly embed = computed<SafeResourceUrl | null>(() => {
    const link = this.safeLink(this.current());
    if (!link) return null;
    const src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(link)}&show_text=false&width=360`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(src);
  });

  constructor() {
    if (!this.api.enabled || typeof window === 'undefined') return;
    this.api.get<SocialItem[]>('/content/social', { kind: 'story', limit: 12 }).then((l) => this.stories.set(l), () => undefined);
    this.api.get<SocialItem[]>('/content/social', { kind: 'reel', limit: 12 }).then((l) => this.reels.set(l), () => undefined);
  }

  protected safeLink(item: SocialItem | null) {
    return item?.permalink && FACEBOOK.test(item.permalink) ? item.permalink : null;
  }

  protected ago(iso: string) {
    const h = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000));
    return h < 1 ? 'agora' : `há ${h} h`;
  }

  protected duration(s: number) {
    const t = Math.round(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
}
