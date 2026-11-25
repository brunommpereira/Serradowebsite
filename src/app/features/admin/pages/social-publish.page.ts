import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClient } from '../../../core/api/api-client';
import { CmsEntry } from '../../../core/cms/cms.models';
import { IconComponent } from '../../../shared/icon.component';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';
import { MediaPickerComponent } from '../media/media-picker.component';

type Network = 'facebook' | 'instagram';
type PostStatus = 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';

interface Status {
  configured: boolean;
  page: string | null;
  instagram: string | null;
  error: string | null;
}

interface SocialPost {
  id: number;
  network: Network;
  newsId: number | null;
  newsTitle: string | null;
  caption: string;
  link: string | null;
  imageUrl: string | null;
  scheduledAt: string;
  status: PostStatus;
  attempts: number;
  error: string | null;
  permalink: string | null;
  createdAt: string;
  publishedAt: string | null;
  createdByName: string | null;
}

const STATUS: Record<PostStatus, string> = {
  scheduled: 'Agendada',
  publishing: 'A publicar',
  published: 'Publicada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};
const MAX = 2200;

/** Publicar no Facebook e no Instagram do clube: agora ou agendado, a partir de uma notícia ou com texto livre. */
@Component({
  selector: 'sfc-admin-social-publish',
  imports: [DatePipe, FormsModule, RouterLink, IconComponent, OfflineNoticeComponent, MediaPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Publicar nas redes</h1>
        <p>Publica no Facebook e no Instagram do clube, agora ou à hora marcada. Podes partir de uma notícia do site ou escrever um texto novo.</p>
      </div>
    </div>
    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="A publicação nas redes funciona com o site ligado à API (VPS)." />
    } @else {
      @if (status(); as st) {
        @if (!st.configured) {
          <p class="alert alert--warning" role="status">
            <sfc-icon name="warning" size="18" />
            <span>O Facebook ainda não está ligado no servidor. Segue o guia «Publicar nas redes» (docs/DEPLOY-VPS.md, secção 5c) e corre <code>sudo serrado facebook</code>.</span>
          </p>
        } @else if (st.error) {
          <p class="alert alert--warning" role="status">
            <sfc-icon name="warning" size="18" /><span>A Meta recusou o acesso: {{ st.error }}. Gera um token novo com as permissões de publicação.</span>
          </p>
        } @else {
          <p class="linked">
            <span><sfc-icon name="facebook" size="18" /> {{ st.page }}</span>
            @if (st.instagram) {
              <span><sfc-icon name="instagram" size="18" /> &#64;{{ st.instagram }}</span>
            } @else {
              <span class="muted">Sem conta de Instagram profissional ligada à página</span>
            }
          </p>
        }
      }

      <section class="adm-panel block">
        <div class="grid">
          <div class="field wide">
            <label for="s-news">A partir de uma notícia <small>(opcional: preenche o texto, o link e a imagem)</small></label>
            <select id="s-news" name="news" [ngModel]="newsId()" (ngModelChange)="pickNews($event)">
              <option [ngValue]="null">— Texto livre —</option>
              @for (n of news(); track n.id) {
                <option [ngValue]="n.id">{{ n['title'] }}{{ n.status === 'published' ? '' : ' (' + (n.status === 'draft' ? 'rascunho' : 'arquivada') + ')' }}</option>
              }
            </select>
            @if (newsDraft()) {
              <small class="caption warn">Esta notícia ainda está em rascunho: publica-a no site antes, para o link funcionar.</small>
            }
          </div>

          <fieldset class="field wide nets">
            <legend>Onde publicar</legend>
            <label class="check"><input type="checkbox" name="fb" [(ngModel)]="f.facebook" /> <sfc-icon name="facebook" size="18" /> Facebook</label>
            <label class="check" [class.off]="!instagramOk()">
              <input type="checkbox" name="ig" [(ngModel)]="f.instagram" [disabled]="!instagramOk()" /> <sfc-icon name="instagram" size="18" /> Instagram
            </label>
          </fieldset>

          <div class="field wide">
            <label for="s-text">Texto <span class="req">*</span></label>
            <textarea id="s-text" name="caption" rows="9" [(ngModel)]="f.caption" [attr.maxlength]="max"></textarea>
            <small class="caption" [class.warn]="hashtags() > 30">
              {{ f.caption.length }} / {{ max }} caracteres · {{ hashtags() }} hashtags
              @if (f.instagram) {
                · no Instagram os links do texto não são clicáveis (escreve «link na bio» ou põe o endereço curto)
              }
            </small>
          </div>

          <div class="field wide">
            <label for="s-link">Link <small>(no Facebook vai no fim do texto, se ainda não estiver lá)</small></label>
            <input id="s-link" name="link" type="url" placeholder="https://" [(ngModel)]="f.link" maxlength="500" />
          </div>

          <div class="field wide">
            <span class="lbl">Imagem @if (f.instagram) {<span class="req">*</span>}</span>
            <div class="cover">
              @if (f.imageUrl) {
                <img class="cover__img" [src]="f.imageUrl" alt="Imagem a publicar" />
              } @else {
                <div class="cover__empty"><sfc-icon name="image" size="28" /><span>Sem imagem</span></div>
              }
              <div class="cover__actions">
                <button type="button" class="btn btn--outline btn--sm" (click)="picker.show()">{{ f.imageUrl ? 'Trocar imagem' : 'Escolher imagem' }}</button>
                @if (f.imageUrl) {
                  <button type="button" class="linkish linkish--danger" (click)="f.imageUrl = ''">Remover</button>
                }
              </div>
            </div>
            <small class="caption">Formato ideal: 1080×1350 (vertical) ou 1080×1080. Vai em JPEG; se for muito larga, ganha margens brancas.</small>
            <sfc-media-picker #picker (picked)="f.imageUrl = $event.url" />
          </div>

          <fieldset class="field wide when">
            <legend>Quando</legend>
            <label class="check"><input type="radio" name="when" value="now" [(ngModel)]="f.when" /> Agora</label>
            <label class="check"><input type="radio" name="when" value="later" [(ngModel)]="f.when" /> Agendar</label>
            @if (f.when === 'later') {
              <input type="datetime-local" name="at" aria-label="Data e hora" [(ngModel)]="f.at" [min]="minLocal" />
              <small class="caption">Sai até 15 minutos depois da hora marcada.</small>
            }
          </fieldset>
        </div>

        @if (error(); as m) {
          <p class="alert alert--warning" role="alert">{{ m }}</p>
        }
        @if (done(); as m) {
          <p class="alert alert--success" role="status"><sfc-icon name="check" size="18" /><span>{{ m }}</span></p>
        }
        <div class="actions">
          @if (!confirming()) {
            <button type="button" class="btn btn--primary" [disabled]="busy() || !ready()" (click)="confirming.set(true)">
              {{ f.when === 'now' ? 'Publicar agora' : 'Agendar' }}
            </button>
          } @else {
            <span class="confirm">
              {{ f.when === 'now' ? 'Publicar já' : 'Agendar' }} em <strong>{{ targets() }}</strong>
              @if (f.when === 'later') {
                para {{ f.at | date: 'dd/MM HH:mm' }}
              }
              ?
            </span>
            <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="submit()">Confirmar</button>
            <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="confirming.set(false)">Voltar</button>
          }
        </div>
      </section>

      <section class="adm-panel block">
        <div class="list-head">
          <h2>Publicações</h2>
          <button type="button" class="btn btn--outline btn--sm" (click)="loadPosts()">Atualizar</button>
        </div>
        @if (!posts().length) {
          <p class="adm-empty">Ainda não há publicações feitas a partir do site.</p>
        } @else {
          <ul class="posts">
            @for (p of posts(); track p.id) {
              <li>
                @if (p.imageUrl) {
                  <img [src]="p.imageUrl" alt="" loading="lazy" />
                } @else {
                  <div class="noimg"><sfc-icon name="file" size="22" /></div>
                }
                <div class="info">
                  <p class="meta">
                    <sfc-icon [name]="p.network" size="16" />
                    <span class="st" [class]="'st st--' + p.status">{{ label[p.status] }}</span>
                    {{ (p.publishedAt || p.scheduledAt) | date: 'dd/MM/y HH:mm' }}
                    @if (p.newsTitle) {
                      · <a [routerLink]="['/admin/conteudos/news', p.newsId]">{{ p.newsTitle }}</a>
                    }
                    @if (p.createdByName) {
                      · {{ p.createdByName }}
                    }
                  </p>
                  <p class="cap">{{ p.caption }}</p>
                  @if (p.error && p.status !== 'published') {
                    <p class="err">{{ p.error }}</p>
                  }
                  <p class="acts">
                    @if (p.permalink) {
                      <a [href]="p.permalink" target="_blank" rel="noopener">Ver na rede <sfc-icon name="external" size="14" /></a>
                    }
                    @if (p.status === 'scheduled') {
                      <button type="button" class="linkish linkish--danger" (click)="act(p, 'cancel')">Cancelar</button>
                    }
                    @if (p.status === 'failed') {
                      <button type="button" class="linkish" (click)="act(p, 'retry')">Tentar de novo</button>
                    }
                    <button type="button" class="linkish" (click)="reuse(p)">Usar este texto</button>
                  </p>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    .linked { display: flex; gap: 1.2rem; flex-wrap: wrap; align-items: center; margin: 0 0 1rem; font-weight: 600;
      span { display: inline-flex; gap: 0.35rem; align-items: center; } .muted { font-weight: 400; color: var(--color-text-muted, #5b6474); } }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem 1rem; .wide { grid-column: 1 / -1; } }
    fieldset { border: 0; padding: 0; margin: 0; display: flex; gap: 1.2rem; flex-wrap: wrap; align-items: center;
      legend { font-weight: 600; margin-bottom: 0.35rem; padding: 0; } }
    .check { display: inline-flex; gap: 0.4rem; align-items: center; cursor: pointer; &.off { opacity: 0.5; cursor: not-allowed; } }
    .lbl { display: block; font-weight: 600; margin-bottom: 0.35rem; }
    .warn { color: #a15c00; }
    .cover { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
    .cover__img, .cover__empty { width: 160px; height: 200px; object-fit: cover; border-radius: 10px; background: #f1f3f8; }
    .cover__empty { display: grid; place-content: center; justify-items: center; gap: 0.3rem; color: #5b6474; font-size: 0.85rem; }
    .cover__actions { display: flex; gap: 0.8rem; align-items: center; }
    .actions { margin-top: 1rem; display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
    .confirm { font-weight: 500; }
    .list-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; h2 { margin: 0; font-size: 1.15rem; } }
    .posts { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.8rem;
      li { display: flex; gap: 0.9rem; align-items: flex-start; padding-bottom: 0.8rem; border-bottom: 1px solid #e3e7ef; }
      img, .noimg { width: 72px; height: 90px; object-fit: cover; border-radius: 8px; flex: none; background: #f1f3f8; display: grid; place-content: center; }
      .info { min-width: 0; flex: 1; }
      p { margin: 0 0 0.3rem; }
      .meta { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; font-size: 0.88rem; color: #5b6474; }
      .cap { white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .err { color: #a32020; font-size: 0.88rem; }
      .acts { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.9rem; a { display: inline-flex; gap: 0.25rem; align-items: center; } } }
    .st { padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; background: #eef1f6; color: #33415c; }
    .st--published { background: #e7f4ea; color: #00632f; }
    .st--failed { background: #fbebeb; color: #a32020; }
    .st--scheduled, .st--publishing { background: #e6eef8; color: #004a8e; }
  `,
})
export class SocialPublishPage implements OnDestroy {
  protected readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly max = MAX;
  protected readonly label = STATUS;
  protected readonly status = signal<Status | null>(null);
  protected readonly news = signal<CmsEntry[]>([]);
  protected readonly newsId = signal<number | null>(null);
  protected readonly posts = signal<SocialPost[]>([]);
  protected readonly busy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal<string | null>(null);
  protected readonly instagramOk = computed(() => !!this.status()?.instagram);
  protected readonly newsDraft = computed(() => {
    const n = this.news().find((x) => x.id === this.newsId());
    return !!n && n.status !== 'published';
  });
  protected readonly minLocal = localInput(new Date());
  protected f = { facebook: true, instagram: false, caption: '', link: '', imageUrl: '', when: 'now' as 'now' | 'later', at: '' };
  private poll: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (this.api.enabled) void this.init();
  }

  ngOnDestroy() {
    if (this.poll) clearTimeout(this.poll);
  }

  protected hashtags() {
    return (this.f.caption.match(/#[\p{L}\p{N}_]/gu) ?? []).length;
  }

  protected targets() {
    return [this.f.facebook && 'Facebook', this.f.instagram && 'Instagram'].filter(Boolean).join(' e ');
  }

  protected ready() {
    const f = this.f;
    if (!this.status()?.configured || !f.caption.trim() || f.caption.length > MAX) return false;
    if (!f.facebook && !f.instagram) return false;
    if (f.instagram && (!f.imageUrl || this.hashtags() > 30)) return false;
    if (f.link && !/^https:\/\/\S+$/.test(f.link.trim())) return false;
    return f.when === 'now' || !!f.at;
  }

  protected pickNews(id: number | null) {
    this.newsId.set(id);
    const n = this.news().find((x) => x.id === id);
    if (!n) return;
    const url = `${location.origin}/noticias/${n.slug}`;
    const summary = String(n['summary'] ?? '').trim();
    this.f.caption = [String(n['title'] ?? ''), summary, `Lê a notícia completa no site: ${url}`, '#SerradoFC #Almada'].filter(Boolean).join('\n\n');
    this.f.link = url;
    if (n['coverUrl']) this.f.imageUrl = String(n['coverUrl']);
  }

  protected reuse(p: SocialPost) {
    this.f.caption = p.caption;
    this.f.link = p.link ?? '';
    this.f.imageUrl = p.imageUrl ?? '';
    this.newsId.set(p.newsId);
    this.done.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected async submit() {
    const f = this.f;
    this.busy.set(true);
    this.error.set(null);
    this.done.set(null);
    try {
      const body = {
        networks: [f.facebook && 'facebook', f.instagram && 'instagram'].filter(Boolean),
        caption: f.caption.trim(),
        link: f.link.trim() || undefined,
        imageUrl: f.imageUrl || undefined,
        newsId: this.newsId() ?? undefined,
        scheduledAt: f.when === 'later' ? new Date(f.at).toISOString() : undefined,
      };
      const created = await this.api.post<SocialPost[]>('/admin/social-posts', body);
      this.done.set(
        f.when === 'now'
          ? `A publicar em ${this.targets()}. O estado aparece em baixo daqui a uns segundos.`
          : `Agendado para ${new Date(f.at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })} em ${this.targets()}.`,
      );
      this.posts.update((l) => [...created.slice().reverse(), ...l.filter((x) => !created.some((c) => c.id === x.id))]);
      this.confirming.set(false);
      this.f = { ...f, caption: '', link: '', imageUrl: '', when: 'now', at: '' };
      this.newsId.set(null);
      this.schedulePoll();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async act(p: SocialPost, action: 'cancel' | 'retry') {
    try {
      await this.api.post(`/admin/social-posts/${p.id}/${action}`);
      await this.loadPosts();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  async loadPosts() {
    try {
      this.posts.set(await this.api.get<SocialPost[]>('/admin/social-posts'));
      this.schedulePoll();
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  /** Enquanto houver publicações «agora» a sair, atualiza a lista de 4 em 4 segundos. */
  private schedulePoll() {
    if (this.poll) clearTimeout(this.poll);
    const now = Date.now();
    const pending = this.posts().some((p) => p.status === 'publishing' || (p.status === 'scheduled' && new Date(p.scheduledAt).getTime() <= now + 5_000));
    if (pending) this.poll = setTimeout(() => void this.loadPosts(), 4000);
  }

  private async init() {
    const wanted = Number(this.route.snapshot.queryParamMap.get('news')) || null;
    const [status, news] = await Promise.all([
      this.api.get<Status>('/admin/social-posts/status').catch((e: Error) => ({ configured: false, page: null, instagram: null, error: e.message })),
      this.api.get<{ items: CmsEntry[] }>('/admin/cms/news', { limit: 200 }).catch(() => ({ items: [] as CmsEntry[] })),
    ]);
    this.status.set(status);
    this.f.instagram = !!status.instagram;
    this.news.set(news.items);
    if (wanted && news.items.some((n) => n.id === wanted)) this.pickNews(wanted);
    await this.loadPosts();
  }
}

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
