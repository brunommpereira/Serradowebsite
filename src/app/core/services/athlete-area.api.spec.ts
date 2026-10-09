import { TestBed } from '@angular/core/testing';
import { ApiClient } from '../api/api-client';
import { AthleteAreaService } from './athlete-area.service';
import { AuthService } from './auth.service';

/** Área de Atletas e quotas com a API ligada (ApiClient simulado). */
describe('Áreas reservadas (modo API)', () => {
  const ID = '6f1b2a4e-0000-4000-8000-000000000001';
  const ATHLETE = {
    id: ID,
    name: 'Rita Exemplo',
    birthDate: '1985-04-21',
    gender: 'Feminino',
    sportSlug: 'atletismo',
    category: 'Veteranas I',
    idNumber: '12345678',
    idExpiry: '2029-05-30',
    taxNumber: '123456789',
    email: 'atleta@exemplo.pt',
    phone: '910000001',
    address: 'Rua do Exemplo, 10',
    postalCode: '2825-000',
    city: 'Caparica',
    shirtSize: 'S',
    shirtType: 'Normal',
    emergencyName: 'Pedro Exemplo',
    emergencyPhone: '930000000',
    consentRgpd: true,
    consentImage: true,
    confirmedAt: '2025-10-02',
    access: 'atleta',
    documents: [{ id: 1, kind: 'exame', status: 'Rejeitado', note: 'Falta a assinatura' }],
    pendingRequests: [{ id: 7, changes: { name: 'Rita Maria Exemplo' }, requestedAt: '2026-10-01T10:00:00.000Z' }],
  };
  let calls: string[];

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    const fake = {
      enabled: true,
      baseUrl: '/api/v1',
      get: async (path: string) => {
        calls.push(`GET ${path}`);
        if (path === '/me/athletes') return [{ id: ID }];
        if (path === `/athletes/${ID}`) return ATHLETE;
        if (path === `/athletes/${ID}/results`) return [{ id: 3, season: '2025/2026', round: 1, race: '6º GP', raceBase: 'GP', date: '2025-11-09', category: 'Veteranas I', place: 5, time: '29:05.31', distanceM: 5850, trophyPoints: 6 }];
        if (path === '/auth/options') return { providers: [{ id: 'google', name: 'Google' }], passwordReset: true };
        if (path === '/me/identities') return [{ provider: 'google', email: 'atleta@exemplo.pt', linkedAt: '2026-10-08T10:00:00.000Z' }];
        if (path === '/me/quotas') return [{ id: 1, period: 'Outubro 2026', amount: 20, dueDate: '2026-10-08', paidAt: '2026-10-02', paymentMethod: 'MB WAY', receiptNumber: 'R1', status: 'Pago' }];
        throw new Error(`inesperado: ${path}`);
      },
      post: async (path: string, body?: unknown) => {
        calls.push(`POST ${path} ${JSON.stringify(body ?? {})}`);
        if (path === '/auth/login') return { id: 'u-1', name: 'Rita Exemplo', email: 'atleta@exemplo.pt', roles: [], member: { memberNumber: '00731', category: 'Efetivo', status: 'Ativo', joinedOn: '2019-03-01' } };
        return {};
      },
      delete: async (path: string) => {
        calls.push(`DELETE ${path}`);
        return { ok: true };
      },
      patch: async (path: string, body: unknown) => {
        calls.push(`PATCH ${path} ${JSON.stringify(body)}`);
        return {};
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: fake }] });
  });

  async function settle(service: AthleteAreaService) {
    TestBed.tick();
    for (let i = 0; i < 20 && (service.loading() || !service.athletes().length); i++) await new Promise((r) => setTimeout(r));
  }

  it('carrega os atletas da conta com ficha, documentos, pedidos pendentes e resultados', async () => {
    const auth = TestBed.inject(AuthService);
    const area = TestBed.inject(AthleteAreaService);
    expect(await auth.login('atleta@exemplo.pt', 'x')).toBe(true);
    await settle(area);

    const a = area.athletes()[0];
    expect(a.name).toBe('Rita Exemplo');
    expect(a.level).toBe('Veteranas I');
    expect(area.role()).toBe('atleta');
    expect(area.isSelf(ID)).toBe(true);
    expect(a.documents[0]).toEqual({ id: 'exame', name: 'Exame médico desportivo', hint: 'Modelo IPDJ', status: 'Rejeitado', note: 'Falta a assinatura' });
    expect(a.pendingReview).toEqual({ fields: ['Nome'], requestedAt: '2026-10-01', changes: { name: 'Rita Maria Exemplo' } });
    expect(area.results(ID).map((r) => r.race)).toEqual(['6º GP']);
    // Partes que ainda não existem na API ficam vazias
    expect(area.metrics(ID)).toEqual([]);
    expect(area.receipts(ID)).toEqual([]);
    // Dados pessoais nunca vão para o localStorage
    expect(JSON.stringify({ ...localStorage })).not.toContain('Rita');
  });

  it('guardar: contactos por PATCH, identificação por pedido à secretaria e confirmação', async () => {
    const auth = TestBed.inject(AuthService);
    const area = TestBed.inject(AthleteAreaService);
    await auth.login('atleta@exemplo.pt', 'x');
    await settle(area);
    const a = area.athletes()[0];
    calls = [];
    const changed = await area.updateAthlete(ID, { name: 'Rita M. Exemplo', birthDate: a.birthDate, details: { ...a.details, phone: '910000009' } });

    expect(changed).toEqual(['Nome']);
    expect(calls[0]).toMatch(new RegExp(`^PATCH /athletes/${ID} .*"phone":"910000009"`));
    expect(calls[0]).not.toContain('Rita'); // o nome não segue no PATCH
    expect(calls[1]).toBe(`POST /athletes/${ID}/change-requests {"changes":{"name":"Rita M. Exemplo"}}`);
    expect(calls[2]).toBe(`POST /athletes/${ID}/confirm {}`);
    expect(calls[3]).toBe(`GET /athletes/${ID}`); // ficha atualizada a partir do servidor
  });

  it('quotas do sócio vêm de GET /me/quotas', async () => {
    const auth = TestBed.inject(AuthService);
    await auth.login('atleta@exemplo.pt', 'x');
    const list = await auth.loadPayments();
    expect(list).toEqual([{ id: 1, period: 'Outubro 2026', amount: 20, dueDate: '2026-10-08', paymentDate: '2026-10-02', status: 'Pago', paymentMethod: 'MB WAY', receiptNumber: 'R1' }]);
  });

  it('entrar com Google: fornecedores, endereço de entrada e contas ligadas', async () => {
    const auth = TestBed.inject(AuthService);
    expect(await auth.loadOptions()).toEqual({ providers: [{ id: 'google', name: 'Google' }], passwordReset: true });
    expect(auth.providerUrl('google', '/area-socio?x=1')).toBe('/api/v1/auth/oauth/google?voltar=%2Farea-socio%3Fx%3D1');
    expect(await auth.loadIdentities()).toEqual([]); // sem sessão não pergunta
    await auth.login('atleta@exemplo.pt', 'x');
    expect((await auth.loadIdentities()).map((i) => i.provider)).toEqual(['google']);
    await auth.unlinkIdentity('google');
    expect(calls).toContain('DELETE /me/identities/google');
  });
});
