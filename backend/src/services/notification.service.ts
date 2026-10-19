// Business logic for the notifications system. Any service can call dispatch()
// or dispatchToRole() after a successful DB write to notify relevant users.
// Dispatch failures are NEVER re-thrown — they must not break the caller.
import {
  NotificationDispatchInput,
  insertNotification,
  findNotificationsByUser,
  countUnreadByUser,
  markNotificationRead,
  markAllNotificationsRead,
  findUserIdsByRole,
  StoredNotification,
} from '../repositories/notification.repository';

const TITLE_MAX   = 120;
const MESSAGE_MAX = 500;

function trim(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ─── Public dispatch API ──────────────────────────────────────────────────────

export async function dispatch(input: NotificationDispatchInput): Promise<void> {
  await insertNotification({
    ...input,
    title:   trim(input.title,   TITLE_MAX),
    message: trim(input.message, MESSAGE_MAX),
  });
}

export async function dispatchToRole(
  roleName: string,
  input: Omit<NotificationDispatchInput, 'userId'>,
): Promise<void> {
  const userIds = await findUserIdsByRole(roleName);
  await Promise.all(userIds.map(userId => dispatch({ ...input, userId })));
}

export async function dispatchToUsers(
  userIds: number[],
  input: Omit<NotificationDispatchInput, 'userId'>,
): Promise<void> {
  await Promise.all(userIds.map(userId => dispatch({ ...input, userId })));
}

// ─── Query API ────────────────────────────────────────────────────────────────

export async function listNotificationsService(
  userId: number,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: StoredNotification[]; total: number }> {
  return findNotificationsByUser(userId, opts);
}

export async function getUnreadCountService(userId: number): Promise<number> {
  return countUnreadByUser(userId);
}

export async function markReadService(
  notificationId: number,
  userId: number,
): Promise<boolean> {
  return markNotificationRead(notificationId, userId);
}

export async function markAllReadService(userId: number): Promise<void> {
  return markAllNotificationsRead(userId);
}
