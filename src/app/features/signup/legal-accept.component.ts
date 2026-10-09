import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LegalDoc, paragraphs } from './signup.service';

/** Um documento a aceitar: título, texto completo (abre e fecha) e a caixa «Li e aceito». */
@Component({
  selector: 'sfc-legal-accept',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="doc" [class.doc--ok]="accepted()">
      <details>
        <summary>
          <strong>{{ doc().title }}</strong>
          <span class="caption">versão {{ doc().version }} · ler o texto completo</span>
        </summary>
        <div class="doc__body" tabindex="0" [attr.aria-label]="doc().title">
          @for (p of paras(); track $index) {
            <p>{{ p }}</p>
          }
        </div>
      </details>
      <label class="check">
        <input type="checkbox" [checked]="accepted()" (change)="accepted.set($any($event.target).checked)" [required]="required()" />
        <span>{{ label() }}@if (required()) {<span class="req"> *</span>}</span>
      </label>
    </div>
  `,
  styles: `
    .doc {
      border: 1px solid var(--color-line);
      border-radius: var(--radius-s);
      padding: 0.7rem 0.9rem;
      margin-bottom: 0.7rem;
      background: #fff;
    }
    .doc--ok {
      border-color: var(--sfc-blue);
    }
    summary {
      cursor: pointer;
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem 0.6rem;
      align-items: baseline;
    }
    .doc__body {
      max-height: 16rem;
      overflow: auto;
      margin: 0.6rem 0;
      padding: 0.6rem 0.8rem;
      background: var(--color-bg-soft, #f6f7fb);
      border-radius: var(--radius-s);
      font-size: 0.9rem;
      p {
        margin: 0 0 0.6rem;
      }
    }
    .check {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      margin-top: 0.5rem;
      input {
        width: 1.2rem;
        height: 1.2rem;
        margin-top: 0.15rem;
        flex: none;
      }
    }
  `,
})
export class LegalAcceptComponent {
  readonly doc = input.required<LegalDoc>();
  readonly label = input('Li e aceito');
  readonly required = input(true);
  readonly accepted = model(false);
  protected readonly paras = computed(() => paragraphs(this.doc().body));
}
