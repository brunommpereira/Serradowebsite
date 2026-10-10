import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { Permission, roleName } from '../../core/permissions';
import { IconComponent } from '../../shared/icon.component';
import { AdminSource } from './data/admin-source';

interface NavItem {
  label: string;
  link: string;
  icon: string;
  /** Uma destas permissões (vazio = toda a equipa) */
  permissions: Permission[];
  exact?: boolean;
}

const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'Geral', items: [{ label: 'Dashboard', link: '/admin', icon: 'home', permissions: [], exact: true }] },
  {
    title: 'Conteúdos (CMS)',
    items: [
      { label: 'Conteúdos do site', link: '/admin/site', icon: 'home', permissions: ['cms.edit'] },
      { label: 'Notícias', link: '/admin/conteudos/news', icon: 'file', permissions: ['cms.edit'] },
      { label: 'Eventos', link: '/admin/conteudos/events', icon: 'calendar', permissions: ['cms.edit'] },
      { label: 'Páginas', link: '/admin/conteudos/pages', icon: 'home', permissions: ['cms.edit'] },
      { label: 'Parceiros', link: '/admin/conteudos/partners', icon: 'heart', permissions: ['cms.edit'] },
      { label: 'Imagens', link: '/admin/imagens', icon: 'image', permissions: ['cms.edit'] },
      { label: 'Reels e histórias', link: '/admin/redes-sociais', icon: 'facebook', permissions: ['cms.edit'] },
    ],
  },
  {
    title: 'Clube',
    items: [
      { label: 'Sócios', link: '/admin/socios', icon: 'card', permissions: ['members.view'] },
      { label: 'Atletas', link: '/admin/atletas', icon: 'users', permissions: ['athletes.view', 'athletes.manage'] },
      { label: 'Importar', link: '/admin/importar', icon: 'upload', permissions: ['members.manage', 'athletes.manage'] },
      { label: 'Propostas', link: '/admin/registos', icon: 'file', permissions: ['registrations.manage'] },
      { label: 'Pré-inscrições', link: '/admin/pre-inscricoes', icon: 'bell', permissions: ['registrations.manage'] },
      { label: 'Validações', link: '/admin/validacoes', icon: 'check', permissions: ['athletes.manage'] },
      { label: 'Resultados', link: '/admin/resultados', icon: 'trophy', permissions: ['results.import'] },
      { label: 'Pagamentos', link: '/admin/pagamentos', icon: 'euro', permissions: ['payments.view'] },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { label: 'Utilizadores', link: '/admin/utilizadores', icon: 'user', permissions: ['users.manage'] },
      { label: 'Papéis e permissões', link: '/admin/papeis', icon: 'shield', permissions: ['users.manage'] },
      { label: 'Auditoria', link: '/admin/auditoria', icon: 'clock', permissions: [] },
    ],
  },
];

