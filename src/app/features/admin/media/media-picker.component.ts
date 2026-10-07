import { ChangeDetectionStrategy, Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { IconComponent } from '../../../shared/icon.component';
import { MediaItem } from '../data/admin-source';
import { MediaLibraryComponent } from './media-library.component';

/** Diálogo para escolher (ou carregar) uma imagem da biblioteca. */
@Component({
  selector: 'sfc-media-picker',
  imports: [IconComponent, MediaLibraryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="dlg" aria-labelledby="dlg-title" (close)="open.set(false)" (click)="$event.target === dlg && close()">
      <header>
        <h2 id="dlg-title">Escolher imagem</h2>
        <button type="button" class="x" (click)="close()" aria-label="Fechar"><sfc-icon name="close" /></button>
      </header>
      @if (open()) {
        <sfc-media-library [picker]="true" (picked)="choose($event)" />
      }
    </dialog>
  `,
  styles: `
    .dlg {
      width: min(1040px, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem);
      padding: 1.1rem 1.2rem 1.3rem; border: 0; border-radius: var(--radius); box-shadow: 0 20px 60px rgba(0, 20, 50, 0.3);
      &::backdrop { background: rgba(10, 25, 50, 0.55); }
    }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.9rem; }
    h2 { margin: 0; font-size: 1.3rem; }
    .x { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: #f1f3f8; cursor: pointer; }
  `,
})
export class MediaPickerComponent {
  readonly picked = output<MediaItem>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly open = signal(false);

  show() {
    this.open.set(true);
    this.dlg().nativeElement.showModal();
  }

  close() {
    this.dlg().nativeElement.close();
  }

  protected choose(m: MediaItem) {
    this.picked.emit(m);
    this.close();
  }
}
