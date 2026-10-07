import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

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
