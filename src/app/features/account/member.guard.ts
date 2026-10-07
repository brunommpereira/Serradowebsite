import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { StaffRole } from '../../core/models';

/**
 * Área de Sócio: exige sessão E perfil de sócio. Sem sessão (ou com uma conta
 * que não é de sócio) vai para o ponto de acesso único /entrar, que explica e
 * oferece as alternativas.
 */
export const memberGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isMember()) return true;
  return inject(Router).createUrlTree(['/entrar'], { queryParams: { perfil: 'socio', voltar: state.url } });
};

/** Área de Atletas: basta ter conta (atletas e encarregados não precisam de ser sócios). */
export const accountGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/entrar'], { queryParams: { perfil: 'atleta', voltar: state.url } });
};

/**
 * Backoffice: exige papel de staff. Com `data: { roles: [...] }` na rota,
 * exige um desses papéis (admin passa sempre).
 */
export const staffGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isStaff()) return router.createUrlTree(['/entrar'], { queryParams: { perfil: 'staff', voltar: state.url } });
  const roles = (route.data?.['roles'] ?? []) as StaffRole[];
  return !roles.length || auth.hasRole(...roles) ? true : router.createUrlTree(['/admin'], { queryParams: { semPermissao: 1 } });
};
