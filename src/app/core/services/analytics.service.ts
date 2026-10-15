import { DOCUMENT, effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ApiClient } from '../api/api-client';
import { SiteStore } from '../site/site-store';

/** Áreas que não contam para as estatísticas (dados pessoais e trabalho interno). */
const PRIVATE = /^\/(admin|area-socio|area-atletas|entrar|propostas)(\/|$|\?)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Umami {
  track: (props?: (p: Record<string, unknown>) => Record<string, unknown>) => void;
}

/**
 * Estatísticas de visitas com o Umami instalado no próprio servidor (/estatisticas): sem cookies,
 * sem guardar o IP e sem enviar dados a terceiros. Só com o ID do site em Conteúdos do site → Contactos.
 * As visitas contam-se aqui, em cada mudança de página, e nunca nas áreas reservadas.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly site = inject(SiteStore);
  private readonly enabled = isPlatformBrowser(inject(PLATFORM_ID)) && inject(ApiClient).enabled;
  private loaded = false;
  /** Endereço da última navegação concluída (antes disso o router ainda está em «/»). */
  private current: string | null = null;
  private lastSent: string | null = null;

  start() {
    if (!this.enabled) return;
    effect(() => {
      const id = String(this.site.data('contacts').statsWebsiteId ?? '').trim();
      if (id && UUID.test(id) && !this.loaded) this.load(id);
    });
    // A primeira navegação pode já ter terminado antes de o site arrancar (página pré-renderizada)
    if (this.router.navigated) this.current = this.router.url.split(/[?#]/)[0];
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.current = e.urlAfterRedirects.split(/[?#]/)[0];
        this.pageview();
      });
  }

  private load(id: string) {
    this.loaded = true;
    const s = this.doc.createElement('script');
    s.src = '/estatisticas/script.js';
    s.defer = true;
    s.dataset['websiteId'] = id;
    // Contagem manual (abaixo), para nunca registar as áreas reservadas
    s.dataset['autoTrack'] = 'false';
    s.dataset['doNotTrack'] = 'true';
    s.addEventListener('load', () => this.pageview());
    this.doc.head.appendChild(s);
  }

  private pageview() {
    const umami = (this.doc.defaultView as (Window & { umami?: Umami }) | null)?.umami;
    const url = this.current;
    // Sem parâmetros (podem ter tokens ou emails) e uma vez por página
    if (!umami || !url || PRIVATE.test(url) || url === this.lastSent) return;
    this.lastSent = url;
    umami.track((p) => ({ ...p, url }));
  }
}