/** Layout do backoffice: barra lateral filtrada pelas permissões da conta. */
@Component({
  selector: 'sfc-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="adm" [class.adm--menu]="menuOpen()">
      <aside class="side" id="adm-side" aria-label="Menu do backoffice">
        <a routerLink="/admin" class="side__brand">
          <img src="brand/logo.svg" alt="" width="36" height="40" />
          <span><strong>Serrado FC</strong><small>Backoffice</small></span>
        </a>
        <nav>
          @for (g of nav(); track g.title) {
            <p class="side__group">{{ g.title }}</p>
            @for (i of g.items; track i.link) {
              <a [routerLink]="i.link" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: !!i.exact }" (click)="menuOpen.set(false)">
                <sfc-icon [name]="i.icon" size="18" />{{ i.label }}
              </a>
            }
          }
        </nav>
        <div class="side__foot">
          <p class="side__user">
            <strong>{{ auth.account()?.name }}</strong>
            <small>{{ roleLabels() }}</small>
          </p>
          <a routerLink="/" class="side__link"><sfc-icon name="external" size="16" />Ver o site</a>
          <button type="button" class="side__link" (click)="logout()"><sfc-icon name="logout" size="16" />Terminar sessão</button>
        </div>
      </aside>

      <div class="main">
        <header class="top">
          <button type="button" class="top__menu" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()" aria-controls="adm-side" aria-label="Menu">
            <sfc-icon [name]="menuOpen() ? 'close' : 'menu'" size="22" />
          </button>
          <span class="top__title">Backoffice</span>
          @if (source.mode === 'demo') {
            <span class="top__mode" title="Sem servidor: as alterações ficam guardadas só neste browser">Modo demonstração</span>
          } @else {
            <span class="top__mode top__mode--live">Ligado à API</span>
          }
        </header>
        @if (denied()) {
          <p class="alert alert--warning adm-denied" role="alert"><sfc-icon name="warning" />Não tens permissão para essa secção.</p>
        }
        <div class="content">
          <router-outlet />
        </div>
      </div>
      @if (menuOpen()) {
        <button type="button" class="scrim" aria-label="Fechar menu" (click)="menuOpen.set(false)"></button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      --side-w: 248px;
    }
    .adm {
      min-height: 100vh;
      display: grid;
      grid-template-columns: var(--side-w) minmax(0, 1fr);
      background: #f2f4f8;
    }
    .side {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 1rem 0.8rem;
      background: var(--sfc-blue-900);
      color: #fff;
    }
    .side__brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.3rem 0.5rem 0.8rem;
      color: #fff;
      text-decoration: none;
      span {
        display: grid;
        line-height: 1.1;
      }
      strong {
        font: 800 1.15rem var(--font-display);
        text-transform: uppercase;
      }
      small {
        font-size: 0.75rem;
        color: var(--sfc-yellow);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    }
    nav {
      display: grid;
      gap: 2px;
      a {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-height: 40px;
        padding: 0 0.7rem;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.85);
        text-decoration: none;
        font-weight: 600;
        font-size: 0.92rem;
        &:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        &.on {
          background: #fff;
          color: var(--sfc-blue-900);
        }
        &:focus-visible {
          outline: 3px solid var(--sfc-yellow);
          outline-offset: 1px;
        }
      }
    }
    .side__group {
      margin: 0.8rem 0 0.2rem;
      padding: 0 0.7rem;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.55);
    }
    .side__foot {
      margin-top: auto;
      padding-top: 0.8rem;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
      display: grid;
      gap: 2px;
    }
    .side__user {
      display: grid;
      margin: 0 0 0.4rem;
      padding: 0 0.7rem;
      small {
        color: rgba(255, 255, 255, 0.65);
      }
    }
    .side__link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 36px;
      padding: 0 0.7rem;
      border: 0;
      border-radius: 8px;
      background: none;
      color: rgba(255, 255, 255, 0.85);
      font: 600 0.88rem var(--font-body);
      text-decoration: none;
      cursor: pointer;
      &:hover {
        background: rgba(255, 255, 255, 0.08);
      }
    }
    .main {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .top {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      min-height: 56px;
      padding: 0 1.5rem;
      background: #fff;
      border-bottom: 1px solid var(--color-line);
    }
    .top__menu {
      display: none;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 8px;
      background: none;
      cursor: pointer;
      color: var(--color-text);
    }
    .top__title {
      font: 800 1.1rem var(--font-display);
      text-transform: uppercase;
    }
    .top__mode {
      margin-left: auto;
      padding: 0.3em 0.8em;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      background: #fff3c4;
      color: #6b4e00;
      &--live {
        background: #e3f4e7;
        color: var(--color-success);
      }
    }
    .adm-denied {
      margin: 1rem 1.5rem 0;
    }
    .content {
      padding: 1.5rem;
      max-width: 1240px;
      width: 100%;
    }
    .scrim {
      display: none;
    }
    @media (max-width: 960px) {
      .adm {
        grid-template-columns: 1fr;
      }
      .side {
        position: fixed;
        z-index: 50;
        inset: 0 auto 0 0;
        width: min(var(--side-w), 86vw);
        transform: translateX(-100%);
        transition: transform 0.2s ease;
      }
      .adm--menu .side {
        transform: none;
      }
      .scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 40;
        border: 0;
        background: rgba(0, 20, 45, 0.45);
      }
      .top__menu {
        display: grid;
        place-items: center;
      }
      .top {
        padding: 0 0.8rem;
      }
      .content {
        padding: 1rem;
      }
    }
  `,
})
export class AdminShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly source = inject(AdminSource);
  private readonly router = inject(Router);
  protected readonly menuOpen = signal(false);

  protected readonly nav = computed(() =>
    NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permissions.length || this.auth.can(...i.permissions)) })).filter((g) => g.items.length),
  );
  protected readonly roleLabels = computed(() => this.auth.roles().map((r) => roleName(r)).join(' · '));
  protected readonly denied = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.includes('semPermissao=1')),
    ),
    { initialValue: this.router.url.includes('semPermissao=1') },
  );

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/entrar?perfil=staff');
  }
}
