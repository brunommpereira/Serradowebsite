import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Sport } from '../../core/models';
import { PHONE_PATTERN } from '../../core/validators';
import { ApiClient } from '../../core/api/api-client';

/** Pedido de inscrição de atleta numa modalidade. */
@Component({
  selector: 'sfc-inscription-form',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (apiMode) {
      <div class="card online">
        <h3>Inscrição · {{ sport().name }}</h3>
        <p>Inscreve o atleta online: preenches a ficha, aceitas o regulamento e assinas no ecrã. Recebes o documento assinado por email.</p>
        <a class="btn btn--accent" routerLink="/inscricao" [queryParams]="{ modalidade: sport().slug }">Fazer a inscrição online</a>
      </div>
    } @else if (sent()) {
      <div class="alert alert--success" role="status">
        <div>
          <p><strong>Pedido enviado!</strong> Referência {{ sent() }}.</p>
          <p>A coordenação de {{ sport().name }} vai contactar-te nos próximos dias para marcar um treino de experiência.</p>
        </div>
      </div>
    } @else {
      <form class="form card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h3>Pedido de inscrição · {{ sport().name }}</h3>
        <div class="form-row">
          <div class="field">
            <label for="ins-name">Nome do atleta <span class="req">*</span></label>
            <input id="ins-name" formControlName="athlete" autocomplete="off" />
            @if (invalid('athlete')) {
              <span class="error">Indica o nome do atleta.</span>
            }
          </div>
          <div class="field">
            <label for="ins-birth">Data de nascimento <span class="req">*</span></label>
            <input id="ins-birth" type="date" formControlName="birthDate" />
            @if (invalid('birthDate')) {
              <span class="error">Indica a data de nascimento.</span>
            }
          </div>
        </div>
        <div class="field">
          <label for="ins-guardian">Encarregado de educação <span class="hint">(se menor de idade)</span></label>
          <input id="ins-guardian" formControlName="guardian" autocomplete="name" />
        </div>
        <div class="form-row">
          <div class="field">
            <label for="ins-email">Email <span class="req">*</span></label>
            <input id="ins-email" type="email" formControlName="email" autocomplete="email" />
            @if (invalid('email')) {
              <span class="error">Indica um email válido.</span>
            }
          </div>
          <div class="field">
            <label for="ins-phone">Telefone <span class="req">*</span></label>
            <input id="ins-phone" type="tel" formControlName="phone" autocomplete="tel" />
            @if (invalid('phone')) {
              <span class="error">Indica um telefone válido.</span>
            }
          </div>
        </div>
        <div class="field">
          <label for="ins-msg">Observações</label>
          <textarea id="ins-msg" formControlName="notes" rows="3"></textarea>
        </div>
        <label class="check">
          <input type="checkbox" formControlName="consent" />
          <span>Autorizo o tratamento dos dados para efeitos de inscrição, nos termos da <a routerLink="/privacidade">Política de Privacidade</a>. <span class="req">*</span></span>
        </label>
        @if (invalid('consent')) {
          <span class="field"><span class="error">É necessário o consentimento para continuar.</span></span>
        }
        <button class="btn btn--primary" type="submit">Enviar pedido</button>
      </form>
    }
  `,
})
export class InscriptionFormComponent {
  readonly sport = input.required<Sport>();
  protected readonly apiMode = inject(ApiClient).enabled;
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly sent = signal<string | null>(null);

  protected readonly form = this.fb.group({
    athlete: ['', Validators.required],
    birthDate: ['', Validators.required],
    guardian: [''],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    notes: [''],
    consent: [false, Validators.requiredTrue],
  });

  protected invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Fase 4: POST /api/sports/{slug}/registrations
    this.sent.set(`INS-${this.sport().slug.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`);
  }
}
