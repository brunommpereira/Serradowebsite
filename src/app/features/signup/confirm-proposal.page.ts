import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { PageHeroComponent } from '../../shared/page-hero.component';
import { SignupService } from './signup.service';

/** /propostas/confirmar?token=… — a ligação do email: confirma a proposta e envia-a à secretaria. */
@Component({
  selector: 'sfc-confirm-proposal',
  imports: [RouterLink, IconComponent, PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sfc-page-hero eyebrow="Propostas" title="Confirmar proposta" [crumbs]="[{ label: 'Confirmar proposta' }]" />
    <section class="section">
      <div class="container narrow">
        @if (state() === 'loading') {
          <p class="caption" aria-live="polite">A confirmar…</p>
        } @else if (state() === 'ok') {
          <div class="card done" role="status">
            <sfc-icon name="check" size="40" />
            <h2>{{ already() ? 'Já estava confirmada' : 'Proposta confirmada!' }}</h2>
            <p>
              {{ kind() === 'member' ? 'A proposta de sócio' : 'A inscrição de ' + name() }} seguiu para a secretaria do clube.
              Enviámos-te por email o documento com a proposta e a prova da aceitação.
            </p>
            <p>Quando for aceite, recebes {{ kind() === 'member' ? 'o teu n.º de sócio' : 'o código de atleta' }} e uma ligação para entrares no site.</p>
            <a class="btn btn--primary" routerLink="/">Voltar ao início</a>
          </div>
        } @else {
          <div class="card" role="alert">
            <h2>Não foi possível confirmar</h2>
            <p>{{ error() }}</p>
            <a class="btn btn--outline" routerLink="/socios">Fazer uma proposta nova</a>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .narrow {
      max-width: 720px;
    }
    .done {
      text-align: center;
      display: grid;
      gap: 0.6rem;
      justify-items: center;
    }
  `,
})
export class ConfirmProposalPage implements OnInit {
  readonly token = input<string>();
  private readonly api = inject(SignupService);
  protected readonly state = signal<'loading' | 'ok' | 'error'>('loading');
  protected readonly kind = signal<'member' | 'athlete'>('member');
  protected readonly name = signal('');
  protected readonly already = signal(false);
  protected readonly error = signal('');

  constructor() {
    inject(SeoService).set({ title: 'Confirmar proposta', description: 'Confirmação da proposta de sócio ou de inscrição de atleta.', path: '/propostas/confirmar' });
  }

  async ngOnInit() {
    const t = this.token();
    if (typeof window === 'undefined') return;
    if (!t) {
      this.error.set('Falta o código da ligação. Abre a ligação completa que recebeste por email.');
      this.state.set('error');
      return;
    }
    try {
      const out = await this.api.confirm(t);
      this.kind.set(out.kind);
      this.name.set(out.name);
      this.already.set(out.already);
      this.state.set('ok');
    } catch (e) {
      this.error.set((e as Error).message);
      this.state.set('error');
    }
  }
}
