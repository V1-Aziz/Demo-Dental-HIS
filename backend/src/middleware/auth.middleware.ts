import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/token.util';
import { unauthorized } from '../utils/response.util';

// Augment Express' Request type so controllers can read req.user without casts.
// The auth middleware below populates this field after verifying the JWT.
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// Verifies the `Authorization: Bearer <jwt>` header and attaches the decoded
// token payload (userId, role, ...) to `req.user`. Route handlers downstream
// rely on `req.user` being present — pair this with `authorize(...)` to gate
// access by role.
export function auth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res);
    return;
  }
  const token = authHeader.slice(7); // strip the "Bearer " prefix
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    // Covers malformed tokens, bad signatures, and expired tokens — all
    // surfaced to the client as a single 401 so refresh flow can kick in.
    unauthorized(res, 'Invalid or expired token');
  }
}
