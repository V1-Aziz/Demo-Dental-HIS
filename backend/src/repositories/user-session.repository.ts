// Repository for User_Sessions table — all session lifecycle SQL lives here.
import { getPool } from '../config/db.config';
import sql from 'mssql';
import { UserSession } from '../types/user-session.type';

export async function createSession(
  userId: number,
  refreshTokenHash: string,
  expiresAt: Date,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.Int, userId)
    .input('refreshTokenHash', sql.VarChar(255), refreshTokenHash)
    .input('expiresAt', sql.DateTime, expiresAt)
    .input('ipAddress', sql.VarChar(45), ipAddress)
    .input('userAgent', sql.VarChar(500), userAgent)
    .query<{ session_id: number }>(`
      INSERT INTO User_Sessions (user_id, refresh_token_hash, expires_at, ip_address, user_agent)
      OUTPUT INSERTED.session_id
      VALUES (@userId, @refreshTokenHash, @expiresAt, @ipAddress, @userAgent)
    `);
  return result.recordset[0].session_id;
}

export async function findActiveSessionByTokenHash(
  refreshTokenHash: string,
): Promise<UserSession | null> {
  const pool = await getPool();
  const result = await pool.request()
    .input('hash', sql.VarChar(255), refreshTokenHash)
    .query<UserSession>(`
      SELECT session_id, user_id, refresh_token_hash, last_activity_at,
             expires_at, ip_address, user_agent, revoked_at, created_at
      FROM User_Sessions
      WHERE refresh_token_hash = @hash
        AND revoked_at IS NULL
        AND expires_at > GETUTCDATE()
    `);
  return result.recordset[0] ?? null;
}

export async function touchLastActivity(sessionId: number): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input('sessionId', sql.Int, sessionId)
    .query(`
      UPDATE User_Sessions
      SET last_activity_at = GETUTCDATE()
      WHERE session_id = @sessionId AND revoked_at IS NULL
    `);
}

export async function revokeSession(sessionId: number): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input('sessionId', sql.Int, sessionId)
    .query(`
      UPDATE User_Sessions
      SET revoked_at = GETUTCDATE()
      WHERE session_id = @sessionId AND revoked_at IS NULL
    `);
}

export async function revokeAllUserSessions(userId: number): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input('userId', sql.Int, userId)
    .query(`
      UPDATE User_Sessions
      SET revoked_at = GETUTCDATE()
      WHERE user_id = @userId AND revoked_at IS NULL
    `);
}

export async function revokeSessionByTokenHash(refreshTokenHash: string): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input('hash', sql.VarChar(255), refreshTokenHash)
    .query(`
      UPDATE User_Sessions
      SET revoked_at = GETUTCDATE()
      WHERE refresh_token_hash = @hash AND revoked_at IS NULL
    `);
}

export async function rotateRefreshToken(
  sessionId: number,
  newHash: string,
  newExpiresAt: Date,
): Promise<void> {
  const pool = await getPool();
  await pool.request()
    .input('sessionId', sql.Int, sessionId)
    .input('newHash', sql.VarChar(255), newHash)
    .input('newExpiresAt', sql.DateTime, newExpiresAt)
    .query(`
      UPDATE User_Sessions
      SET refresh_token_hash = @newHash,
          expires_at         = @newExpiresAt,
          last_activity_at   = GETUTCDATE()
      WHERE session_id = @sessionId AND revoked_at IS NULL
    `);
}

export async function countActiveUsers(windowMinutes: number): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .input('windowMinutes', sql.Int, windowMinutes)
    .query<{ count: number }>(`
      SELECT COUNT(DISTINCT s.user_id) AS count
      FROM User_Sessions s
      INNER JOIN Users u ON u.user_id = s.user_id
      WHERE s.revoked_at IS NULL
        AND s.expires_at > GETUTCDATE()
        AND s.last_activity_at > DATEADD(MINUTE, -@windowMinutes, GETUTCDATE())
        AND u.account_status = 'Active'
    `);
  return result.recordset[0]?.count ?? 0;
}

// Removes sessions expired more than 7 days ago. Returns the number of rows deleted.
export async function deleteExpiredSessions(): Promise<number> {
  const pool = await getPool();
  const result = await pool.request()
    .query(`
      DELETE FROM User_Sessions
      WHERE expires_at < DATEADD(DAY, -7, GETUTCDATE())
    `);
  return result.rowsAffected[0] ?? 0;
}
