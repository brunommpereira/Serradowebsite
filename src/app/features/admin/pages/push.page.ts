import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../../core/api/api-client';
import { OfflineNoticeComponent } from '../../../shared/offline-notice.component';

interface Stats {
  devices: number;
  topics: Record<string, number>;
}

const TOPICS = [
  { key: 'noticias', label: 'Notícias' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'jogos', label: 'Jogos e resultados' },
];

/** Notificações da app: quantos dispositivos seguem cada tema e envio de um aviso manual. */
@Component({
  selector: 'sfc-admin-push',
  imports: [FormsModule, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm-head">
      <div>
        <h1>Notificações da app</h1>
        <p>
          Avisos automáticos: notícias e eventos publicados, lembrete dos jogos na véspera e
          resultados lançados em «Conteúdos do site → Jogos», quotas e pagamentos, pedidos de gasto.
          Aqui pode enviar um aviso manual (ex.: treino cancelado).
        </p>
      </div>
    </div>
    @if (!api.enabled) {
      <sfc-offline-notice
        title="Só com o servidor"
        text="As notificações funcionam com o site ligado à API (VPS)."
      />
    } @else {
      <section class="adm-panel block">
        <h2>Dispositivos com notificações</h2>
        <p class="kpis">
          <span
            ><strong>{{ stats()?.devices ?? '—' }}</strong> dispositivos</span
          >
          @for (t of all; track t.key) {
            <span
              ><strong>{{ stats()?.topics?.[t.key] ?? 0 }}</strong> {{ t.label }}</span
            >
          }
        </p>
      </section>
      <section class="adm-panel block">
        <h2>Enviar um aviso</h2>
        @if (error()) {
          <p class="alert alert--warning" role="alert">{{ error() }}</p>
        }
        @if (notice()) {
          <p class="alert alert--success" role="status">{{ notice() }}</p>
        }
        <form class="grid" (submit)="$event.preventDefault(); send()">
          <div class="field">
            <label for="b-topic">Para quem segue</label>
            <select id="b-topic" name="topic" [(ngModel)]="f.topic">
              @for (t of topics; track t.key) {
                <option [value]="t.key">{{ t.label }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="b-sport">Modalidade (jogos)</label>
            <select
              id="b-sport"
              name="sport"
              [(ngModel)]="f.sport"
              [disabled]="f.topic !== 'jogos'"
            >
              <option value="">Todas</option>
              <option value="atletismo">Atletismo</option>
              <option value="futsal">Futsal</option>
              <option value="rugby">Rugby</option>
            </select>
          </div>
          <div class="field wide">
            <label for="b-title">Título <span class="req">*</span></label>
            <input
              id="b-title"
              name="title"
              [(ngModel)]="f.title"
              required
              minlength="3"
              maxlength="80"
              placeholder="Ex.: Treino cancelado"
            />
          </div>
          <div class="field wide">
            <label for="b-body">Texto <span class="req">*</span></label>
            <textarea
              id="b-body"
              name="body"
              [(ngModel)]="f.body"
              required
              minlength="3"
              maxlength="240"
              rows="2"
            ></textarea>
          </div>
          <div class="field wide">
            <label for="b-url">Abrir ao tocar (endereço do site)</label>
            <input
              id="b-url"
              name="url"
              [(ngModel)]="f.url"
              maxlength="300"
              placeholder="/agenda"
            />
          </div>
          <div class="wide">
            <button class="btn btn--primary" type="submit" [disabled]="busy()">Enviar</button>
          </div>
        </form>
      </section>
    }
  `,
  styles: `
    .kpis {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      strong {
        font-size: 1.4rem;
        margin-right: 0.3rem;
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.6rem 1rem;
      .wide {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class PushPage {
  protected readonly api = inject(ApiClient);
  protected readonly topics = TOPICS;
  protected readonly all = [
    ...TOPICS,
    { key: 'pagamentos', label: 'Pagamentos' },
    { key: 'gastos', label: 'Pedidos de gasto' },
  ];
  protected readonly stats = signal<Stats | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected f = { topic: 'noticias', sport: '', title: '', body: '', url: '/' };

  constructor() {
    if (this.api.enabled) void this.load();
  }

  private async load() {
    try {
      this.stats.set(await this.api.get<Stats>('/admin/push/stats'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Erro ao carregar');
    }
  }

  protected async send() {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const url = this.f.url.trim() || '/';
      const out = await this.api.post<{ devices: number }>('/admin/push/broadcast', {
        topic: this.f.topic,
        sport: this.f.topic === 'jogos' && this.f.sport ? this.f.sport : null,
        title: this.f.title,
        body: this.f.body,
        url: url.startsWith('/') ? url : '/' + url,
      });
      this.notice.set(
        `Aviso enviado para ${out.devices} dispositivo${out.devices === 1 ? '' : 's'}.`,
      );
      this.f = { ...this.f, title: '', body: '' };
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível enviar');
    } finally {
      this.busy.set(false);
    }
  }
}
