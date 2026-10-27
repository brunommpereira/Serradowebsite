import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from './layout/footer.component';
import { HeaderComponent } from './layout/header.component';

@Component({
  selector: 'ar-root',
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip" href="#conteudo">Saltar para o conteúdo</a>
    <ar-header />
    <main id="conteudo" tabindex="-1"><router-outlet /></main>
    <ar-footer />
  `,
  styles: `
    .skip {
      position: absolute;
      left: 1rem;
      top: -100px;
      z-index: 100;
      padding: 0.7rem 1rem;
      border-radius: var(--radius-s);
      background: var(--color-primary);
      color: #fff;
    }
    .skip:focus {
      top: 1rem;
    }
    main:focus {
      outline: none;
    }
  `,
})
export class App {}
