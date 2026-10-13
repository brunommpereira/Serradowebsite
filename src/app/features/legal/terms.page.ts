import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContentService, tel } from '../../core/services/content.service';
import { SeoService } from '../../core/services/seo.service';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { RAL, COMPLAINTS_URL } from './legal-info';

/**
 * Termos e Condições: identificação do vendedor, preços e pagamento, entregas, livre resolução
 * (art. 10.º do DL 24/2014), garantia, resolução alternativa de litígios (Lei 144/2015) e Livro de
 * Reclamações (DL 156/2005, na redação do DL 74/2017). Os dados do clube vêm de Conteúdos do site → Contactos.
 */
@Component({
  selector: 'sfc-terms',
  imports: [PageHeroComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="Informação legal"
      title="Termos e Condições"
      [crumbs]="[{ label: 'Termos e Condições' }]"
    />
    <section class="section">
      <div class="container prose">
        <p class="caption">Última atualização: 13/10/2026</p>

        <nav class="toc" aria-label="Nesta página">
          <a href="#identificacao">1. Identificação</a>
          <a href="#ambito">2. Âmbito</a>
          <a href="#precos">3. Preços e pagamento</a>
          <a href="#entregas">4. Entregas e prestação dos serviços</a>
          <a href="#livre-resolucao">5. Direito de livre resolução</a>
          <a href="#garantia">6. Garantia</a>
          <a href="#litigios">7. Resolução de litígios (RAL)</a>
          <a href="#reclamacoes">8. Livro de Reclamações</a>
          <a href="#dados">9. Dados pessoais</a>
        </nav>

        <h2 id="identificacao" class="h-s">
          1. Identificação do vendedor e prestador dos serviços
        </h2>
        <dl class="ident">
          <dt>Denominação</dt>
          <dd>{{ club.name }} (associação sem fins lucrativos)</dd>
          <dt>NIF / NIPC</dt>
          <dd>{{ club.nipc }}</dd>
          <dt>Sede (morada física)</dt>
          <dd>{{ club.address }}, {{ club.postalCode }} {{ club.locality }}, Portugal</dd>
          <dt>Telefone</dt>
          <dd>
            <a [href]="'tel:' + tel(club.phone)">{{ club.phone }}</a> ({{ callCost(club.phone) }})
          </dd>
          <dt>Email</dt>
          <dd>
            <a [href]="'mailto:' + club.email">{{ club.email }}</a>
          </dd>
          @if (club.hours.length) {
            <dt>Atendimento</dt>
            <dd>
              @for (h of club.hours; track h.days) {
                {{ h.days }}: {{ h.time }}<br />
              }
            </dd>
          }
        </dl>

        <h2 id="ambito" class="h-s">2. Âmbito</h2>
        <p>
          Estes termos aplicam-se aos bens e serviços que o
          {{ club.shortName || club.name }} disponibiliza através deste site ou que nele apresenta:
          quotas de sócio, mensalidades das escolas e modalidades, inscrições em atividades e
          eventos, e artigos da loja do clube (equipamentos e merchandising). Ao fazer um pagamento
          ou uma encomenda, o cliente declara ter lido e aceite estes termos.
        </p>
        <p>
          As quotas de sócio resultam da relação associativa e regem-se também pelos
          <a routerLink="/clube/estatutos">Estatutos do clube</a>.
        </p>

        <h2 id="precos" class="h-s">3. Preços e pagamento</h2>
        <p>
          Os preços são apresentados em euros e incluem todos os impostos aplicáveis. O valor final
          a pagar, incluindo eventuais custos de envio, é sempre indicado antes da confirmação do
          pagamento ou da encomenda.
        </p>
        <p>
          Os pagamentos online são processados pela Stripe, em ambiente seguro, por cartão bancário,
          MB WAY ou referência Multibanco. Os dados do cartão ou do telemóvel são tratados
          diretamente pela Stripe e não passam pelo clube. Também é possível pagar na sede, em
          numerário, por cartão ou por transferência bancária. Por cada pagamento é emitida uma
          fatura-recibo, enviada por email.
        </p>

        <h2 id="entregas" class="h-s">
          4. Prazos e condições de entrega dos bens e de prestação dos serviços
        </h2>
        <h3>Serviços (quotas, mensalidades e inscrições)</h3>
        <p>
          Os serviços não têm entrega física. A quota ou mensalidade fica registada na Área de Sócio
          ou na Área de Atletas logo que o pagamento é confirmado (no imediato por cartão e MB WAY;
          até 2 dias úteis por Multibanco ou transferência). As atividades decorrem nas datas,
          horários e locais publicados em cada modalidade ou evento. As inscrições em provas
          organizadas por terceiros (por exemplo, o Troféu de Almada) são confirmadas pela entidade
          organizadora.
        </p>
        <h3>Artigos da loja</h3>
        <p>
          As encomendas são feitas pelo
          <a routerLink="/contactos" [queryParams]="{ assunto: 'Encomendas' }"
            >formulário de contacto</a
          >
          ou na sede. Antes de confirmar a encomenda, indicamos a disponibilidade, o prazo e o custo
          de envio.
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Destino</th>
                <th scope="col">Modo de entrega</th>
                <th scope="col">Prazo após o pagamento</th>
                <th scope="col">Custo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sede do clube</td>
                <td>Levantamento no horário de atendimento</td>
                <td>Até 5 dias úteis (artigos em stock)</td>
                <td>Gratuito</td>
              </tr>
              <tr>
                <td>Portugal continental</td>
                <td>Correio registado (CTT)</td>
                <td>3 a 7 dias úteis</td>
                <td>Indicado antes da confirmação</td>
              </tr>
              <tr>
                <td>Regiões Autónomas dos Açores e da Madeira</td>
                <td>Correio registado (CTT)</td>
                <td>5 a 15 dias úteis</td>
                <td>Indicado antes da confirmação</td>
              </tr>
              <tr>
                <td>Outros países</td>
                <td colspan="3">
                  Não fazemos envios para fora de Portugal; o artigo pode ser levantado na sede.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Artigos personalizados (por exemplo, com nome ou número) ou por encomenda ao fornecedor
          têm o prazo indicado no momento da encomenda. Em qualquer caso, a entrega é feita no prazo
          máximo de 30 dias após a celebração do contrato, salvo acordo diferente. Se o artigo não
          estiver disponível, o cliente é avisado e pode optar por esperar ou pelo reembolso total,
          feito no prazo máximo de 30 dias.
        </p>

        <h2 id="livre-resolucao" class="h-s">5. Direito de livre resolução</h2>
        <p>
          Nos contratos celebrados à distância (através do site, por email ou por telefone), o
          consumidor tem o direito de resolver o contrato no prazo de <strong>14 dias</strong>, sem
          necessidade de indicar o motivo e sem custos, nos termos do artigo 10.º do Decreto-Lei n.º
          24/2014, de 14 de fevereiro. O prazo conta-se:
        </p>
        <ul>
          <li>
            nos <strong>serviços</strong>, a partir do dia da celebração do contrato (pagamento ou
            inscrição);
          </li>
          <li>
            nos <strong>bens</strong>, a partir do dia em que o consumidor (ou alguém por si
            indicado, que não o transportador) recebe o artigo.
          </li>
        </ul>
        <p>
          Para exercer este direito, basta enviar uma declaração inequívoca para
          <a [href]="'mailto:' + club.email">{{ club.email }}</a
          >, por carta para a sede ou entregá-la pessoalmente, podendo usar o modelo de formulário
          abaixo (não é obrigatório).
        </p>
        <p>
          <strong>Reembolso:</strong> devolvemos todos os pagamentos recebidos, incluindo os custos
          de envio de base, no prazo de 14 dias a contar da data em que formos informados da decisão
          de resolução, pelo mesmo meio de pagamento usado (salvo acordo diferente), sem qualquer
          encargo. Nos bens, podemos aguardar a receção do artigo ou a prova do seu envio. O
          consumidor devolve o artigo no prazo de 14 dias, por sua conta, em bom estado.
        </p>
        <p>
          Se o consumidor pediu que o serviço começasse durante o prazo de livre resolução (por
          exemplo, o acesso a treinos), paga apenas o montante proporcional ao que já foi prestado
          até ao momento da resolução.
        </p>
        <p>
          <strong>Exceções</strong> (artigo 17.º do mesmo diploma): não há direito de livre
          resolução, nomeadamente:
        </p>
        <ul>
          <li>
            em serviços já integralmente prestados, quando a prestação começou com o consentimento
            prévio e expresso do consumidor e o reconhecimento de que perde esse direito;
          </li>
          <li>
            em artigos confecionados de acordo com as especificações do consumidor ou claramente
            personalizados (por exemplo, equipamentos com nome ou número);
          </li>
          <li>
            em serviços de atividades de lazer com data ou período de execução específicos, como a
            inscrição num evento ou numa prova com data marcada.
          </li>
        </ul>

        <h3 id="formulario">Modelo de formulário de livre resolução</h3>
        <div class="form-model">
          <p>
            <em
              >(Só deve preencher e devolver o presente formulário se quiser resolver o
              contrato.)</em
            >
          </p>
          <p>
            — Para: {{ club.name }}, {{ club.address }}, {{ club.postalCode }} {{ club.locality }};
            email {{ club.email }}
          </p>
          <p>
            — Pela presente comunico/comunicamos (*) que resolvo/resolvemos (*) do meu/nosso (*)
            contrato de venda do seguinte bem/para a prestação do seguinte serviço (*):
          </p>
          <p>— Solicitado em (*)/recebido em (*):</p>
          <p>— Nome do(s) consumidor(es):</p>
          <p>— Endereço do(s) consumidor(es):</p>
          <p>
            — Assinatura do(s) consumidor(es) (só no caso de o presente formulário ser notificado em
            papel):
          </p>
          <p>— Data:</p>
          <p><em>(*) Riscar o que não interessa.</em></p>
        </div>

        <h2 id="garantia" class="h-s">6. Garantia</h2>
        <p>
          Os bens vendidos a consumidores têm a garantia legal de conformidade de 3 anos, nos termos
          do Decreto-Lei n.º 84/2021, de 18 de outubro. Em caso de falta de conformidade,
          contacte-nos pelos meios indicados no ponto 1.
        </p>

        <h2 id="litigios" class="h-s">7. Resolução alternativa de litígios de consumo (RAL)</h2>
        <p>
          Em caso de litígio de consumo, o consumidor pode recorrer a uma entidade de resolução
          alternativa de litígios de consumo (RAL). A entidade competente para a área da sede do
          clube (concelho de Almada, Área Metropolitana de Lisboa) é:
        </p>
        <p class="ral">
          <strong>{{ ral.name }}</strong
          ><br />
          {{ ral.address }}<br />
          Telefone: {{ ral.phone }}<br />
          <a [href]="ral.url" target="_blank" rel="noopener">{{
            ral.url.replace('https://', '')
          }}</a>
        </p>
        <p>
          Mais informação sobre as entidades de resolução alternativa de litígios de consumo no
          Portal do Consumidor:
          <a href="https://www.consumidor.gov.pt" target="_blank" rel="noopener"
            >www.consumidor.gov.pt</a
          >
          (Lei n.º 144/2015, de 8 de setembro).
        </p>

        <h2 id="reclamacoes" class="h-s">8. Livro de Reclamações</h2>
        <p>
          O clube disponibiliza o Livro de Reclamações em formato físico, na sede, e em formato
          eletrónico, em
          <a [href]="complaintsUrl" target="_blank" rel="noopener">www.livroreclamacoes.pt</a>.
        </p>
        <p>
          <a class="lr-badge" [href]="complaintsUrl" target="_blank" rel="noopener"
            >Livro de Reclamações<span class="visually-hidden"> (abre numa nova janela)</span></a
          >
        </p>

        <h2 id="dados" class="h-s">9. Dados pessoais e lei aplicável</h2>
        <p>
          Os dados pessoais são tratados de acordo com a
          <a routerLink="/privacidade">Política de Privacidade</a>. Estes termos regem-se pela lei
          portuguesa.
        </p>
      </div>
    </section>
  `,
  styles: `
    h2 {
      margin-top: 2.2rem;
      text-transform: none;
      scroll-margin-top: 6rem;
    }
    h3 {
      font-size: 1.05rem;
      margin-top: 1.4rem;
      scroll-margin-top: 6rem;
    }
    .toc {
      display: grid;
      gap: 0.3rem;
      padding: 1rem 1.2rem;
      border: 1px solid var(--color-line);
      border-radius: var(--radius);
      margin: 1rem 0 1.5rem;
    }
    .ident {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 0.4rem 1.2rem;
      dt {
        font-weight: 700;
      }
      dd {
        margin: 0;
      }
    }
    @media (max-width: 560px) {
      .ident {
        grid-template-columns: 1fr;
        dd {
          margin-bottom: 0.5rem;
        }
      }
    }
    .table-wrap {
      overflow-x: auto;
      margin: 1rem 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.92rem;
      th,
      td {
        text-align: left;
        padding: 0.55rem 0.7rem;
        border-bottom: 1px solid var(--color-line);
        vertical-align: top;
      }
    }
    .form-model {
      border: 1px dashed var(--color-line);
      border-radius: var(--radius);
      padding: 1rem 1.2rem;
      p {
        margin: 0.35rem 0;
      }
    }
    .ral {
      padding: 1rem 1.2rem;
      background: var(--color-surface-2, #f3f5f9);
      border-radius: var(--radius);
    }
    .lr-badge {
      display: inline-block;
      padding: 0.6rem 1.1rem;
      border: 2px solid #c8102e;
      border-radius: 6px;
      color: #c8102e;
      font-weight: 800;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
  `,
})
export class TermsPage {
  private readonly content = inject(ContentService);
  protected readonly tel = tel;
  /** Indicação do custo da chamada (DL 59/2021): rede fixa (2…) ou móvel (9…) nacional. */
  protected callCost(phone: string) {
    const n = tel(phone).replace(/^\+351/, '');
    return n.startsWith('9')
      ? 'chamada para rede móvel nacional'
      : 'chamada para a rede fixa nacional';
  }
  protected readonly ral = RAL;
  protected readonly complaintsUrl = COMPLAINTS_URL;
  protected get club() {
    return this.content.club;
  }

  constructor() {
    inject(SeoService).set({
      title: 'Termos e Condições',
      description:
        'Termos e condições, entregas, direito de livre resolução, resolução alternativa de litígios e Livro de Reclamações do Serrado Futebol Clube.',
      path: '/termos-e-condicoes',
    });
  }
}
