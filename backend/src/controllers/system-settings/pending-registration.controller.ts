import { Request, Response } from 'express';
import {
  success,
  created,
  badRequest,
  notFound,
  conflict,
  forbidden,
  serverError,
} from '../../utils/response.util';
import * as svc from '../../services/system-settings/pending-registration.service';

export async function listRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query['status'] as string | undefined;
    const q      = req.query['q']      as string | undefined;
    const limit  = parseInt(req.query['limit']  as string ?? '50', 10);
    const offset = parseInt(req.query['offset'] as string ?? '0',  10);

    const result = await svc.listRegistrations({ status, q, limit, offset });
    success(res, result);
  } catch {
    serverError(res);
  }
}

export async function getRegistrationById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { badRequest(res, 'Invalid ID'); return; }

    const reg = await svc.getRegistrationById(id);
    if (!reg) { notFound(res, 'Registration not found'); return; }
    success(res, reg);
  } catch {
    serverError(res);
  }
}

export async function approveRegistration(req: Request, res: Response): Promise<void> {
  try {
    const id          = parseInt(req.params['id'], 10);
    const adminUserId = req.user!.userId;

    if (isNaN(id)) { badRequest(res, 'Invalid ID'); return; }

    await svc.approveRegistration(id, adminUserId, req.body);
    success(res, null, 'Registration approved and account activated');
  } catch (err: any) {
    if (err?.code === 'NOT_FOUND')    { notFound(res, err.message);    return; }
    if (err?.code === 'CONFLICT')     { conflict(res, err.message);    return; }
    if (err?.code === 'FORBIDDEN')    { forbidden(res, err.message);   return; }
    if (err?.code === 'EMAIL_TAKEN')  { conflict(res, err.message);    return; }
    if (err?.code === 'VALIDATION')   { badRequest(res, err.message);  return; }
    serverError(res);
  }
}

export async function rejectRegistration(req: Request, res: Response): Promise<void> {
  try {
    const id          = parseInt(req.params['id'], 10);
    const adminUserId = req.user!.userId;

    if (isNaN(id)) { badRequest(res, 'Invalid ID'); return; }

    await svc.rejectRegistration(id, adminUserId, req.body.reason);
    success(res, null, 'Registration rejected');
  } catch (err: any) {
    if (err?.code === 'NOT_FOUND') { notFound(res, err.message);  return; }
    if (err?.code === 'CONFLICT')  { conflict(res, err.message);  return; }
    serverError(res);
  }
}

export async function getPendingCount(req: Request, res: Response): Promise<void> {
  try {
    const count = await svc.getPendingCount();
    success(res, { count });
  } catch {
    serverError(res);
  }
}
