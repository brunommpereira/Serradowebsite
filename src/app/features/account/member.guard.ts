import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MemberAuthService } from '../../core/services/member-auth.service';

export const memberGuard: CanActivateFn = () => {
  const auth = inject(MemberAuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/area-socio/entrar']);
};
