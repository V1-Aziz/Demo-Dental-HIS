// Thin service wrapping active-user stats for the admin dashboard.
import { ActiveUsersStats } from '../types/user-session.type';
import { countActiveUsers } from '../repositories/user-session.repository';

export async function getActiveUsersStats(): Promise<ActiveUsersStats> {
  const windowMinutes = parseInt(process.env['ACTIVE_USER_WINDOW_MINUTES'] ?? '5', 10);
  const count = await countActiveUsers(windowMinutes);
  return {
    count,
    asOf: new Date().toISOString(),
    windowMinutes,
  };
}
