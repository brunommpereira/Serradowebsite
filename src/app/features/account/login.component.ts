import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AthleteAreaService } from '../../core/services/athlete-area.service';
import { SeoService } from '../../core/services/seo.service';
import { IconComponent } from '../../shared/icon.component';

export type Profile = 'socio' | 'atleta';

const AREA: Record<Profile, string> = { socio: '/area-socio', atleta: '/area-atletas' };

/**
 * Ponto de acesso único à área reservada (/entrar).
 * A pessoa escolhe se entra como sócio ou como atleta/encarregado; com sessão
 * iniciada, a página passa a ser o «hub» das áreas a que a conta tem acesso.
 */
@Component({
  selector: 'sfc-login',
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
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
  protected readonly profile = signal<Profile>(
    this.params.get('perfil') === 'atleta' || (!this.params.get('perfil') && this.voltar?.startsWith('/area-atletas')) ? 'atleta' : 'socio',
  );
  protected readonly mode = signal<'login' | 'reset'>('login');
  protected readonly error = signal(false);
  protected readonly resetSent = signal(false);
  protected readonly demos = AuthService.DEMO;

  /** Quantos atletas a conta acompanha (educandos e/ou o próprio). */
  protected readonly athleteCount = computed(() => this.area.athletes().length);
  protected readonly athleteRole = this.area.role;
  /** Pediu a Área de Sócio com uma conta que não é de sócio */
  protected readonly notMember = computed(() => this.auth.isLoggedIn() && !this.auth.isMember() && this.profile() === 'socio');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor() {
    inject(SeoService).set({ title: 'Entrar', description: 'Entra na área reservada do Serrado FC: Área de Sócio e Área de Atletas.', path: '/entrar' });
    // Veio de uma página protegida e já tem acesso: segue diretamente
    if (this.voltar && this.canOpen(this.profile())) this.router.navigateByUrl(this.voltar);
  }

  setProfile(p: Profile) {
    this.profile.set(p);
    this.error.set(false);
  }

  useDemo(login: string, password: string, isMember: boolean) {
    this.form.setValue({ identifier: login, password });
    if (!isMember) this.profile.set('atleta');
  }

  submit() {
    const { identifier, password } = this.form.getRawValue();
    if (!this.auth.login(identifier, password)) {
      this.error.set(true);
      return;
    }
    this.error.set(false);
    // Conta sem perfil de sócio a tentar entrar como sócio: fica no hub com a explicação
    if (this.canOpen(this.profile())) this.open(this.profile());
  }

  open(p: Profile) {
    const target = this.voltar && this.voltar.startsWith(AREA[p]) ? this.voltar : AREA[p];
    this.router.navigateByUrl(target);
  }

  logout() {
    this.auth.logout();
    this.form.reset();
  }

  private canOpen(p: Profile) {
    return p === 'socio' ? this.auth.isMember() : this.auth.isLoggedIn();
  }
}

function safePath(url: string | null) {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : null;
}
