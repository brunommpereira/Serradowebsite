import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { HeaderComponent } from './layout/header/header.component';
import { FooterComponent } from './layout/footer/footer.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    @if (backoffice()) {
      <!-- O backoffice tem o seu próprio layout (barra lateral) -->
      <router-outlet />
    } @else {
      <a class="skip-link" href="#conteudo">Saltar para o conteúdo</a>
      <sfc-header />
      <main id="conteudo" tabindex="-1">
        <router-outlet />
      </main>
      <sfc-footer />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    main {
      flex: 1;
      outline: none;
    }
  `,
})
export class App {
  private readonly router = inject(Router);
  protected readonly backoffice = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.startsWith('/admin')),
    ),
    { initialValue: false },
  );
}
