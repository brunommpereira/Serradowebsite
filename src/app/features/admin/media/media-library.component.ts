import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/icon.component';
import { AdminSource, MediaItem, MediaUsage } from '../data/admin-source';
import { ACCEPTED_IMAGES, formatBytes, prepareImage } from './image-tools';

interface Upload {
  id: number;
  name: string;
  state: 'a preparar' | 'a enviar' | 'erro';
  error?: string;
}

/**
 * Biblioteca de imagens: carregar (botão ou arrastar), pesquisar, descrever (texto alternativo) e apagar.
 * Em modo «picker» serve para escolher uma imagem (editor de texto e imagem de capa).
 */
@Component({
  selector: 'sfc-media-library',
  imports: [DatePipe, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="drop"
      [class.drop--over]="dragOver()"
      (dragover)="$event.preventDefault(); dragOver.set(true)"
      (dragleave)="dragOver.set(false)"
      (drop)="onDrop($event)"
    >
      <sfc-icon name="upload" size="26" />
      <p>
        Arrasta imagens para aqui ou
        <label class="drop__pick">escolhe ficheiros<input type="file" multiple [accept]="accepted" (change)="onPick($event)" /></label>
      </p>
      <p class="caption">JPEG, PNG, WebP ou GIF. São reduzidas para {{ source.mediaMaxSize }} px e perdem os dados de localização (GPS).</p>
    </div>

    @if (uploads().length) {
      <ul class="uploads" aria-live="polite">
        @for (u of uploads(); track u.id) {
          <li [class.err]="u.state === 'erro'">
            <span>{{ u.name }}</span>
            <span class="caption">{{ u.state === 'erro' ? u.error : u.state + '…' }}</span>
            @if (u.state === 'erro') {
              <button type="button" class="linkish" (click)="dismiss(u.id)" aria-label="Fechar aviso"><sfc-icon name="close" size="16" /></button>
            }
          </li>
        }
      </ul>
    }

    <div class="adm-toolbar">
      <label class="visually-hidden" for="media-q">Pesquisar imagens</label>
      <input id="media-q" class="adm-search" type="search" placeholder="Pesquisar por nome ou descrição…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
    </div>

    @if (error()) {
      <p class="alert alert--warning" role="alert"><sfc-icon name="warning" size="18" /><span>{{ error() }}</span></p>
    }

    <div class="body" [class.body--sel]="selected()">
      @if (loading()) {
        <p class="adm-empty">A carregar…</p>
      } @else if (!items().length) {
        <p class="adm-empty">{{ q() ? 'Nenhuma imagem encontrada.' : 'Ainda não há imagens. Carrega a primeira.' }}</p>
      } @else {
        <ul class="grid" role="listbox" aria-label="Imagens">
          @for (m of items(); track m.id) {
            <li>
              <button type="button" class="tile" role="option" [attr.aria-selected]="selected()?.id === m.id" (click)="select(m)" (dblclick)="picker() && pick(m)">
                <img [src]="m.url" [alt]="m.alt" loading="lazy" />
                <span class="tile__name">{{ m.name }}</span>
              </button>
            </li>
          }
        </ul>
      }

      @if (selected(); as m) {
        <aside class="detail adm-panel" aria-label="Imagem selecionada">
          <img class="detail__img" [src]="m.url" [alt]="m.alt" />
          <p class="detail__name">{{ m.name }}</p>
          <p class="caption">
            {{ m.width }}×{{ m.height }} px · {{ size(m.sizeBytes) }} · {{ m.createdAt | date: 'dd/MM/y' }}@if (m.uploadedByName) { · {{ m.uploadedByName }}}
          </p>
          <label for="media-alt">Descrição (texto alternativo)</label>
          <textarea id="media-alt" rows="2" maxlength="300" [(ngModel)]="alt" placeholder="Ex.: Equipa de sub-11 de futsal no torneio de Natal"></textarea>
          <span class="hint">Lida por leitores de ecrã e mostrada se a imagem não carregar.</span>
          <div class="detail__actions">
            @if (alt !== m.alt) {
              <button type="button" class="btn btn--outline btn--sm" [disabled]="busy()" (click)="saveAlt(m)">Guardar descrição</button>
            }
            @if (picker()) {
              <button type="button" class="btn btn--primary btn--sm" [disabled]="busy()" (click)="pick(m)"><sfc-icon name="check" size="16" />Usar esta imagem</button>
            } @else {
              <button type="button" class="linkish" (click)="copy(m)"><sfc-icon name="copy" size="16" />{{ copied() ? 'Endereço copiado' : 'Copiar endereço' }}</button>
              <button type="button" class="linkish linkish--danger" [disabled]="busy()" (click)="remove(m)"><sfc-icon name="trash" size="16" />Apagar</button>
            }
          </div>
          @if (!picker() && usage(); as u) {
            <p class="caption">
              @if (u.length) {
                Usada em: {{ usageTitles(u) }}
              } @else {
                Não está a ser usada em nenhum conteúdo.
              }
            </p>
          }
        </aside>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .drop {
      display: grid; justify-items: center; gap: 0.2rem; text-align: center;
      padding: 1.3rem 1rem; margin-bottom: 1rem;
      border: 2px dashed #c9cfdb; border-radius: var(--radius); background: #f8f9fc; color: var(--color-muted);
      p { margin: 0; }
    }
    .drop--over { border-color: var(--sfc-blue); background: #eef4fb; }
    .drop__pick {
      color: var(--sfc-blue); font-weight: 700; text-decoration: underline; cursor: pointer;
      input { position: absolute; width: 1px; height: 1px; opacity: 0; }
      &:focus-within { outline: 3px solid rgba(0, 74, 142, 0.35); outline-offset: 2px; }
    }
    .uploads {
      list-style: none; margin: 0 0 1rem; padding: 0; display: grid; gap: 0.3rem;
      li { display: flex; gap: 0.6rem; align-items: center; font-size: 0.88rem; }
      li.err { color: #a4262c; }
      span:first-child { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
    .body { display: grid; gap: 1rem; }
    .body--sel { grid-template-columns: minmax(0, 1fr) 300px; align-items: start; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.7rem; }
    .tile {
      display: grid; width: 100%; padding: 0; border: 2px solid transparent; border-radius: var(--radius-s);
      background: #fff; cursor: pointer; overflow: hidden; text-align: left; box-shadow: 0 0 0 1px var(--color-line);
      img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #eef1f6; }
      &[aria-selected='true'] { border-color: var(--sfc-blue); box-shadow: 0 0 0 3px rgba(0, 74, 142, 0.18); }
      &:focus-visible { outline: 3px solid rgba(0, 74, 142, 0.35); }
    }
    .tile__name { padding: 0.35rem 0.5rem; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .detail {
      display: grid; gap: 0.45rem; position: sticky; top: 1rem;
      label { font-weight: 600; font-size: 0.88rem; margin-top: 0.4rem; }
      textarea { font: inherit; padding: 0.5rem 0.65rem; border: 1.5px solid #c9cfdb; border-radius: var(--radius-s); resize: vertical; }
      p { margin: 0; }
    }
    .detail__img { width: 100%; max-height: 220px; object-fit: contain; background: #eef1f6; border-radius: var(--radius-s); }
    .detail__name { font-weight: 700; overflow-wrap: anywhere; }
    .detail__actions { display: flex; flex-wrap: wrap; gap: 0.4rem 0.9rem; align-items: center; margin-top: 0.3rem; }
    .hint { font-size: 0.8rem; color: var(--color-muted); }
    @media (max-width: 760px) {
      .body--sel { grid-template-columns: 1fr; }
      .detail { position: static; order: -1; }
    }
  `,
})
export class MediaLibraryComponent {
  /** Modo de escolha (diálogo do editor e da imagem de capa) */
  readonly picker = input(false);
  readonly picked = output<MediaItem>();

  protected readonly source = inject(AdminSource);
  protected readonly accepted = ACCEPTED_IMAGES;
  protected readonly size = formatBytes;

  protected readonly q = signal('');
  private readonly all = signal<MediaItem[]>([]);
  protected readonly items = computed(() => {
    const term = this.q().trim().toLowerCase();
    return this.all().filter((m) => !term || m.name.toLowerCase().includes(term) || m.alt.toLowerCase().includes(term));
  });
  protected readonly selected = signal<MediaItem | null>(null);
  protected readonly usage = signal<MediaUsage[] | null>(null);
  protected readonly uploads = signal<Upload[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly copied = signal(false);
  protected alt = '';
  private seq = 0;

  constructor() {
    this.reload();
    effect(() => {
      const m = this.selected();
      this.usage.set(null);
      if (m && !this.picker()) this.source.mediaUsage(m.id).then((u) => this.usage.set(u), () => this.usage.set(null));
    });
  }

  protected select(m: MediaItem) {
    this.selected.set(m);
    this.alt = m.alt;
    this.copied.set(false);
  }

  protected pick(m: MediaItem) {
    // A descrição escrita conta mesmo que não tenha sido guardada
    this.picked.emit({ ...m, alt: this.alt.trim() || m.alt });
    if (this.alt.trim() !== m.alt) this.source.mediaUpdate(m.id, this.alt).catch(() => undefined);
  }

  protected onPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.upload([...(input.files ?? [])]);
    input.value = '';
  }

  protected onDrop(ev: DragEvent) {
    ev.preventDefault();
    this.dragOver.set(false);
    this.upload([...(ev.dataTransfer?.files ?? [])]);
  }

  protected dismiss(id: number) {
    this.uploads.update((l) => l.filter((u) => u.id !== id));
  }

  protected async saveAlt(m: MediaItem) {
    await this.run(async () => {
      const updated = await this.source.mediaUpdate(m.id, this.alt);
      this.all.update((l) => l.map((x) => (x.id === m.id ? updated : x)));
      this.select(updated);
    });
  }

  protected async remove(m: MediaItem) {
    if (!confirm(`Apagar «${m.name}»? Esta ação não pode ser desfeita.`)) return;
    await this.run(async () => {
      await this.source.mediaDelete(m.id);
      this.all.update((l) => l.filter((x) => x.id !== m.id));
      this.selected.set(null);
    });
  }

  protected async copy(m: MediaItem) {
    const url = m.url.startsWith('/') ? location.origin + m.url : m.url;
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
    } catch {
      this.error.set('Não foi possível copiar. Endereço: ' + url);
    }
  }

  protected usageTitles(u: MediaUsage[]) {
    return u.map((x) => x.title).join(', ');
  }

  private async upload(files: File[]) {
    this.error.set(null);
    for (const file of files) {
      const id = ++this.seq;
      const set = (patch: Partial<Upload>) => this.uploads.update((l) => l.map((u) => (u.id === id ? { ...u, ...patch } : u)));
      this.uploads.update((l) => [...l, { id, name: file.name, state: 'a preparar' }]);
      try {
        const img = await prepareImage(file, this.source.mediaMaxSize);
        set({ state: 'a enviar' });
        const item = await this.source.mediaUpload(img);
        this.all.update((l) => [item, ...l]);
        this.dismiss(id);
        this.select(item);
      } catch (e) {
        set({ state: 'erro', error: (e as Error).message });
      }
    }
  }

  private async reload() {
    this.loading.set(true);
    try {
      this.all.set(await this.source.mediaList());
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
