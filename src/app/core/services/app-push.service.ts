import { effect, inject, Injectable, PLATFORM_ID, signal, untracked } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SwPush } from '@angular/service-worker';
import { ApiClient } from '../api/api-client';
import { AuthService } from './auth.service';

export type PushTopic = 'noticias' | 'eventos' | 'jogos' | 'pagamentos' | 'gastos';
export interface PushStatus {
  subscribed: boolean;
  topics: PushTopic[];
  sports: string[];
  /** Ligada à conta com sessão (recebe os avisos pessoais) */
  linked: boolean;
}

/** Evento do Chrome/Edge/Android para mostrar o pedido de instalação quando se quiser. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const OFF: PushStatus = { subscribed: false, topics: [], sports: [], linked: false };

/**
 * App instalável (PWA): pedido de instalação e notificações push deste dispositivo.
 * As notificações são do service worker do Angular (ngsw), que abre o site no endereço do aviso ao tocar.
 */
@Injectable({ providedIn: 'root' })
export class AppPushService {
  // Sem service worker (desenvolvimento, testes) não há SwPush: a página explica que não há notificações
  private readonly swPush = inject(SwPush, { optional: true });
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private current: PushSubscription | null = null;

  readonly status = signal<PushStatus>(OFF);
  readonly permission = signal<NotificationPermission | 'unsupported'>(
    this.browser && 'Notification' in window ? Notification.permission : 'unsupported',
  );
  readonly installPrompt = signal<InstallPromptEvent | null>(null);
  readonly installed = signal(
    this.browser &&
      (!!window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true),
  );
  readonly ios =
    this.browser &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  /** Push disponível: site com API, service worker ativo e browser com notificações (no iPhone, só na app instalada) */
  readonly supported =
    this.browser &&
    this.api.enabled &&
    !!this.swPush?.isEnabled &&
    'PushManager' in window &&
    'Notification' in window;

  constructor() {
    if (!this.browser) return;
    // Ao terminar sessão, este dispositivo deixa de receber os avisos pessoais da conta
    let wasLoggedIn = this.auth.isLoggedIn();
    effect(() => {
      const now = this.auth.isLoggedIn();
      if (wasLoggedIn && !now) untracked(() => void this.unlinkAccount());
      wasLoggedIn = now;
    });
  }

  start() {
    if (!this.browser) return;
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt.set(e as InstallPromptEvent);
    });
    addEventListener('appinstalled', () => {
      this.installPrompt.set(null);
      this.installed.set(true);
    });
    if (this.supported && this.swPush) {
      this.swPush.subscription.subscribe((s) => {
        this.current = s;
        void this.refresh();
      });
    }
  }

  async install(): Promise<boolean> {
    const e = this.installPrompt();
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    this.installPrompt.set(null);
    return outcome === 'accepted';
  }

  async refresh() {
    if (!this.current) {
      this.status.set(OFF);
      return;
    }
    try {
      this.status.set(
        await this.api.post<PushStatus>('/push/status', { endpoint: this.current.endpoint }),
      );
    } catch {
      /* sem rede: fica o estado anterior */
    }
  }

  /** Ativa (pede autorização ao browser se ainda não tiver) e grava os temas deste dispositivo. */
  async save(topics: PushTopic[], sports: string[]) {
    if (!topics.length) return this.disable();
    if (!this.swPush) throw new Error('Notificações indisponíveis neste browser');
    const { publicKey } = await this.api.get<{ publicKey: string }>('/push/key');
    const sub =
      this.current ?? (await this.swPush.requestSubscription({ serverPublicKey: publicKey }));
    this.current = sub;
    this.permission.set(Notification.permission);
    const out = await this.api.post<Omit<PushStatus, 'subscribed'>>('/push/subscribe', {
      subscription: sub.toJSON(),
      topics,
      sports,
    });
    this.status.set({ subscribed: out.topics.length > 0, ...out });
  }

  async disable() {
    const endpoint = this.current?.endpoint;
    if (endpoint) await this.api.post('/push/unsubscribe', { endpoint }).catch(() => undefined);
    await this.swPush?.unsubscribe().catch(() => undefined);
    this.current = null;
    this.status.set(OFF);
  }

  /** Mantém os temas públicos sem a conta (pedido sem cookie de sessão, por isso fica anónimo). */
  private async unlinkAccount() {
    const s = this.status();
    if (!this.current || !s.linked) return;
    const topics = s.topics.filter((t) => t === 'noticias' || t === 'eventos' || t === 'jogos');
    await fetch(this.api.baseUrl + (topics.length ? '/push/subscribe' : '/push/unsubscribe'), {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify(
        topics.length
          ? { subscription: this.current.toJSON(), topics, sports: s.sports }
          : { endpoint: this.current.endpoint },
      ),
    }).catch(() => undefined);
    this.status.set(topics.length ? { ...s, topics, linked: false } : OFF);
  }
}
