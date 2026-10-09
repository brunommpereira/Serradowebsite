import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Campo de password com botão para mostrar ou esconder o que se escreveu.
 * Uso: <sfc-password-field><input type="password" … /></sfc-password-field>
 */
@Component({
  selector: 'sfc-password-field',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content />
    <button
      type="button"
      class="pw__toggle"
      (click)="toggle()"
      [attr.aria-label]="shown() ? 'Esconder a password' : 'Mostrar a password'"
      [attr.aria-pressed]="shown()"
      [title]="shown() ? 'Esconder a password' : 'Mostrar a password'"
    >
      <sfc-icon [name]="shown() ? 'eye-off' : 'eye'" size="20" />
    </button>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    :host ::ng-deep input {
      width: 100%;
      padding-right: 3rem;
    }
    .pw__toggle {
      position: absolute;
      top: 50%;
      right: 0.35rem;
      transform: translateY(-50%);
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-muted);
      cursor: pointer;
      &:hover {
        color: var(--sfc-blue);
        background: var(--color-bg-soft);
      }
      &:focus-visible {
        outline: 3px solid var(--sfc-yellow);
      }
    }
  `,
})
export class PasswordFieldComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly shown = signal(false);

  protected toggle() {
    const input = this.host.nativeElement.querySelector('input');
    if (!input) return;
    this.shown.update((v) => !v);
    input.type = this.shown() ? 'text' : 'password';
    input.focus();
  }
}
