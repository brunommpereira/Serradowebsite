import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEMO_MEMBER, DEMO_PAYMENTS } from '../data/mock-data';
import { Member, MembershipPayment } from '../models';

const STORAGE_KEY = 'sfc.session';

/**
 * Sessão da Área de Sócio — MODO DEMONSTRAÇÃO.
 *
 * Na Fase 2 esta classe passa a usar o fluxo OAuth2/OIDC do backend
 * (POST /api/auth/login, /api/auth/refresh) e GET /api/members/me.
 * Não guardar dados pessoais reais em localStorage.
 */
@Injectable({ providedIn: 'root' })
export class MemberAuthService {
  static readonly DEMO_NUMBER = '00482';
  static readonly DEMO_PASSWORD = 'serrado1978';

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly session = signal<Member | null>(this.restore());

  readonly member = this.session.asReadonly();
  readonly isLoggedIn = computed(() => this.session() !== null);

  login(memberNumber: string, password: string): boolean {
    const ok =
      memberNumber.replace(/\D/g, '').padStart(5, '0') === MemberAuthService.DEMO_NUMBER &&
      password === MemberAuthService.DEMO_PASSWORD;
    if (ok) {
      this.session.set(DEMO_MEMBER);
      this.persist(true);
    }
    return ok;
  }

  logout() {
    this.session.set(null);
    this.persist(false);
  }

  /** GET /api/membership/quotas */
  payments(): MembershipPayment[] {
    return DEMO_PAYMENTS;
  }

  private restore(): Member | null {
    if (!this.isBrowser) return null;
    try {
      return localStorage.getItem(STORAGE_KEY) === '1' ? DEMO_MEMBER : null;
    } catch {
      return null;
    }
  }

  private persist(on: boolean) {
    if (!this.isBrowser) return;
    try {
      if (on) localStorage.setItem(STORAGE_KEY, '1');
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponível: sessão só em memória */
    }
  }
}
