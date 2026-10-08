import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';

interface LegalPage {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}

/**
 * Políticas RGPD (secção 37). Texto-base a validar juridicamente pelo clube
 * antes da publicação.
 */
@Component({
  selector: 'sfc-legal',
  imports: [PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="RGPD" [title]="doc().title" [crumbs]="[{ label: doc().title }]" />
    <section class="section">
      <div class="container prose">
        <p class="alert alert--warning">Texto-base para validação jurídica pela Direção antes da publicação.</p>
        <p class="caption">Última atualização: {{ doc().updated }}</p>
        @for (s of doc().sections; track s.h) {
          <h2 class="h-s">{{ s.h }}</h2>
          @for (p of s.p; track $index) {
            <p>{{ p }}</p>
          }
        }
      </div>
    </section>
  `,
  styles: `h2 { margin-top: 2rem; text-transform: none; }`,
})
export class LegalComponent {
  /** Vem de route.data */
  readonly page = input<'privacidade' | 'cookies'>('privacidade');
  private readonly club = inject(ContentService).club;
  private readonly seo = inject(SeoService);

  protected readonly doc = computed<LegalPage>(() => (this.page() === 'cookies' ? this.cookies() : this.privacy()));

  constructor() {
    effect(() =>
      this.seo.set({
        title: this.doc().title,
        description: `${this.doc().title} do Serrado Futebol Clube.`,
        path: `/${this.page()}`,
      }),
    );
  }

  private privacy(): LegalPage {
    return {
      title: 'Política de Privacidade',
      updated: '08/10/2026',
      sections: [
        { h: '1. Responsável pelo tratamento', p: [`${this.club.name}, NIPC ${this.club.nipc}, com sede no ${this.club.address}, ${this.club.postalCode} ${this.club.locality}. Contacto: ${this.club.email}.`] },
        { h: '2. Dados tratados', p: ['Identificação (nome, data de nascimento, NIF, documento de identificação), contactos, morada, dados de sócio e de pagamento de quotas, inscrições em modalidades e eventos e, quando autorizado, imagem.'] },
        { h: '3. Finalidades e fundamentos', p: ['Gestão da relação associativa e de quotas (execução de contrato), inscrições desportivas e em eventos, cumprimento de obrigações legais e fiscais, e envio de comunicações quando consentido.'] },
        { h: '4. Conservação', p: ['Os dados são conservados durante a relação com o clube e pelos prazos legais aplicáveis (por exemplo, obrigações fiscais), sendo depois eliminados ou anonimizados.'] },
        { h: '5. Os seus direitos', p: ['Acesso, retificação, apagamento (quando aplicável), limitação, portabilidade (exportação de dados), oposição e retirada do consentimento a qualquer momento. Pode exercê-los através do email do clube ou na Área de Sócio, e apresentar reclamação à CNPD.'] },
        { h: '6. Segurança', p: ['Ligações cifradas (HTTPS), controlo de acessos por perfis, autenticação forte para administradores, registos de auditoria e cópias de segurança.'] },
        {
          h: '7. Entrar com Google ou Microsoft',
          p: [
            'Se escolher entrar com uma conta Google ou Microsoft, recebemos desse serviço apenas o identificador da conta, o nome e o email, para a ligar à sua conta no clube (que tem de existir e ter o mesmo email). Não recebemos a password nem outros dados, e não criamos contas novas. Pode desligar a conta Google ou Microsoft a qualquer momento depois de entrar no site.',
          ],
        },
        { h: '8. Menores', p: ['O tratamento de dados de menores de 13 anos requer o consentimento do titular das responsabilidades parentais.'] },
      ],
    };
  }

  private cookies(): LegalPage {
    return {
      title: 'Política de Cookies',
      updated: '06/10/2026',
      sections: [
        { h: '1. O que são cookies', p: ['Pequenos ficheiros guardados no seu dispositivo que permitem ao site funcionar e lembrar preferências.'] },
        { h: '2. Cookies que utilizamos', p: ['Essenciais: necessários ao funcionamento do site e da Área de Sócio (sessão). Analíticos (apenas com consentimento): medição de audiências para melhorar o site.'] },
        { h: '3. Gestão', p: ['Pode aceitar ou recusar cookies não essenciais e alterar a sua escolha a qualquer momento nas definições do browser.'] },
      ],
    };
  }
}
