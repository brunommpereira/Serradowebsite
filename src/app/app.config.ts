import { ApplicationConfig, inject, LOCALE_ID, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { CmsStore } from './core/cms/cms-store';
import { SiteStore } from './core/site/site-store';
import { AuthService } from './core/services/auth.service';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt-PT';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch()),
    // Modo API: recupera a sessão e carrega o conteúdo do CMS antes de mostrar o site
    provideAppInitializer(async () => {
      const auth = inject(AuthService); // inject() só antes do primeiro await
      const cms = inject(CmsStore);
      const site = inject(SiteStore);
      await auth.restoreFromApi();
      await Promise.all([cms.loadFromApi(auth.can('cms.edit')), site.loadFromApi()]);
    }),
    { provide: LOCALE_ID, useValue: 'pt-PT' },
  ],
};
