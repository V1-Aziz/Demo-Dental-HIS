// Minimal request router for demo mode. Routes are registered in the same
// order as the Express routers in backend/src/routes, and responses use the
// same JSON envelope and status codes as backend/src/utils/response.util.ts.
import { DemoDb } from './db';

export interface DemoUser {
  userId: number;
  role: string;
  employeeId?: number;
  academicId?: number;
  sessionId?: number;
}

export interface DemoRequest {
  method: string;
  path: string;                      // path after /api, e.g. /patients/3
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  user: DemoUser;                     // set for authenticated routes
  db: DemoDb;
}

export interface DemoResponse {
  status: number;
  body: unknown;
}

export type Handler = (req: DemoRequest) => DemoResponse;

// null = public route, [] = any logged-in user, otherwise the allowed roles.
export type Access = string[] | null;

export const PUBLIC: Access = null;
export const ANY_USER: Access = [];

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  access: Access;
  handler: Handler;
}

export class DemoRouter {
  private routes: Route[] = [];

  add(method: string, path: string, access: Access, handler: Handler): void {
    const keys: string[] = [];
    const pattern = path
      .replace(/\/$/, '')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:(\w+)/g, (_m, key: string) => {
        keys.push(key);
        return '([^/]+)';
      });
    this.routes.push({ method, regex: new RegExp(`^${pattern}/?$`), keys, access, handler });
  }

  get(path: string, access: Access, handler: Handler): void { this.add('GET', path, access, handler); }
  post(path: string, access: Access, handler: Handler): void { this.add('POST', path, access, handler); }
  put(path: string, access: Access, handler: Handler): void { this.add('PUT', path, access, handler); }
  patch(path: string, access: Access, handler: Handler): void { this.add('PATCH', path, access, handler); }
  delete(path: string, access: Access, handler: Handler): void { this.add('DELETE', path, access, handler); }

  handle(method: string, path: string, query: Record<string, string>, body: any,
         authHeader: string | null, db: DemoDb): DemoResponse {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(path);
      if (!m) continue;

      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

      let user: DemoUser | null = null;
      if (route.access !== null) {
        if (!authHeader?.startsWith('Bearer ')) return unauthorized();
        user = decodeToken(authHeader.slice(7));
        if (!user) return unauthorized('Invalid or expired token');
        if (route.access.length && !route.access.includes(user.role)) return forbidden();
      }

      try {
        const res = route.handler({ method, path, params, query, body, user: user!, db });
        if (res.body instanceof Blob) return res;
        // Round-trip through JSON so the app never holds references to stored rows.
        return { status: res.status, body: res.body === undefined ? null : JSON.parse(JSON.stringify(res.body)) };
      } catch (err) {
        console.error(`[demo] ${method} ${path} failed`, err);
        return serverError();
      }
    }
    console.warn(`[demo] no handler for ${method} /api${path}`);
    return { status: 404, body: { success: false, error: 'Not found' } };
  }
}

// ─── Tokens ──────────────────────────────────────────────────────────────────
// Unsigned JWT-shaped tokens: AuthService only decodes the payload to read `exp`.

export function signToken(payload: DemoUser, days = 30): string {
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 3600;
  const enc = (o: object) => btoa(JSON.stringify(o));
  return `${enc({ alg: 'none', typ: 'JWT' })}.${enc({ ...payload, exp })}.demo`;
}

export function decodeToken(token: string): DemoUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (!payload.userId || !payload.role || payload.exp * 1000 < Date.now()) return null;
    return payload as DemoUser;
  } catch {
    return null;
  }
}

// ─── Response helpers (same shapes as response.util.ts) ──────────────────────

export function ok(data: unknown, message?: string): DemoResponse {
  return { status: 200, body: { success: true, data, message } };
}

export function created(data: unknown, message?: string): DemoResponse {
  return { status: 201, body: { success: true, data, message } };
}

export function fail(status: number, error: string): DemoResponse {
  return { status, body: { success: false, error } };
}

export const badRequest = (error: string) => fail(400, error);
export const unauthorized = (error = 'Unauthorized') => fail(401, error);
export const forbidden = (error = 'Forbidden') => fail(403, error);
export const notFound = (error = 'Not found') => fail(404, error);
export const conflict = (error = 'Conflict') => fail(409, error);
export const unprocessable = (error = 'Unprocessable') => fail(422, error);
export const serverError = (error = 'Internal server error') => fail(500, error);

/** parsePagination() from pagination.util.ts */
export function pagination(query: Record<string, string>): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query['page'] ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query['limit'] ?? '20', 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}
