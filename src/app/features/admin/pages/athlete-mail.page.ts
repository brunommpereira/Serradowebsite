import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

interface MailOut {
  dryRun: boolean;
  test?: boolean;
  sentTo?: string;
  sent?: number;
  athletes: number;
  ready: number;
  already: number;
  noEmail: number;
  noEmailNames: string[];
}

const TEXT = [
  'Por motivos alheios ao Clube, fomos impedidos de inscrever a equipa Serrado FC | Outdoor Training Camp na próxima prova do Troféu de Almada, que se realiza no Alfeite. Tentámos tudo para que a situação fosse resolvida, mas infelizmente não foi possível. Esta situação aconteceu também com outros clubes com um elevado número de participantes.',
  'Pedimos imensas desculpas pelo transtorno.',
  'Para compensar, temos uma proposta: no domingo, 22 de novembro, às 10h30, uma corridinha ou caminhada de 6 a 7 km, em frente ao Fresh, ao ritmo de cada um. Depois, festa de convívio no Fresh, com churrasco e bebida incluídos.',
  'Vamos festejar o início de época em grande! A inscrição faz-se na página do evento (20 € por pessoa e 7 € as crianças até 14 anos, pagos no dia). Traz a família e os amigos. Contamos com todos!',
].join('\n\n');

/** Email individual a todos os atletas (ou aos de uma modalidade), com o texto escrito aqui. */
@Component({
  selector: 'sfc-admin-athlete-mail',
  imports: [FormsModule, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Email aos atletas</h1>
        <p>
          Envia um email individual a cada atleta (nos menores, ao email da ficha, que é o do encarregado). Famílias com o
          mesmo endereço recebem um só email. Envia primeiro um teste para ti e confere o resultado.
        </p>
      </div>
    </div>
    @if (!api.enabled) {
      <sfc-offline-notice title="Só com o servidor" text="O envio de emails funciona com o site ligado à API (VPS)." />
    } @else {
      <section class="adm-panel block">
        <div class="grid">
          <div class="field wide">
            <label for="m-subject">Assunto <span class="req">*</span></label>
            <input id="m-subject" name="subject" [(ngModel)]="f.subject" maxlength="150" />
          </div>
          <div class="field wide">
            <label for="m-text">Texto <span class="req">*</span> <small>(separa os parágrafos com uma linha em branco)</small></label>
            <textarea id="m-text" name="text" [(ngModel)]="f.text" rows="12"></textarea>
          </div>
          <div class="field">
            <label for="m-b1l">Botão 1: texto</label>
            <input id="m-b1l" name="b1l" [(ngModel)]="f.button1Label" maxlength="90" />
          </div>
          <div class="field">
            <label for="m-b1u">Botão 1: endereço (https)</label>
            <input id="m-b1u" name="b1u" [(ngModel)]="f.button1Url" maxlength="400" />
          </div>
          <div class="field">
            <label for="m-b2l">Botão 2: texto</label>
            <input id="m-b2l" name="b2l" [(ngModel)]="f.button2Label" maxlength="90" />
          </div>
          <div class="field">
            <label for="m-b2u">Botão 2: endereço (https)</label>
            <input id="m-b2u" name="b2u" [(ngModel)]="f.button2Url" maxlength="400" />
          </div>
          <div class="field">
            <label for="m-sport">Para quem</label>
            <select id="m-sport" name="sport" [(ngModel)]="f.sport">
              <option value="">Todos os atletas</option>
              <option value="atletismo">Atletismo</option>
              <option value="futsal">Futsal</option>
              <option value="rugby">Rugby</option>
            </select>
          </div>
          <div class="field">
            <label for="m-camp">Referência da campanha</label>
            <input id="m-camp" name="camp" [(ngModel)]="f.campaign" maxlength="60" />
            <small class="caption">Cada endereço recebe uma campanha uma só vez. Para voltar a enviar o mesmo email, muda a referência.</small>
          </div>
          <div class="field">
            <label for="m-test">Enviar um teste para</label>
            <input id="m-test" name="test" type="email" [(ngModel)]="testTo" placeholder="o-teu-email@exemplo.pt" />
          </div>
        </div>
        @if (error(); as m) {
          <p class="alert alert--warning" role="alert">{{ m }}</p>
        }
        <div class="actions">
          <button type="button" class="btn btn--outline" [disabled]="busy() || !testTo.trim()" (click)="run('test')">Enviar teste</button>
          <button type="button" class="btn btn--outline" [disabled]="busy()" (click)="run('preview')">Ver quantos recebem</button>
        </div>
        @if (out(); as o) {
          <div class="imp" role="status">
            @if (o.test) {
              <p>Teste enviado para <strong>{{ o.sentTo }}</strong> (chega dentro de um minuto). O nome e o texto do teste são de exemplo.</p>
            } @else if (o.dryRun) {
              <p>
                <strong>{{ o.athletes }}</strong> atletas · <strong>{{ o.ready }}</strong> emails a enviar agora ·
                {{ o.already }} já receberam esta campanha · <strong>{{ o.noEmail }}</strong> sem email
              </p>
            } @else {
              <p><strong>{{ o.sent }}</strong> emails postos em fila; saem nos próximos minutos.</p>
            }
            @if (o.noEmailNames.length) {
              <details>
                <summary>Sem email ({{ o.noEmail }})</summary>
                <p class="caption">{{ o.noEmailNames.join(', ') }}</p>
              </details>
            }
          </div>
          @if (o.dryRun && !o.test && o.ready) {
            <div class="actions">
              <button type="button" class="btn btn--primary" [disabled]="busy()" (click)="run('send')">Enviar a {{ o.ready }} destinatários</button>
            </div>
          }
        }
      </section>
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.6rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
    .actions {
      margin-top: 1rem;
      display: flex;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
  `,
})
export class AthleteMailPage {
  protected readonly api = inject(ApiClient);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly out = signal<MailOut | null>(null);
  protected testTo = '';
  protected f = {
    subject: 'Prova do Alfeite: não vamos poder inscrever a equipa, mas temos uma proposta',
    text: TEXT,
    button1Label: 'Inscrever-me na corrida e festa',
    button1Url: 'https://www.serradofc.pt/eventos/abertura-da-epoca#inscricao',
    button2Label: 'Ler a notícia',
    button2Url: 'https://www.serradofc.pt/noticias/abertura-da-epoca-corrida-e-festa-no-fresh',
    sport: '',
    campaign: 'alfeite-fresh-2026-11',
  };

  /** preview: só contagens · test: um exemplo para o endereço indicado · send: envia a quem ainda não recebeu esta campanha */
  protected async run(mode: 'preview' | 'test' | 'send') {
    this.busy.set(true);
    this.error.set(null);
    const f = this.f;
    const button = (label: string, url: string) => (label.trim() && url.trim() ? { label: label.trim(), url: url.trim() } : undefined);
    const body = {
      dryRun: mode === 'preview',
      testTo: mode === 'test' ? this.testTo.trim() : undefined,
      campaign: f.campaign.trim(),
      subject: f.subject.trim(),
      paragraphs: f.text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
      button: button(f.button1Label, f.button1Url),
      button2: button(f.button2Label, f.button2Url),
      sport: f.sport || undefined,
    };
    try {
      this.out.set(await this.api.post<MailOut>('/admin/athletes-mail', body));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
