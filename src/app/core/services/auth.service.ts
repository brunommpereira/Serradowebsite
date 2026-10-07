import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEMO_ATHLETE_MEMBER, DEMO_MEMBER, DEMO_PAYMENTS } from '../data/mock-data';
import { Account, MembershipPayment } from '../models';

const STORAGE_KEY = 'sfc.session';

/**
 * Contas de demonstração. Uma conta é uma pessoa: pode ser sócia, atleta,
 * encarregada de educação — ou várias coisas ao mesmo tempo.
 */
const DEMO_ACCOUNTS: { logins: string[]; password: string; account: Account }[] = [
  {
    // Sócio e encarregado de educação (Tomás e Inês)
    logins: ['00482', 'socio@exemplo.pt'],
    password: 'serrado1978',
    account: { id: 'acc-socio', name: DEMO_MEMBER.name, email: DEMO_MEMBER.email, member: DEMO_MEMBER },
  },
  {
    // Atleta adulta que também é sócia
    logins: ['00731', 'atleta@exemplo.pt'],
    password: 'atleta2026',
    account: { id: 'acc-rita', name: DEMO_ATHLETE_MEMBER.name, email: DEMO_ATHLETE_MEMBER.email, member: DEMO_ATHLETE_MEMBER },
  },
  {
    // Atleta que NÃO é sócio: só tem acesso à Área de Atletas
    logins: ['joao@exemplo.pt'],
    password: 'atleta2026',
    account: { id: 'acc-joao', name: 'João Exemplo', email: 'joao@exemplo.pt', member: null },
  },
];

/**
 * Sessão (área reservada) — MODO DEMONSTRAÇÃO.
 *
 * Fase seguinte: autenticação do backend (Supabase Auth — ver backend/README.md).
 * Não guardar dados pessoais reais em localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  static readonly DEMO = DEMO_ACCOUNTS.map((d) => ({ login: d.logins[0], password: d.password, name: d.account.name, isMember: !!d.account.member }));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly session = signal<Account | null>(this.restore());

  readonly account = this.session.asReadonly();
  readonly isLoggedIn = computed(() => this.session() !== null);
  /** Dados de sócio, quando a conta tem perfil de sócio */
  readonly member = computed(() => this.session()?.member ?? null);
  readonly isMember = computed(() => this.member() !== null);

  /** Entra com email ou n.º de sócio. */
  login(identifier: string, password: string): boolean {
    const id = identifier.trim().toLowerCase();
    const asNumber = /^\d+$/.test(id) ? id.padStart(5, '0') : id;
    const found = DEMO_ACCOUNTS.find((d) => d.logins.includes(asNumber));
    if (!found || found.password !== password) return false;
    this.session.set(found.account);
    this.persist(found.account.id);
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

  private restore(): Account | null {
    if (!this.isBrowser) return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return DEMO_ACCOUNTS.find((d) => d.account.id === saved)?.account ?? null;
    } catch {
      return null;
    }
  }

  private persist(accountId: string | null) {
    if (!this.isBrowser) return;
    try {
      if (accountId) localStorage.setItem(STORAGE_KEY, accountId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponível: sessão só em memória */
    }
  }
}
