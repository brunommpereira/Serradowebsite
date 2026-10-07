import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MediaLibraryComponent } from '../media/media-library.component';

/** Backoffice → Imagens: biblioteca de imagens do site. */
@Component({
  selector: 'sfc-admin-media',
  imports: [MediaLibraryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Imagens</h1>
        <p>Fotografias e imagens usadas nas notícias, eventos e páginas. São públicas: não carregues aqui documentos de atletas.</p>
      </div>
    </div>
    <sfc-media-library />
  `,
})
export class MediaPage {}
