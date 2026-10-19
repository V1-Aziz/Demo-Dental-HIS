import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// Router guard: any route with `canActivate: [AuthGuard]` is only reachable
// when a valid (non-expired) JWT exists. Returning a UrlTree instead of
// `false` performs the redirect in one step — it replaces history so the
// protected URL isn't left behind in the back stack.
export const AuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
