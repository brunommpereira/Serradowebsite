import { signal } from '@angular/core';

/**
 * Formulários do protótipo: validação nativa do browser e confirmação no ecrã.
 * No projeto real o envio vai para a API (como as inscrições do site do Serrado FC).
 */
export class DemoForm {
  readonly sent = signal(false);

  submit(ev: Event): void {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    this.sent.set(true);
  }
}

export const COUNTRIES = [
  'Portugal',
  'Espanha',
  'França',
  'Brasil',
  'Angola',
  'Moçambique',
  'Cabo Verde',
  'Outro',
];
