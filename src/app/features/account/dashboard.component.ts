import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { AreaSwitchComponent } from '../../shared/area-switch.component';
import { MemberCardComponent } from '../../shared/member-card.component';
import { PaymentStepComponent } from '../../shared/payment-step.component';
import { MembershipPayment, PaymentStatus } from '../../core/models';
import { ApiClient } from '../../core/api/api-client';
import { PayPanelComponent } from '../../shared/pay-panel.component';

type Section = 'dashboard' | 'dados' | 'quotas' | 'recibos' | 'cartao' | 'agregado' | 'eventos' | 'documentos' | 'notificacoes' | 'seguranca';

/** Área reservada de sócio (secção 11). Com a API ligada, as quotas vêm de GET /me/quotas. */
@Component({
  selector: 'sfc-dashboard',
  imports: [RouterLink, DatePipe, CurrencyPipe, IconComponent, MemberCardComponent, PaymentStepComponent, AreaSwitchComponent, PayPanelComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly content = inject(ContentService);

  /** Dados reais (API): sem pagamento online nem notificações/agregado por agora */
  protected readonly apiMode = inject(ApiClient).enabled;
  protected readonly member = this.auth.member;
  protected readonly payments = signal<MembershipPayment[]>([]);
  protected readonly paymentsError = signal<string | null>(null);
  /** Regresso do Stripe (?pagamento=ok|cancelado): abre logo «Quotas e pagamentos» */
  protected readonly section = signal<Section>(inject(ActivatedRoute).snapshot.queryParamMap.has('pagamento') ? 'quotas' : 'dashboard');
  protected readonly paying = signal<MembershipPayment | null>(null);

  protected readonly current = computed(() => this.payments().find((p) => p.status !== 'Pago') ?? this.payments()[0]);
  protected readonly lastPaid = computed(() => this.payments().find((p) => p.status === 'Pago'));
  protected readonly upToDate = computed(() => !this.payments().some((p) => p.status === 'Em atraso'));
  protected readonly receipts = computed(() => this.payments().filter((p) => p.receiptNumber));
  protected readonly events = this.content.upcomingEvents().slice(0, 3);
  protected readonly documents = this.content.documents().slice(0, 4);

  private readonly allMenu: { id: Section; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'dados', label: 'Dados pessoais', icon: 'user' },
    { id: 'quotas', label: 'Quotas e pagamentos', icon: 'euro' },
    { id: 'recibos', label: 'Recibos', icon: 'file' },
    { id: 'cartao', label: 'Cartão digital', icon: 'card' },
    { id: 'agregado', label: 'Agregado familiar', icon: 'users' },
    { id: 'eventos', label: 'Eventos / Inscrições', icon: 'calendar' },
    { id: 'documentos', label: 'Documentos', icon: 'file' },
    { id: 'notificacoes', label: 'Notificações', icon: 'bell' },
    { id: 'seguranca', label: 'Segurança', icon: 'shield' },
  ];

  // Modo API: os recibos estão em «Quotas e pagamentos» (faturas-recibo do Moloni)
  protected readonly menu = this.allMenu.filter((i) => !this.apiMode || !['agregado', 'notificacoes', 'recibos'].includes(i.id));

  protected readonly notifications = [
    { icon: 'check', text: 'Pagamento da quota de outubro recebido. Recibo R2026/0412 emitido.', date: '2026-10-02' },
    { icon: 'calendar', text: 'Inscrições abertas: Caminhada Solidária — Descobrir Património.', date: '2026-09-20' },
    { icon: 'info', text: 'Convocatória para a Assembleia Geral Ordinária publicada.', date: '2026-09-10' },
  ];

  constructor() {
    inject(SeoService).set({ title: 'Área de Sócio', description: 'Área reservada de sócio do Serrado FC.', path: '/area-socio' });
    this.auth.loadPayments().then(
      (list) => this.payments.set(list),
      (e: Error) => this.paymentsError.set(e.message),
    );
  }

  protected statusClass(s: PaymentStatus) {
    return { Pago: 'success', Pendente: 'warning', 'Em atraso': 'danger', Cancelado: 'neutral', Reembolsado: 'neutral' }[s];
  }

  protected go(section: Section) {
    this.section.set(section);
    this.paying.set(null);
  }

  protected pay(p: MembershipPayment) {
    if (this.apiMode) {
      this.section.set('quotas'); // pagamento online: painel com o Stripe
      return;
    }
    this.paying.set(p);
    this.section.set('quotas');
  }

  protected onPaid(method: MembershipPayment['paymentMethod']) {
    const p = this.paying();
    if (!p) return;
    const today = new Date().toISOString().slice(0, 10);
    this.payments.update((list) =>
      list.map((x) => (x.id === p.id ? { ...x, status: 'Pago', paymentDate: today, paymentMethod: method, receiptNumber: `R2026/${500 + x.id}` } : x)),
    );
    this.paying.set(null);
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/entrar');
  }
}
