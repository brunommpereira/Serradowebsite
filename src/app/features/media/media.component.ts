import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { IconComponent } from '../../shared/icon.component';

const SPORT_OF: Record<string, string> = { Atletismo: 'atletismo', Futsal: 'futsal', Rugby: 'rugby', Eventos: 'formacao', Comunidade: 'escola-de-desporto' };

@Component({
  selector: 'sfc-media',
  imports: [DatePipe, PageHeroComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Multimédia" title="Fotografias e vídeos" subtitle="Os melhores momentos do Serrado FC." [crumbs]="[{ label: 'Multimédia' }]" />
    <section class="section">
      <div class="container">
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Categoria">
            <button class="chip" type="button" [attr.aria-pressed]="!category()" (click)="category.set('')">Todas</button>
            @for (c of categories; track c) {
              <button class="chip" type="button" [attr.aria-pressed]="category() === c" (click)="category.set(c)">{{ c }}</button>
            }
          </div>
          <div class="chips" role="group" aria-label="Tipo">
            <button class="chip" type="button" [attr.aria-pressed]="kind() === ''" (click)="kind.set('')">Tudo</button>
            <button class="chip" type="button" [attr.aria-pressed]="kind() === 'foto'" (click)="kind.set('foto')">Fotografias</button>
            <button class="chip" type="button" [attr.aria-pressed]="kind() === 'video'" (click)="kind.set('video')">Vídeos</button>
          </div>
        </div>
        <ul class="gallery">
          @for (g of items(); track g.id) {
            <li>
              <button type="button" class="tile media-ph" [attr.data-sport]="sportOf[g.category]" (click)="open.set(g.id)" [attr.aria-label]="'Abrir ' + g.title">
                <sfc-icon [name]="g.kind === 'video' ? 'play' : 'image'" size="40" />
              </button>
              <p class="tile__title">{{ g.title }}</p>
              <p class="caption">{{ g.category }} · {{ g.date | date: 'd MMM y' }}</p>
            </li>
          } @empty {
            <li class="muted">Sem conteúdos nesta categoria.</li>
          }
        </ul>
        <p class="caption center note">As galerias serão alimentadas pelo backoffice e poderão integrar YouTube, Instagram e Facebook.</p>
      </div>
    </section>

    @if (selected(); as s) {
      <div class="lightbox" role="dialog" aria-modal="true" [attr.aria-label]="s.title" (click)="open.set(null)" (keydown.escape)="open.set(null)">
        <div class="lightbox__inner" (click)="$event.stopPropagation()">
          <div class="lightbox__media media-ph" [attr.data-sport]="sportOf[s.category]"><sfc-icon [name]="s.kind === 'video' ? 'play' : 'image'" size="64" /></div>
          <p><strong>{{ s.title }}</strong> · {{ s.date | date: 'd MMMM y' }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="open.set(null)">Fechar</button>
        </div>
      </div>
    }
  `,
  styles: `
    .toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; margin-bottom: 2rem; }
    .gallery { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.2rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); p { margin: 0; } }
    .tile { width: 100%; aspect-ratio: 4 / 3; border: 0; border-radius: var(--radius); cursor: pointer; margin-bottom: 0.6rem; transition: transform 0.2s; &:hover { transform: scale(1.02); } }
    .tile__title { font-weight: 700; }
    .note { margin-top: 2.5rem; }
    .lightbox { position: fixed; inset: 0; z-index: 300; background: rgba(5, 15, 35, 0.85); display: grid; place-items: center; padding: 16px; }
    .lightbox__inner { background: #fff; border-radius: var(--radius); padding: 1rem; width: min(820px, 100%); display: grid; gap: 0.8rem; justify-items: start; p { margin: 0; } }
    .lightbox__media { width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-s); }
  `,
})
export class MediaComponent {
  /** ?tipo=video */
  readonly tipo = input<string>();
  private readonly all = inject(ContentService).gallery();
  protected readonly categories = [...new Set(this.all.map((g) => g.category))];
  protected readonly sportOf = SPORT_OF;
  protected readonly category = signal('');
  protected readonly kind = linkedSignal(() => this.tipo() ?? '');
  protected readonly items = computed(() => this.all.filter((g) => (!this.category() || g.category === this.category()) && (!this.kind() || g.kind === this.kind())));
  protected readonly open = signal<number | null>(null);
  protected readonly selected = computed(() => this.all.find((g) => g.id === this.open()));

  constructor() {
    inject(SeoService).set({ title: 'Multimédia', description: 'Fotografias e vídeos do Serrado FC: atletismo, futsal, rugby, eventos e comunidade.', path: '/multimedia' });
  }
}
