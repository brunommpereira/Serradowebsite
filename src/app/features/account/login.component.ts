import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, LinkedIdentity, LoginProvider } from '../../core/services/auth.service';
import { AthleteAreaService } from '../../core/services/athlete-area.service';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';
import { OfflineNoticeComponent } from '../../shared/offline-notice.component';
import { ApiClient } from '../../core/api/api-client';
import { roleName } from '../../core/permissions';
import { PasswordFieldComponent } from '../../shared/password-field.component';

export type Profile = 'socio' | 'atleta' | 'staff';

const AREA: Record<Profile, string> = { socio: '/area-socio', atleta: '/area-atletas', staff: '/admin' };

/** Resultado da entrada com Google/Microsoft (?erro= posto pelo middleware) */
const OAUTH_ERRORS: Record<string, string> = {
  'sem-conta': 'Não encontrámos nenhuma conta do clube com esse email. Entra com o email e a password que a secretaria te deu, ou fala connosco.',
  'outra-conta': 'A tua conta do clube já está ligada a outra conta deste fornecedor. Entra com essa conta ou com a password.',
  cancelado: 'A entrada foi cancelada.',
  expirou: 'A entrada demorou demasiado tempo. Tenta outra vez.',
  indisponivel: 'Este serviço de entrada não está disponível de momento. Usa o email e a password.',
  falhou: 'Não foi possível confirmar a entrada. Tenta outra vez.',
};

/**
 * Ponto de acesso único à área reservada (/entrar).
 * A pessoa escolhe se entra como sócio ou como atleta/encarregado; com sessão
 * iniciada, a página passa a ser o «hub» das áreas a que a conta tem acesso.
 */

@Component({
  selector: 'sfc-login',
  imports: [ReactiveFormsModule, RouterLink, IconComponent, PasswordFieldComponent, OfflineNoticeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly area = inject(AthleteAreaService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.queryParamMap;

  /** ?voltar= — destino depois de entrar (só caminhos internos) */
  private readonly voltar = safePath(this.params.get('voltar'));
  protected readonly profile = signal<Profile>(initialProfile(this.params.get('perfil'), this.voltar));
  protected readonly mode = signal<'login' | 'reset'>('login');
  protected readonly error = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly demos = computed(() => AuthService.DEMO.filter((d) => (this.profile() === 'staff') === d.roles.length > 0));
  protected readonly busy = signal(false);
  /** Ligado ao servidor: sem contas de demonstração nem funcionalidades que ainda não gravam */
  protected readonly apiMode = inject(ApiClient).enabled;
  /** Entrar com Google / Microsoft (só quando o servidor os tem configurados) */
  protected readonly providers = signal<LoginProvider[]>([]);
  /** O servidor envia emails: «Esqueci-me da password» envia a ligação; senão, pede para contactar a secretaria */
  protected readonly passwordReset = signal(false);
  protected readonly resetForm = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly resetError = signal<string | null>(null);
  protected readonly identities = signal<LinkedIdentity[]>([]);
  protected readonly oauthError = computed(() => {
    const code = this.params.get('erro');
    return code ? (OAUTH_ERRORS[code] ?? OAUTH_ERRORS['falhou']) : null;
  });

  protected names(roles: string[]) {
    return roles.map((r) => roleName(r)).join(', ');
  }

  /** Quantos atletas a conta acompanha (educandos e/ou o próprio). */
  protected readonly athleteCount = computed(() => this.area.athletes().length);
  protected readonly athleteRole = this.area.role;
  /** Pediu a Área de Sócio com uma conta que não é de sócio */
  protected readonly notMember = computed(() => this.auth.isLoggedIn() && !this.auth.isMember() && this.profile() === 'socio');
  /** Pediu o backoffice com uma conta sem papel de staff */
  protected readonly notStaff = computed(() => this.auth.isLoggedIn() && !this.auth.isStaff() && this.profile() === 'staff');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor() {
    inject(SeoService).set({ title: 'Entrar', description: 'Entra na área reservada do Serrado FC: Área de Sócio e Área de Atletas.', path: '/entrar' });
    // Veio de uma página protegida e já tem acesso: segue diretamente
    if (this.voltar && this.canOpen(this.profile())) this.router.navigateByUrl(this.voltar);
    this.auth.loadOptions().then((o) => {
      this.providers.set(o.providers);
      this.passwordReset.set(o.passwordReset);
    });
    this.refreshIdentities();
  }

  /** Entrar com um fornecedor: volta diretamente à área escolhida (ou à página pedida). */
  providerHref(p: LoginProvider) {
    return this.auth.providerUrl(p.id, this.voltar ?? AREA[this.profile()]);
  }

  providerName(id: string) {
    return this.providers().find((p) => p.id === id)?.name ?? id;
  }

  async unlink(provider: string) {
    await this.auth.unlinkIdentity(provider).catch(() => undefined);
    this.refreshIdentities();
  }

  private refreshIdentities() {
    this.auth.loadIdentities().then((list) => this.identities.set(list));
  }

  async sendReset() {
    if (this.resetForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.resetError.set(null);
    try {
      await this.auth.forgotPassword(this.resetForm.getRawValue().email);
      this.resetSent.set(true);
    } catch (e) {
      this.resetError.set(e instanceof Error ? e.message : 'Não foi possível enviar. Tenta mais tarde.');
    } finally {
      this.busy.set(false);
    }
  }

  setProfile(p: Profile) {
    this.profile.set(p);
    this.error.set(false);
  }

  useDemo(login: string, password: string, isMember: boolean) {
    this.form.setValue({ identifier: login, password });
    if (!isMember && this.profile() === 'socio') this.profile.set('atleta');
  }

  async submit() {
    const { identifier, password } = this.form.getRawValue();
    this.busy.set(true);
    const ok = await this.auth.login(identifier, password);
    this.busy.set(false);
    if (!ok) {
      this.error.set(true);
      return;
    }
    this.error.set(false);
    this.refreshIdentities();
    // Conta sem perfil de sócio a tentar entrar como sócio: fica no hub com a explicação
    if (this.canOpen(this.profile())) this.open(this.profile());
  }

  open(p: Profile) {
    const target = this.voltar && this.voltar.startsWith(AREA[p]) ? this.voltar : AREA[p];
    this.router.navigateByUrl(target);
  }

  logout() {
    this.auth.logout();
    this.identities.set([]);
    this.form.reset();
  }

  private canOpen(p: Profile) {
    return p === 'socio' ? this.auth.isMember() : p === 'staff' ? this.auth.isStaff() : this.auth.isLoggedIn();
  }
}

function initialProfile(param: string | null, voltar: string | null): Profile {
  if (param === 'atleta' || param === 'staff' || param === 'socio') return param;
  if (voltar?.startsWith('/area-atletas')) return 'atleta';
  if (voltar?.startsWith('/admin')) return 'staff';
  return 'socio';
}

function safePath(url: string | null) {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}
