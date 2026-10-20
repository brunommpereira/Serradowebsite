import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppPushService, PushTopic } from '../../core/services/app-push.service';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { PageHeroComponent } from '../../shared/page-hero.component';

const SPORTS = [
  { key: 'atletismo', label: 'Atletismo' },
  { key: 'futsal', label: 'Futsal' },
  { key: 'rugby', label: 'Rugby' },
];

/** Instalar a app (PWA) e escolher as notificações deste dispositivo. */
@Component({
  selector: 'sfc-app-page',
  imports: [IconComponent, PageHeroComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero
      eyebrow="App"
      title="App e notificações"
      subtitle="O Serrado FC no ecrã do telemóvel, com avisos de jogos, notícias e pagamentos."
      [crumbs]="[{ label: 'App e notificações' }]"
    />
    <section class="section">
      <div class="container cols">
        <article class="card">
          <h2 class="h-s"><sfc-icon name="download" /> Instalar a app</h2>
          @if (!ready()) {
            <p class="caption">A verificar este dispositivo…</p>
          } @else if (push.installed()) {
            <p class="ok">
              <sfc-icon name="check" /> Já está a usar a app do Serrado FC neste dispositivo.
            </p>
          } @else if (push.installPrompt()) {
            <p>Fica com o ícone do clube no ecrã principal e abre em ecrã inteiro, como uma app.</p>
            <button type="button" class="btn btn--primary" (click)="install()">
              Instalar a app
            </button>
          } @else if (push.ios) {
            <p>No iPhone e no iPad, a partir do Safari:</p>
            <ol class="steps">
              <li>
                Toque em <strong>Partilhar</strong> <sfc-icon name="share" size="16" /> na barra do
                Safari.
              </li>
              <li>Escolha <strong>Adicionar ao ecrã principal</strong>.</li>
              <li>
                Abra a app a partir do novo ícone do Serrado FC. As notificações ativam-se lá
                dentro.
              </li>
            </ol>
          } @else {
            <p>
              No Android (Chrome), abra o menu <strong>⋮</strong> e escolha
              <strong>Instalar app</strong> ou <strong>Adicionar ao ecrã principal</strong>. No
              computador (Chrome ou Edge), use o ícone de instalação na barra de endereço.
            </p>
          }
        </article>

        <article class="card">
          <h2 class="h-s"><sfc-icon name="bell" /> Notificações</h2>
          @if (!ready()) {
            <p class="caption">A verificar este dispositivo…</p>
          } @else if (!push.supported) {
            @if (push.ios && !push.installed()) {
              <p>
                No iPhone, as notificações só funcionam na app instalada (iOS 16.4 ou mais recente).
                Instale primeiro a app e abra-a a partir do ícone.
              </p>
            } @else {
              <p>
                Este browser não permite notificações do site. Experimente o Chrome, o Edge, o
                Firefox ou o Safari atualizados.
              </p>
            }
          } @else if (push.permission() === 'denied') {
            <p class="alert alert--warning">
              As notificações estão bloqueadas para este site. Para as voltar a permitir, abra as
              definições do browser (ou da app) → Notificações → Serrado FC.
            </p>
          } @else {
            <p class="caption">
              Escolha o que quer receber neste dispositivo. Pode mudar ou desligar a qualquer
              momento.
            </p>
            <fieldset class="topics">
              <legend class="visually-hidden">Temas</legend>
              <label class="opt"
                ><input type="checkbox" [checked]="has('noticias')" (change)="toggle('noticias')" />
                <span
                  ><strong>Notícias</strong><br /><span class="caption"
                    >Quando o clube publica uma notícia.</span
                  ></span
                ></label
              >
              <label class="opt"
                ><input type="checkbox" [checked]="has('eventos')" (change)="toggle('eventos')" />
                <span
                  ><strong>Eventos</strong><br /><span class="caption"
                    >Torneios, festas e iniciativas do clube.</span
                  ></span
                ></label
              >
              <label class="opt"
                ><input type="checkbox" [checked]="has('jogos')" (change)="toggle('jogos')" />
                <span
                  ><strong>Jogos e resultados</strong><br /><span class="caption"
                    >Lembrete na véspera e o resultado final.</span
                  ></span
                ></label
              >
              @if (has('jogos')) {
                <div class="chips" role="group" aria-label="Modalidades dos jogos">
                  <button
                    type="button"
                    class="chip"
                    [attr.aria-pressed]="!sports().length"
                    (click)="sports.set([])"
                  >
                    Todas
                  </button>
                  @for (s of sportOptions; track s.key) {
                    <button
                      type="button"
                      class="chip"
                      [attr.aria-pressed]="sports().includes(s.key)"
                      (click)="toggleSport(s.key)"
                    >
                      {{ s.label }}
                    </button>
                  }
                </div>
              }
              @if (auth.isLoggedIn()) {
                <label class="opt"
                  ><input
                    type="checkbox"
                    [checked]="has('pagamentos')"
                    (change)="toggle('pagamentos')"
                  />
                  <span
                    ><strong>Quotas e pagamentos</strong><br /><span class="caption"
                      >Quota ou mensalidade para pagar e pagamento recebido (da sua conta).</span
                    ></span
                  ></label
                >
                @if (expenses()) {
                  <label class="opt"
                    ><input type="checkbox" [checked]="has('gastos')" (change)="toggle('gastos')" />
                    <span
                      ><strong>Pedidos de gasto</strong><br /><span class="caption"
                        >Quando um pedido precisa de si ou muda de estado.</span
                      ></span
                    ></label
                  >
                }
              } @else {
                <p class="caption">
                  <a routerLink="/entrar" [queryParams]="{ voltar: '/app' }">Entre na sua conta</a>
                  para receber também os avisos de quotas e pagamentos.
                </p>
              }
            </fieldset>
            @if (error()) {
              <p class="alert alert--warning" role="alert">{{ error() }}</p>
            }
            @if (notice()) {
              <p class="alert alert--success" role="status">{{ notice() }}</p>
            }
            <div class="actions">
              <button
                type="button"
                class="btn btn--primary"
                [disabled]="busy() || !topics().length"
                (click)="save()"
              >
                {{ push.status().subscribed ? 'Guardar' : 'Ativar notificações' }}
              </button>
              @if (push.status().subscribed) {
                <button type="button" class="btn btn--ghost" [disabled]="busy()" (click)="off()">
                  Desligar todas
                </button>
              }
            </div>
          }
        </article>
      </div>
    </section>
  `,
  styles: `
    .cols {
      display: grid;
      gap: 1.5rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
      align-items: start;
    }
    .card {
      border: 1px solid var(--color-line);
      border-radius: var(--radius-l);
      padding: 1.5rem;
      background: #fff;
      h2 {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.75rem;
      }
    }
    .ok {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      color: var(--color-success);
      font-weight: 600;
    }
    .steps {
      padding-left: 1.2rem;
      display: grid;
      gap: 0.4rem;
    }
    .topics {
      border: 0;
      padding: 0;
      margin: 1rem 0;
      display: grid;
      gap: 0.9rem;
    }
    .opt {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      cursor: pointer;
      input {
        width: 1.25rem;
        height: 1.25rem;
        margin-top: 0.15rem;
        flex: none;
      }
    }
    .chips {
      margin-left: 2rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  `,
})
export class AppPageComponent {
  protected readonly push = inject(AppPushService);
  protected readonly auth = inject(AuthService);
  protected readonly sportOptions = SPORTS;
  protected readonly topics = signal<PushTopic[]>(['noticias', 'eventos', 'jogos']);
  protected readonly sports = signal<string[]>([]);
  protected readonly busy = signal(false);
  /** O que depende do dispositivo só aparece no browser (a página é pré-renderizada) */
  protected readonly ready = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly expenses = computed(() =>
    this.auth.can('expenses.request', 'expenses.approve', 'expenses.pay', 'expenses.view'),
  );

  constructor() {
    inject(SeoService).set({
      title: 'App e notificações',
      description:
        'Instale a app do Serrado FC no telemóvel e receba notificações de jogos, resultados, notícias, eventos e pagamentos.',
      path: '/app',
    });
    afterNextRender(() => this.ready.set(true));
    // Mostra o que já está ativo neste dispositivo
    effect(() => {
      const s = this.push.status();
      if (s.subscribed) {
        this.topics.set(s.topics);
        this.sports.set(s.sports);
      }
    });
  }

  protected has(t: PushTopic) {
    return this.topics().includes(t);
  }

  protected toggle(t: PushTopic) {
    this.topics.update((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));
  }

  protected toggleSport(k: string) {
    this.sports.update((list) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]));
  }

  protected async install() {
    await this.push.install();
  }

  protected async save() {
    await this.run(async () => {
      await this.push.save(this.topics(), this.has('jogos') ? this.sports() : []);
      this.notice.set('Notificações ativas neste dispositivo.');
    });
  }

  protected async off() {
    await this.run(async () => {
      await this.push.disable();
      this.notice.set('Notificações desligadas neste dispositivo.');
    });
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await fn();
    } catch (e) {
      this.push.permission.set('Notification' in window ? Notification.permission : 'unsupported');
      this.error.set(
        this.push.permission() === 'denied'
          ? 'O browser não deu autorização para notificações.'
          : `Não foi possível ativar as notificações (${e instanceof Error ? e.message : 'erro'}).`,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
