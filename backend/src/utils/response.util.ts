import { Response } from 'express';

// Single source of truth for the JSON envelope returned by every API endpoint.
// Keeping the shape consistent means the Angular client only needs one error
// handler and can always trust `res.success` + `res.data` / `res.error`.
// ALL controllers must respond via the helpers below — not `res.json` directly.
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export function success<T>(res: Response, data: T, message?: string, statusCode = 200): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T, message?: string): Response {
  return success(res, data, message, 201);
}

export function badRequest(res: Response, error: string): Response {
  return res.status(400).json({ success: false, error });
}

export function unauthorized(res: Response, error = 'Unauthorized'): Response {
  return res.status(401).json({ success: false, error });
}

export function forbidden(res: Response, error = 'Forbidden'): Response {
  return res.status(403).json({ success: false, error });
}

export function notFound(res: Response, error = 'Not found'): Response {
  return res.status(404).json({ success: false, error });
}

export function conflict(res: Response, error = 'Conflict'): Response {
  return res.status(409).json({ success: false, error });
}

export function unprocessable(res: Response, error = 'Unprocessable'): Response {
  return res.status(422).json({ success: false, error });
}

export function serverError(res: Response, error = 'Internal server error'): Response {
  return res.status(500).json({ success: false, error });
}
