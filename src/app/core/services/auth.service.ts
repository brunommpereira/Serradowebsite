import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEMO_ATHLETE_MEMBER, DEMO_MEMBER, DEMO_PAYMENTS } from '../data/mock-data';
import { Account, MembershipPayment } from '../models';
import { demoRoles, Permission, permissionsFor } from '../permissions';
import { ApiClient } from '../api/api-client';

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
    account: { id: 'acc-socio', name: DEMO_MEMBER.name, email: DEMO_MEMBER.email, member: DEMO_MEMBER, roles: [], permissions: [] },
  },
  {
    // Atleta adulta que também é sócia
    logins: ['00731', 'atleta@exemplo.pt'],
    password: 'atleta2026',
    account: { id: 'acc-rita', name: DEMO_ATHLETE_MEMBER.name, email: DEMO_ATHLETE_MEMBER.email, member: DEMO_ATHLETE_MEMBER, roles: [], permissions: [] },
  },
  {
    // Atleta que NÃO é sócio: só tem acesso à Área de Atletas
    logins: ['joao@exemplo.pt'],
    password: 'atleta2026',
    account: { id: 'acc-joao', name: 'João Exemplo', email: 'joao@exemplo.pt', member: null, roles: [], permissions: [] },
  },
  // Equipa do clube (backoffice)
  { logins: ['admin@serradofc.pt'], password: 'admin2026', account: { id: 'acc-admin', name: 'Administração', email: 'admin@serradofc.pt', member: null, roles: ['admin'], permissions: [] } },
  { logins: ['editor@serradofc.pt'], password: 'editor2026', account: { id: 'acc-editor', name: 'Equipa de Comunicação', email: 'editor@serradofc.pt', member: null, roles: ['editor'], permissions: [] } },
  { logins: ['secretaria@serradofc.pt'], password: 'secretaria2026', account: { id: 'acc-secretaria', name: 'Secretaria', email: 'secretaria@serradofc.pt', member: null, roles: ['secretaria'], permissions: [] } },
  { logins: ['tesouraria@serradofc.pt'], password: 'tesouraria2026', account: { id: 'acc-tesouraria', name: 'Tesouraria', email: 'tesouraria@serradofc.pt', member: null, roles: ['tesouraria'], permissions: [] } },
  { logins: ['treinador@serradofc.pt'], password: 'treinador2026', account: { id: 'acc-treinador', name: 'Treinador Exemplo', email: 'treinador@serradofc.pt', member: null, roles: ['treinador'], permissions: [] } },
];

interface ApiQuota {
  id: number;
  period: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  status: 'Pago' | 'Pendente' | 'Em atraso';
}

/** Formas de entrar ativas no servidor. */
export interface LoginOptions {
  providers: LoginProvider[];
  /** «Esqueci-me da password» por email (o servidor tem o envio de emails configurado) */
  passwordReset: boolean;
}

/** Fornecedor de entrada externo (Google, Microsoft…), quando configurado no servidor. */
export interface LoginProvider {
  id: string;
  name: string;
}

/** Conta externa ligada à conta do clube. */
export interface LinkedIdentity {
  provider: string;
  email: string | null;
  linkedAt: string;
}

/** Perfil devolvido pelo middleware (GET /me, POST /auth/login). */
interface ApiProfile {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: Permission[];
  member: { memberNumber: string; category: string; status: 'Ativo' | 'Pendente' | 'Suspenso'; joinedOn: string } | null;
}

