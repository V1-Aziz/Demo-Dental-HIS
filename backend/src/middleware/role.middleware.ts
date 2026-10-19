import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/response.util';

// RBAC middleware factory. Call with the roles allowed to hit the route:
//   router.post('/foo', auth, authorize(Role.Admin, Role.Doctor), handler)
// Must run AFTER `auth` because it reads `req.user.role`. Roles are compared
// by exact string value — always import from `enums/roles.enum.ts`
// rather than hardcoding strings.
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      forbidden(res);
      return;
    }
    next();
  };
}
