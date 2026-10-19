import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { badRequest, forbidden, notFound, success, serverError } from '../utils/response.util';
import {
  listUsersService, listEmployeesService, listRolesService, updateUserService,
  getUserContactsService, updateUserWithContacts, UpdateUserPayload,
} from '../services/user.service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query['search'] ?? '');
    const result = await listUsersService(search, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function listEmployees(req: Request, res: Response): Promise<void> {
  try {
    const search = String(req.query['search'] ?? '');
    const rows = await listEmployeesService(search);
    success(res, { rows });
  } catch {
    serverError(res);
  }
}

export async function listRoles(_req: Request, res: Response): Promise<void> {
  try {
    const roles = await listRolesService();
    success(res, { roles });
  } catch {
    serverError(res);
  }
}

export async function getUserContacts(req: Request, res: Response): Promise<void> {
  try {
    const userId = parseInt(req.params['id'], 10);
    if (!userId || isNaN(userId)) { badRequest(res, 'Invalid user id'); return; }

    const result = await getUserContactsService(userId);
    if (!result) { notFound(res, 'User not found'); return; }
    success(res, { contacts: result.contacts });
  } catch {
    serverError(res);
  }
}

const VALID_STATUSES  = ['Active', 'Inactive', 'Suspended'] as const;
const VALID_CONTACT_TYPES = ['Primary', 'Work', 'Secondary', 'Emergency'] as const;

export async function updateFull(req: Request, res: Response): Promise<void> {
  try {
    const userId = parseInt(req.params['id'], 10);
    if (!userId || isNaN(userId)) { badRequest(res, 'Invalid user id'); return; }

    const body = req.body as { account?: unknown; contacts?: unknown };

    // Validate account section
    if (body.account !== undefined) {
      const acct = body.account as Record<string, unknown>;
      if (acct['email'] !== undefined) {
        if (typeof acct['email'] !== 'string' || acct['email'].length > 255 || !acct['email'].includes('@')) {
          badRequest(res, 'account.email must be a valid email address'); return;
        }
      }
      if (acct['role_id'] !== undefined && typeof acct['role_id'] !== 'number') {
        badRequest(res, 'account.role_id must be a number'); return;
      }
      if (acct['account_status'] !== undefined && !VALID_STATUSES.includes(acct['account_status'] as never)) {
        badRequest(res, `account.account_status must be one of: ${VALID_STATUSES.join(', ')}`); return;
      }
    }

    // Validate contacts section
    if (body.contacts !== undefined) {
      const contacts = body.contacts as Record<string, unknown>;
      const upsert = Array.isArray(contacts['upsert']) ? contacts['upsert'] as unknown[] : [];
      const del    = Array.isArray(contacts['delete']) ? contacts['delete'] as unknown[] : [];

      for (let i = 0; i < upsert.length; i++) {
        const entry = upsert[i] as Record<string, unknown>;
        if (!entry['contact_type'] || !VALID_CONTACT_TYPES.includes(entry['contact_type'] as never)) {
          badRequest(res, `contacts.upsert[${i}].contact_type must be one of: ${VALID_CONTACT_TYPES.join(', ')}`); return;
        }
        if (!entry['email'] || typeof entry['email'] !== 'string' || !entry['email'].includes('@')) {
          badRequest(res, `contacts.upsert[${i}].email must be a valid email`); return;
        }
        if (!entry['phone_number'] || typeof entry['phone_number'] !== 'string') {
          badRequest(res, `contacts.upsert[${i}].phone_number is required`); return;
        }
        if (!isSaudiPhone(String(entry['phone_number']))) {
          badRequest(res, `contacts.upsert[${i}].phone_number is invalid (expected Saudi format, e.g. 0512 345 6789)`); return;
        }
      }

      for (let i = 0; i < del.length; i++) {
        if (typeof del[i] !== 'number' || (del[i] as number) < 1) {
          badRequest(res, `contacts.delete[${i}] must be a positive integer`); return;
        }
      }
    }

    const actingAdminId = req.user!.userId;
    const payload: UpdateUserPayload = {
      account:  body.account  as UpdateUserPayload['account'],
      contacts: body.contacts as UpdateUserPayload['contacts'],
    };

    const result = await updateUserWithContacts(userId, payload, actingAdminId);
    success(res, result, 'User updated');
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) { notFound(res,    e.message ?? 'Not found');     return; }
    if (e.status === 400) { badRequest(res,  e.message ?? 'Bad request');   return; }
    if (e.status === 403) { forbidden(res,   e.message ?? 'Forbidden');     return; }
    if (e.status === 409) { res.status(409).json({ success: false, error: e.message }); return; }
    serverError(res);
  }
}

function isSaudiPhone(phone: string): boolean {
  return (
    /^\+966 ?5\d{1} ?\d{3} ?\d{4}$/.test(phone.trim()) ||
    /^05\d{1} ?\d{3} ?\d{4}$/.test(phone.trim())
  );
}
