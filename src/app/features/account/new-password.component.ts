import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { PasswordFieldComponent } from '../../shared/password-field.component';

const MIN = 10;

/**
 * /entrar/nova-password?token=… — definir a password com a ligação recebida por email
 * (reposição, válida 1 hora, ou convite de conta nova, válido 7 dias). Uso único.
 */

@Component({
  selector: 'sfc-new-password',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PasswordFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="login">
      <div class="login__card card">
        <img src="brand/logo.svg" alt="" width="90" height="100" class="login__logo" />
        <h1>Nova password</h1>

        @if (done(); as email) {
          <p class="alert alert--success" role="status"><sfc-icon name="check" /><span>Password definida. Já podes entrar com {{ email }}.</span></p>
          <a class="btn btn--primary btn--block" routerLink="/entrar">Entrar</a>
        } @else if (!token) {
          <p class="alert alert--warning" role="alert"><sfc-icon name="warning" /><span>Esta ligação está incompleta. Abre-a outra vez a partir do email ou pede uma nova.</span></p>
          <a class="btn btn--outline btn--block" routerLink="/entrar">Pedir nova ligação</a>
        } @else {
          <p class="muted">Escolhe uma password com pelo menos {{ min }} caracteres. Ao guardar, as sessões abertas noutros dispositivos terminam.</p>
          <form class="form" [formGroup]="form" (ngSubmit)="submit()">
            <div class="field">
              <label for="np-1">Nova password</label>
              <sfc-password-field><input id="np-1" type="password" formControlName="password" autocomplete="new-password" [attr.minlength]="min" /></sfc-password-field>
            </div>
            <div class="field">
              <label for="np-2">Repetir a password</label>
              <sfc-password-field><input id="np-2" type="password" formControlName="confirm" autocomplete="new-password" /></sfc-password-field>
            </div>
            @if (mismatch()) {
              <p class="alert alert--warning" role="alert">As passwords não coincidem.</p>
            }
            @if (error(); as e) {
              <p class="alert alert--warning" role="alert">{{ e }}</p>
            }
            <button class="btn btn--primary btn--block" type="submit" [disabled]="form.invalid || busy()">{{ busy() ? 'A guardar…' : 'Guardar password' }}</button>
          </form>
          <a class="linkish" routerLink="/entrar">← Voltar à entrada</a>
        }
      </div>
    </section>
  `,
  styleUrl: './login.component.scss',
})
export class NewPasswordComponent {
  private readonly auth = inject(AuthService);
  protected readonly min = MIN;
  /** O token só é lido uma vez e sai logo da barra de endereço (não fica no histórico nem em capturas de ecrã). */
  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  protected readonly form = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(MIN), Validators.maxLength(200)]],
    confirm: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly mismatch = signal(false);
  protected readonly done = signal<string | null>(null);

  constructor() {
    inject(SeoService).set({ title: 'Nova password', description: 'Definir a password da conta no site do Serrado FC.', path: '/entrar/nova-password' });
    if (this.token) inject(Location).replaceState('/entrar/nova-password');
  }

  async submit() {
    const { password, confirm } = this.form.getRawValue();
    this.mismatch.set(password !== confirm);
    if (this.form.invalid || this.mismatch() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.done.set((await this.auth.resetPassword(this.token, password)).email);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível guardar. Pede uma nova ligação.');
    } finally {
      this.busy.set(false);
    }
  }
}
