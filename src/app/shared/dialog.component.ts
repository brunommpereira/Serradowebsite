import { ChangeDetectionStrategy, Component, effect, ElementRef, input, output, viewChild } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Janela modal acessível baseada no <dialog> nativo: foco preso, Escape fecha,
 * clique no fundo fecha, e o foco volta ao elemento que a abriu.
 */
@Component({
  selector: 'sfc-dialog',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="dlg" [attr.aria-labelledby]="titleId" (close)="closed.emit()" (click)="onBackdrop($event)">
      <div class="dlg__panel">
        <header class="dlg__head">
          <h2 [id]="titleId" class="dlg__title">{{ heading() }}</h2>
          <button type="button" class="dlg__close" (click)="dlg.close()" aria-label="Fechar">
            <sfc-icon name="close" size="22" />
          </button>
        </header>
        <div class="dlg__body">
          <ng-content />
        </div>
      </div>
    </dialog>
  `,
  styles: `
    .dlg {
      border: 0;
      padding: 0;
      border-radius: var(--radius-l);
      width: min(640px, calc(100% - 32px));
      max-height: calc(100dvh - 48px);
      box-shadow: 0 30px 60px -20px rgba(0, 20, 50, 0.5);
      color: var(--color-text);
      &::backdrop { background: rgba(0, 20, 45, 0.55); }
    }
    .dlg__panel { display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
    .dlg__head {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem;
      padding: 1.1rem 1.4rem; border-bottom: 1px solid var(--color-line);
    }
    .dlg__title { margin: 0; font-size: 1.5rem; }
    .dlg__close {
      width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%;
      background: transparent; cursor: pointer; color: var(--color-text);
      &:hover { background: var(--color-bg-soft); }
    }
    .dlg__body { padding: 1.3rem 1.4rem 1.6rem; overflow-y: auto; }
  `,
})
export class DialogComponent {
  readonly heading = input.required<string>();
  readonly open = input(false);
  readonly closed = output<void>();

  private static seq = 0;
  protected readonly titleId = `dlg-title-${++DialogComponent.seq}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) el.showModal();
      if (!this.open() && el.open) el.close();
    });
  }

  protected onBackdrop(event: MouseEvent) {
    // O clique no próprio <dialog> (fora do painel) é um clique no fundo.
    if (event.target === this.dlg().nativeElement) this.dlg().nativeElement.close();
  }
}
