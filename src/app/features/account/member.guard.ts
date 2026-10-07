import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MemberAuthService } from '../../core/services/member-auth.service';

/** Áreas reservadas: sem sessão, envia para o login e guarda o destino em ?voltar=. */
export const memberGuard: CanActivateFn = (_route, state) => {
  const auth = inject(MemberAuthService);
  if (auth.isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/area-socio/entrar'], { queryParams: state.url === '/area-socio' ? {} : { voltar: state.url } });
};
