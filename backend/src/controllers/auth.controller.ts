import { Request, Response } from 'express';
import { loginService, refreshService, logoutService } from '../services/auth.service';
import { submitRegistration, getRegisterableRoles } from '../services/system-settings/pending-registration.service';
import { logAuditEvent } from '../services/audit.service';
import { success, created, badRequest, conflict, unauthorized, serverError } from '../utils/response.util';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const result = await loginService(req.body, req);
    logAuditEvent({
      userId: result.user.id,
      eventType: 'Login',
      eventDescription: 'User logged in',
      details: `${result.user.name} (${result.user.role}) logged in successfully`,
      operationStatus: 'Success',
    }).catch(err => console.error('[AUDIT]', err));
    success(res, result, 'Login successful');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    if (message === 'Invalid credentials' || message === 'Account is not active') {
      unauthorized(res, message);
    } else {
      serverError(res, message);
    }
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const result = await refreshService(req.body.refreshToken);
    success(res, result, 'Token refreshed');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh failed';
    unauthorized(res, message);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await logoutService(refreshToken);
    }
    success(res, null, 'Logged out');
  } catch (err) {
    // Logout is best-effort — always return success to the client so the
    // frontend can clear its tokens regardless of server state.
    success(res, null, 'Logged out');
  }
}

export async function heartbeat(_req: Request, res: Response): Promise<void> {
  // The real work happens in sessionActivityMiddleware before this handler runs.
  success(res, null, 'OK');
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const result = await submitRegistration(req.body);
    created(res, result, 'Registration submitted. Your account is awaiting admin approval.');
  } catch (err: any) {
    if (err?.code === 'ROLE_NOT_FOUND')  { badRequest(res, err.message);  return; }
    if (err?.code === 'ADMIN_FORBIDDEN') { badRequest(res, err.message);  return; }
    if (err?.code === 'EMAIL_TAKEN')     { conflict(res,   err.message);  return; }
    if (err?.code === 'EMAIL_PENDING')   { conflict(res,   err.message);  return; }
    serverError(res);
  }
}

export async function registerableRoles(_req: Request, res: Response): Promise<void> {
  try {
    const roles = await getRegisterableRoles();
    success(res, roles);
  } catch {
    serverError(res);
  }
}
