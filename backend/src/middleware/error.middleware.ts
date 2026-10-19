import { Request, Response, NextFunction } from 'express';
import { serverError } from '../utils/response.util';

// Global Express error handler. Registered LAST in server.ts so any `throw`
// or `next(err)` inside a controller/service/middleware bubbles here and
// becomes a consistent 500 response shape. The 4-arg signature is how Express
// detects error-handling middleware — do not collapse the unused args.
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[ERROR]', err.message, err.stack);
  serverError(res, err.message ?? 'Internal server error');
}
