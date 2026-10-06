import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'sfc-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nf container">
      <img src="brand/logo.svg" alt="" width="140" height="156" />
      <p class="eyebrow">Erro 404</p>
      <h1>Bola fora!</h1>
      <p class="muted">A página que procuras não existe ou foi movida.</p>
      <div class="nf__actions">
        <a class="btn btn--primary" routerLink="/">Voltar ao início</a>
        <a class="btn btn--outline" routerLink="/pesquisa">Pesquisar</a>
      </div>
    </section>
  `,
  styles: `
    .nf { min-height: 60vh; display: grid; justify-items: center; align-content: center; text-align: center; padding: 4rem 0; gap: 0.4rem; }
    h1 { font-size: var(--fs-xl); margin: 0; }
    .nf__actions { display: flex; gap: 0.8rem; flex-wrap: wrap; justify-content: center; margin-top: 1rem; }
  `,
})
export class NotFoundComponent {}
