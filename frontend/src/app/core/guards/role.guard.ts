import { inject } from '@angular/core';
import { CanActivateFn, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

// Runs AFTER AuthGuard. Reads `data: { roles: [...] }` off the route config
// and allows access only if the logged-in user's role matches. On mismatch
// we bounce the user back to THEIR portal (Admin → /admin, Doctor → /doctor,
// ...) rather than /login — they're authenticated, just not authorized.
export const RoleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const allowedRoles: string[] = route.data['roles'] ?? [];
  const userRole = auth.getRole();

  if (userRole && allowedRoles.includes(userRole)) {
    return true;
  }
  return router.createUrlTree([auth.getPortalRoute()]);
};
