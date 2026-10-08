import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { ApiClient } from '../api/api-client';
import { PaymentsService } from './payments.service';

/** Pagamentos (modo API): o browser só envia O QUE paga; o valor vem do servidor. */
describe('PaymentsService', () => {
  let posted: { path: string; body: unknown }[];
  let assigned: string[];
  let url: string;

  beforeEach(() => {
    posted = [];
    assigned = [];
    url = 'https://checkout.stripe.com/c/pay/cs_test_1';
    const fakeApi = {
      enabled: true,
      baseUrl: '/api/v1',
      get: async () => ({ enabled: true, quotas: [], fees: [], payments: [], suggestedNif: null }),
      post: async (path: string, body: unknown) => {
        posted.push({ path, body });
        return { url };
      },
    };
    const fakeDocument = { defaultView: { location: { assign: (u: string) => assigned.push(u) } } };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: fakeApi }, { provide: DOCUMENT, useValue: fakeDocument }] });
  });

  it('pagar envia só os itens e o NIF e segue para o Stripe Checkout', async () => {
    const service = TestBed.inject(PaymentsService);
    await service.pay([{ kind: 'quota', id: 3 }, { kind: 'fee', id: 9 }], '258369140', '/area-atletas');
    expect(posted).toEqual([{ path: '/me/payments', body: { items: [{ kind: 'quota', id: 3 }, { kind: 'fee', id: 9 }], nif: '258369140', returnPath: '/area-atletas' } }]);
    expect(assigned).toEqual(['https://checkout.stripe.com/c/pay/cs_test_1']);
  });

  it('recusa seguir para um endereço que não seja do Stripe', async () => {
    url = 'https://pagamentos-falsos.example/pay';
    const service = TestBed.inject(PaymentsService);
    await expect(service.pay([{ kind: 'quota', id: 3 }], '258369140', '/area-socio')).rejects.toThrow(/inesperado/);
    expect(assigned).toEqual([]);
  });

  it('endereço do recibo em PDF', () => {
    expect(TestBed.inject(PaymentsService).receiptUrl('abc')).toBe('/api/v1/me/payments/abc/receipt');
  });
});
