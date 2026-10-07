import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEMO_ATHLETE_MEMBER, DEMO_MEMBER, DEMO_PAYMENTS } from '../data/mock-data';
import { Member, MembershipPayment } from '../models';

const STORAGE_KEY = 'sfc.session';

/** Contas de demonstração: n.º de sócio → password e dados. */
const DEMO_ACCOUNTS: Record<string, { password: string; member: Member }> = {
  '00482': { password: 'serrado1978', member: DEMO_MEMBER }, // encarregado de educação
  '00731': { password: 'atleta2026', member: DEMO_ATHLETE_MEMBER }, // atleta adulta
};

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
  static readonly DEMO_ATHLETE_NUMBER = '00731';
  static readonly DEMO_ATHLETE_PASSWORD = 'atleta2026';

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly session = signal<Member | null>(this.restore());

  readonly member = this.session.asReadonly();
  readonly isLoggedIn = computed(() => this.session() !== null);

  login(memberNumber: string, password: string): boolean {
    const account = DEMO_ACCOUNTS[memberNumber.replace(/\D/g, '').padStart(5, '0')];
    if (!account || account.password !== password) return false;
    this.session.set(account.member);
    this.persist(account.member.memberNumber);
    return true;
  }

  logout() {
    this.session.set(null);
    this.persist(null);
  }

  /** GET /api/membership/quotas */
  payments(): MembershipPayment[] {
    return DEMO_PAYMENTS;
  }

  private restore(): Member | null {
    if (!this.isBrowser) return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // '1' = formato antigo (só existia a conta 00482)
      return saved === '1' ? DEMO_MEMBER : (DEMO_ACCOUNTS[saved ?? '']?.member ?? null);
    } catch {
      return null;
    }
  }

  private persist(memberNumber: string | null) {
    if (!this.isBrowser) return;
    try {
      if (memberNumber) localStorage.setItem(STORAGE_KEY, memberNumber);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponível: sessão só em memória */
    }
  }
}
