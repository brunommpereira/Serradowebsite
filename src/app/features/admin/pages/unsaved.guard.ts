import { CanDeactivateFn } from '@angular/router';

/** Página com alterações por gravar (ex.: editor do CMS). */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (page) =>
  !page.hasUnsavedChanges() || confirm('Tens alterações por guardar. Sair sem guardar?');