/**
 * Sessão (área reservada) — MODO DEMONSTRAÇÃO.
 *
 * Modo API: login e sessão através do middleware (/api/v1/auth, cookie httpOnly) — ver docs/ARCHITECTURE.md.
 * Não guardar dados pessoais reais em localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  static readonly DEMO = DEMO_ACCOUNTS.map((d) => ({ login: d.logins[0], password: d.password, name: d.account.name, isMember: !!d.account.member, roles: d.account.roles }));

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = inject(ApiClient);
  private readonly session = signal<Account | null>(this.restore());

  readonly account = this.session.asReadonly();
  readonly isLoggedIn = computed(() => this.session() !== null);
  /** Dados de sócio, quando a conta tem perfil de sócio */
  readonly member = computed(() => this.session()?.member ?? null);
  readonly isMember = computed(() => this.member() !== null);
  /** Papéis de backoffice (configuráveis: admin, secretaria, tesouraria, editor, treinador…) */
  readonly roles = computed(() => this.session()?.roles ?? []);
  /** Permissões efetivas: o que a conta pode fazer no backoffice (o servidor volta a verificar tudo) */
  readonly permissions = computed<Permission[]>(() => {
    const s = this.session();
    if (!s) return [];
    return this.api.enabled ? s.permissions : permissionsFor(s.roles, demoRoles());
  });
  readonly isStaff = computed(() => this.permissions().length > 0);

  /** Tem pelo menos uma das permissões (sem argumentos: tem alguma, ou seja, é da equipa). */
  can(...permissions: Permission[]) {
    const granted = this.permissions();
    return permissions.length ? permissions.some((p) => granted.includes(p)) : granted.length > 0;
  }

  /** Entra com email ou n.º de sócio. */
  async login(identifier: string, password: string): Promise<boolean> {
    if (this.api.enabled) {
      try {
        this.session.set(fromApi(await this.api.post<ApiProfile>('/auth/login', { login: identifier.trim(), password })));
        return true;
      } catch {
        return false;
      }
    }
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
    if (this.api.enabled) this.api.post('/auth/logout').catch(() => undefined);
  }

  /** Fornecedores de entrada e recuperação da password (modo demonstração: só a recuperação, simulada). */
  async loadOptions(): Promise<LoginOptions> {
    if (!this.api.enabled) return { providers: [], passwordReset: true };
    if (!this.isBrowser) return { providers: [], passwordReset: false };
    try {
      return await this.api.get<LoginOptions>('/auth/options');
    } catch {
      return { providers: [], passwordReset: false };
    }
  }

  /** Pede a ligação para repor a password (a resposta é a mesma com ou sem conta). */
  async forgotPassword(email: string): Promise<void> {
    if (!this.api.enabled) return;
    await this.api.post('/auth/password/forgot', { email: email.trim() });
  }

  /** Define a password com o token da ligação do email (reposição ou convite). */
  async resetPassword(token: string, password: string): Promise<{ email: string }> {
    if (!this.api.enabled) return { email: 'socio@exemplo.pt' };
    const out = await this.api.post<{ ok: boolean; email: string }>('/auth/password/reset', { token, password });
    this.session.set(null);
    return { email: out.email };
  }

  /** Endereço que começa a entrada com um fornecedor (navegação completa, não XHR). */
  providerUrl(provider: string, voltar: string) {
    return `${this.api.baseUrl}/auth/oauth/${encodeURIComponent(provider)}?voltar=${encodeURIComponent(voltar)}`;
  }

  /** Contas Google/Microsoft ligadas a esta conta. */
  async loadIdentities(): Promise<LinkedIdentity[]> {
    if (!this.api.enabled || !this.isLoggedIn()) return [];
    try {
      return await this.api.get<LinkedIdentity[]>('/me/identities');
    } catch {
      return [];
    }
  }

  unlinkIdentity(provider: string) {
    return this.api.delete(`/me/identities/${encodeURIComponent(provider)}`);
  }

  /** Modo API: recupera a sessão a partir do cookie httpOnly (GET /me). */
  async restoreFromApi() {
    if (!this.api.enabled || !this.isBrowser) return;
    try {
      this.session.set(fromApi(await this.api.get<ApiProfile>('/me')));
    } catch {
      this.session.set(null);
    }
  }

  /** Quotas e pagamentos do sócio: GET /me/quotas (modo API) ou os de demonstração. */
  async loadPayments(): Promise<MembershipPayment[]> {
    if (!this.api.enabled) return DEMO_PAYMENTS;
    const rows = await this.api.get<ApiQuota[]>('/me/quotas');
    return rows.map((q) => ({
      id: q.id,
      period: q.period,
      amount: q.amount,
      dueDate: q.dueDate,
      paymentDate: q.paidAt ?? undefined,
      status: q.status,
      paymentMethod: (q.paymentMethod ?? undefined) as MembershipPayment['paymentMethod'],
      receiptNumber: q.receiptNumber ?? undefined,
    }));
  }

  private restore(): Account | null {
    if (!this.isBrowser || this.api.enabled) return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return DEMO_ACCOUNTS.find((d) => d.account.id === saved)?.account ?? null;
    } catch {
      return null;
    }
  }

  private persist(accountId: string | null) {
    if (!this.isBrowser || this.api.enabled) return;
    try {
      if (accountId) localStorage.setItem(STORAGE_KEY, accountId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponível: sessão só em memória */
    }
  }
}

function fromApi(p: ApiProfile): Account {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    roles: p.roles,
    permissions: p.permissions ?? [],
    member: p.member
      ? { memberNumber: p.member.memberNumber, name: p.name, email: p.email, phone: '', category: p.member.category, status: p.member.status, registrationDate: p.member.joinedOn, dependents: [] }
      : null,
  };
}
