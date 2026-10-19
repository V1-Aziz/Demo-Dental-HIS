// Controller for admin stats endpoints (read-only, Admin role only).
import { Request, Response } from 'express';
import { getActiveUsersStats } from '../services/stats.service';
import { success, serverError } from '../utils/response.util';

export async function getActiveUsers(req: Request, res: Response): Promise<void> {
  try {
    const stats = await getActiveUsersStats();
    success(res, stats, 'Active users retrieved');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve active users';
    serverError(res, message);
  }
}
