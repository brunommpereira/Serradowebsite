import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MemberAuthService } from '../../core/services/member-auth.service';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'sfc-login',
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="login">
      <div class="login__card card">
        <img src="brand/logo.svg" alt="" width="90" height="100" class="login__logo" />
        <h1>Área de Sócio</h1>

        @if (mode() === 'login') {
          <form class="form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="field">
              <label for="l-num">N.º de Sócio</label>
              <input id="l-num" formControlName="memberNumber" inputmode="numeric" autocomplete="username" />
            </div>
            <div class="field">
              <label for="l-pass">Password</label>
              <input id="l-pass" type="password" formControlName="password" autocomplete="current-password" />
            </div>
            @if (error()) {
              <p class="alert alert--warning" role="alert">N.º de sócio ou password incorretos.</p>
            }
            <button class="btn btn--primary btn--block" type="submit" [disabled]="form.invalid">Entrar</button>
            <button class="linkish" type="button" (click)="mode.set('reset')">Esqueci-me da password</button>
          </form>
          <div class="alert alert--info demo">
            <sfc-icon name="info" />
            <p>
              <strong>Demonstração</strong> · N.º <code>{{ demoNumber }}</code> · Password <code>{{ demoPassword }}</code>
              <button class="linkish" type="button" (click)="fillDemo()">Preencher</button>
            </p>
          </div>
        } @else {
          @if (resetSent()) {
            <p class="alert alert--success" role="status">Se o n.º/email existir, vais receber um email com instruções para definir uma nova password.</p>
          } @else {
            <form class="form" (ngSubmit)="resetSent.set(true)">
              <p class="muted">Indica o teu n.º de sócio ou email. Enviamos-te uma ligação para definires uma nova password.</p>
              <div class="field">
                <label for="l-reset">N.º de Sócio ou email</label>
                <input id="l-reset" name="reset" required autocomplete="username" />
              </div>
              <button class="btn btn--primary btn--block" type="submit">Enviar instruções</button>
            </form>
          }
          <button class="linkish" type="button" (click)="mode.set('login'); resetSent.set(false)">← Voltar à entrada</button>
        }

        <p class="login__foot">Ainda não és sócio? <a routerLink="/socios/registo">Regista-te</a></p>
      </div>
    </section>
  `,
  styles: `
    .login {
      min-height: 70vh;
      display: grid;
      place-items: center;
      padding: 3rem 16px;
      background: radial-gradient(800px 400px at 50% 0, var(--sfc-blue-50), transparent 70%);
    }
    .login__card { width: min(440px, 100%); box-shadow: var(--shadow); padding: 2rem; text-align: center; }
    .login__logo { margin: 0 auto 0.5rem; }
    h1 { font-size: 2.2rem; }
    .form { text-align: left; }
    .linkish { background: none; border: 0; color: var(--color-link); font-weight: 600; cursor: pointer; padding: 0.3rem 0; text-decoration: underline; }
    .demo { margin-top: 1.4rem; text-align: left; code { background: #fff; padding: 0.1em 0.4em; border-radius: 4px; } }
    .login__foot { margin: 1.4rem 0 0; font-size: 0.92rem; }
  `,
})
export class LoginComponent {
  private readonly auth = inject(MemberAuthService);
  private readonly router = inject(Router);
  protected readonly demoNumber = MemberAuthService.DEMO_NUMBER;
  protected readonly demoPassword = MemberAuthService.DEMO_PASSWORD;
  protected readonly mode = signal<'login' | 'reset'>('login');
  protected readonly error = signal(false);
  protected readonly resetSent = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    memberNumber: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor() {
    inject(SeoService).set({ title: 'Área de Sócio — Entrar', description: 'Entra na Área de Sócio do Serrado FC.', path: '/area-socio/entrar' });
    if (this.auth.isLoggedIn()) this.router.navigateByUrl('/area-socio');
  }

  fillDemo() {
    this.form.setValue({ memberNumber: this.demoNumber, password: this.demoPassword });
  }

  submit() {
    const { memberNumber, password } = this.form.getRawValue();
    if (this.auth.login(memberNumber, password)) {
      this.router.navigateByUrl('/area-socio');
    } else {
      this.error.set(true);
    }
  }
}
