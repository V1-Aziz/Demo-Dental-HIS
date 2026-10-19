import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, serverError } from '../utils/response.util';
import { listAuditLogsService } from '../services/audit.service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query['search'] ?? '');
    const role = String(req.query['role'] ?? '');
    const action = String(req.query['action'] ?? '');
    const date = String(req.query['date'] ?? '');
    const result = await listAuditLogsService(search, role, action, date, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}
