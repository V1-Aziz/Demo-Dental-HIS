// HTTP layer for the notifications endpoints. Derives user identity from
// req.user — never from the request body — to enforce per-user isolation.
import { Request, Response } from 'express';
import { success, serverError, notFound } from '../utils/response.util';
import {
  listNotificationsService,
  getUnreadCountService,
  markReadService,
  markAllReadService,
} from '../services/notification.service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const userId     = req.user!.userId;
    const limit      = Math.min(parseInt(String(req.query['limit']  ?? '20'), 10), 100);
    const offset     = parseInt(String(req.query['offset'] ?? '0'), 10);
    const unreadOnly = req.query['unread'] === 'true';
    const data       = await listNotificationsService(userId, { limit, offset, unreadOnly });
    success(res, data);
  } catch {
    serverError(res);
  }
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const count  = await getUnreadCountService(userId);
    success(res, { count });
  } catch {
    serverError(res);
  }
}

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const userId         = (req as any).user.user_id as number;
    const notificationId = parseInt(req.params['id'], 10);
    if (isNaN(notificationId)) { notFound(res); return; }
    await markReadService(notificationId, userId);
    success(res, null);
  } catch {
    serverError(res);
  }
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    await markAllReadService(userId);
    success(res, null);
  } catch {
    serverError(res);
  }
}
