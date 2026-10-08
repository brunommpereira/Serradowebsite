import { inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ApiClient } from '../api/api-client';

export type ChargeStatus = 'Pendente' | 'Em atraso';

/** Quota de sócio por pagar. */
export interface QuotaCharge {
  id: number;
  period: string;
  amount: number;
  dueDate: string;
  memberNumber: string;
  status: ChargeStatus;
  /** Já há um pagamento em curso (por exemplo, uma referência Multibanco por pagar) */
  inProgress: boolean;
}

/** Mensalidade de uma escola (futsal, rugby…) por pagar. */
export interface FeeCharge {
  id: number;
  athleteId: string;
  athleteName: string;
  sport: string;
  sportLabel: string;
  period: string;
  amount: number;
  dueDate: string;
  status: ChargeStatus;
  inProgress: boolean;
}

export interface PaymentRecord {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amount: number;
  status: 'open' | 'paid' | 'failed' | 'expired';
  method: string | null;
  methodLabel: string | null;
  receiptNumber: string | null;
  receiptStatus: 'none' | 'pending' | 'issued' | 'failed';
  hasReceipt: boolean;
  items: string[];
}

export interface Charges {
  enabled: boolean;
  quotas: QuotaCharge[];
  fees: FeeCharge[];
  payments: PaymentRecord[];
  suggestedNif: string | null;
}

export type PayItem = { kind: 'quota' | 'fee'; id: number };

/**
 * Pagamentos online (modo API): o browser só escolhe o QUE pagar; os valores vêm do servidor.
 * O pagamento faz-se no Stripe Checkout (cartão, MB WAY ou Multibanco) e a fatura-recibo
 * chega por email e fica disponível para descarregar.
 */
@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly api = inject(ApiClient);
  private readonly document = inject(DOCUMENT);
  readonly available = this.api.enabled;

  charges(): Promise<Charges> {
    return this.api.get<Charges>('/me/charges');
  }

  /** Cria o pagamento e segue para a página segura do Stripe. */
  async pay(items: PayItem[], nif: string, returnPath: '/area-socio' | '/area-atletas'): Promise<void> {
    const { url } = await this.api.post<{ url: string }>('/me/payments', { items, nif, returnPath });
    if (!url.startsWith('https://checkout.stripe.com/')) throw new Error('Endereço de pagamento inesperado');
    this.document.defaultView?.location.assign(url);
  }

  receiptUrl(paymentId: string) {
    return `${this.api.baseUrl}/me/payments/${encodeURIComponent(paymentId)}/receipt`;
  }
}
