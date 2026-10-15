import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { ContentService } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';

interface LegalPage {
  title: string;
  updated: string;
  sections: { h: string; p: string[] }[];
}

/** Política de Privacidade e Política de Cookies (RGPD). Os dados do clube vêm de Conteúdos do site → Contactos. */
@Component({
  selector: 'sfc-legal',
  imports: [PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Informação legal" [title]="doc().title" [crumbs]="[{ label: doc().title }]" />
    <section class="section">
      <div class="container prose">
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
      updated: '13/10/2026',
      sections: [
        {
          h: '1. Responsável pelo tratamento',
          p: [
            `${this.club.name}, NIF/NIPC ${this.club.nipc}, com sede em ${this.club.address}, ${this.club.postalCode} ${this.club.locality}. Contacto: ${this.club.email}${this.club.phone ? ' · ' + this.club.phone : ''}.`,
            'Para qualquer questão sobre dados pessoais ou para exercer os seus direitos, escreva para o email acima com o assunto «Dados pessoais».',
          ],
        },
        { h: '2. Dados tratados', p: ['Identificação (nome, data de nascimento, NIF, documento de identificação), contactos, morada, dados de sócio e de pagamento de quotas, inscrições em modalidades e eventos e, quando autorizado, imagem.'] },
        { h: '3. Finalidades e fundamentos', p: ['Gestão da relação associativa e de quotas (execução de contrato), inscrições desportivas e em eventos, cumprimento de obrigações legais e fiscais, e envio de comunicações quando consentido.'] },
        { h: '4. Conservação', p: ['Os dados são conservados durante a relação com o clube e pelos prazos legais aplicáveis (por exemplo, obrigações fiscais), sendo depois eliminados ou anonimizados. As mensagens enviadas pelo formulário de contacto são apagadas ao fim de um ano.'] },
        { h: '5. Os seus direitos', p: ['Acesso, retificação, apagamento (quando aplicável), limitação, portabilidade (exportação de dados), oposição e retirada do consentimento a qualquer momento. Pode exercê-los através do email do clube ou na Área de Sócio, sem custos, e respondemos no prazo de um mês. Tem ainda o direito de apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD, www.cnpd.pt).'] },
        { h: '6. Segurança', p: ['Ligações cifradas (HTTPS), controlo de acessos por perfis, autenticação forte para administradores, registos de auditoria e cópias de segurança.'] },
        {
          h: '7. Entrar com Google ou Microsoft',
          p: [
            'Se escolher entrar com uma conta Google ou Microsoft, recebemos desse serviço apenas o identificador da conta, o nome e o email, para a ligar à sua conta no clube (que tem de existir e ter o mesmo email). Não recebemos a password nem outros dados, e não criamos contas novas. Pode desligar a conta Google ou Microsoft a qualquer momento depois de entrar no site.',
          ],
        },
        {
          h: '8. Pagamentos online',
          p: [
            'Os pagamentos de quotas e mensalidades são processados pela Stripe (cartão, MB WAY e Multibanco): os dados do cartão ou do telemóvel são tratados diretamente pela Stripe e nunca passam pelo clube. As faturas-recibo são emitidas no programa de faturação Moloni (certificado pela AT) com o nome, o NIF e o email de quem paga, e enviadas por email. Estes dados são conservados pelos prazos legais de faturação.',
          ],
        },
        { h: '9. Menores', p: ['O tratamento de dados de menores de 13 anos requer o consentimento do titular das responsabilidades parentais.'] },
        {
          h: '10. Propostas online e aceitação',
          p: [
            'Quando envia uma proposta de sócio ou de atleta pelo site, guardamos, como prova da aceitação: os dados do formulário, a versão exata dos documentos aceites, a declaração de aceitação, a confirmação feita pela ligação enviada para o seu email, a data e hora, o endereço IP e a identificação do navegador. Com estes elementos geramos um documento PDF, que lhe enviamos por email e que fica guardado pelo clube enquanto durar a inscrição e pelos prazos legais.',
            'A autorização de imagem é facultativa e pode ser retirada a qualquer momento junto da secretaria.',
          ],
        },
        {
          h: '11. Emails do site e acesso da equipa',
          p: [
            'Os emails do site (por exemplo, a ligação para repor a password ou o convite para criar a conta) são enviados através da Brevo, com servidores na União Europeia. A Brevo recebe apenas o nome, o email e o texto da mensagem; depois do envio, o clube não guarda o conteúdo. As ligações de reposição são de uso único e expiram.',
            'Na equipa do clube, cada pessoa só acede ao que a sua função exige (por exemplo, só a secretaria vê os dados de identificação dos atletas). Todos os acessos de gestão ficam registados.',
          ],
        },
        {
          h: '12. Inscrições em provas de terceiros',
          p: [
            'Quando o atleta ou o encarregado de educação pede, na Área de Atletas, a inscrição numa prova organizada por terceiros (por exemplo, o Troféu de Almada, gerido pela Xistarca), o clube envia a essa entidade os dados necessários à inscrição: nome, data de nascimento, género, n.º do documento de identificação, telefone, email, localidade e contacto de emergência. O envio só é feito com a autorização dada no pedido. A entidade organizadora trata depois esses dados como responsável, de acordo com a sua política de privacidade.',
          ],
        },
        {
          h: '13. Estatísticas de visitas',
          p: [
            'Contamos as visitas às páginas públicas com o Umami, alojado no servidor do clube, sem cookies e sem guardar o endereço IP: só ficam dados agregados (página, origem da visita, tipo de dispositivo, país). As áreas reservadas não são contadas.',
          ],
        },
        {
          h: '14. Redes sociais',
          p: [
            'O site mostra publicações, eventos, reels e histórias da página pública de Facebook do clube. O vídeo do Facebook só é carregado quando carrega em reproduzir; a partir desse momento aplica-se a política de privacidade da Meta.',
          ],
        },
      ],
    };
  }

  private cookies(): LegalPage {
    return {
      title: 'Política de Cookies',
      updated: '13/10/2026',
      sections: [
        { h: '1. O que são cookies', p: ['Pequenos ficheiros guardados no seu dispositivo que permitem ao site funcionar e lembrar preferências.'] },
        {
          h: '2. Cookies que utilizamos',
          p: [
            'Apenas cookies essenciais: o cookie de sessão, criado quando entra na Área de Sócio, na Área de Atletas ou no backoffice, que expira ao fim de algumas horas ou quando sai. Não usamos cookies de publicidade nem de medição de audiências, por isso não pedimos consentimento.',
            'Para saber quantas pessoas visitam o site, usamos o Umami, instalado no servidor do próprio clube: não usa cookies, não guarda o endereço IP nem dados que identifiquem o visitante, não conta as áreas reservadas e respeita a opção «Não rastrear» do navegador. Nada é enviado a terceiros.',
            'O leitor de vídeo do Facebook só é carregado quando carrega em reproduzir um reel; a partir daí a Meta pode usar os seus próprios cookies, de acordo com a política dela.',
          ],
        },
        { h: '3. Gestão', p: ['Pode apagar ou bloquear cookies nas definições do navegador. Se bloquear o cookie de sessão, não consegue entrar nas áreas reservadas.'] },
      ],
    };
  }
}
