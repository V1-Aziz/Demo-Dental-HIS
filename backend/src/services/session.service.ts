// Service for User_Sessions lifecycle: create, validate, revoke, rotate.
import crypto from 'crypto';
import { Request } from 'express';
import { jwtConfig } from '../config/jwt.config';
import { UserSession } from '../types/user-session.type';
import * as sessionRepo from '../repositories/user-session.repository';

// Converts a duration string like "7d" or "15m" into a future Date.
function parseDurationToDate(duration: string): Date {
  const now = Date.now();
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Unparseable duration: ${duration}`);
  const value = parseInt(match[1], 10);
  const unit  = match[2];
  const ms = unit === 's' ? value * 1_000
           : unit === 'm' ? value * 60_000
           : unit === 'h' ? value * 3_600_000
           :                value * 86_400_000; // 'd'
  return new Date(now + ms);
}

export function hashRefreshToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

// Creates a new session row; returns the new session_id so the caller can
// embed it in the access-token payload.
export async function createSession(
  userId: number,
  refreshTokenPlain: string,
  req: Request,
): Promise<number> {
  const hash      = hashRefreshToken(refreshTokenPlain);
  const expiresAt = parseDurationToDate(jwtConfig.refreshExpiresIn);
  const ip        = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
                    ?? req.socket?.remoteAddress
                    ?? null;
  const ua        = (req.headers['user-agent'] ?? null) as string | null;

  return sessionRepo.createSession(userId, hash, expiresAt, ip, ua);
}

// Used by POST /auth/refresh — verifies the session is still live and updates
// last_activity_at. Throws on any invalid state so the controller can 401.
export async function validateAndTouchRefreshSession(
  refreshTokenPlain: string,
): Promise<UserSession> {
  const hash    = hashRefreshToken(refreshTokenPlain);
  const session = await sessionRepo.findActiveSessionByTokenHash(hash);
  if (!session) throw new Error('Session not found or revoked');
  await sessionRepo.touchLastActivity(session.session_id);
  return session;
}

// Rotates the refresh token in-place: swaps the hash and advances expires_at.
export async function rotateRefreshToken(
  sessionId: number,
  newRefreshTokenPlain: string,
): Promise<void> {
  const newHash      = hashRefreshToken(newRefreshTokenPlain);
  const newExpiresAt = parseDurationToDate(jwtConfig.refreshExpiresIn);
  await sessionRepo.rotateRefreshToken(sessionId, newHash, newExpiresAt);
}

// Used by POST /auth/logout. Idempotent — no error if already revoked.
export async function revokeByRefreshToken(refreshTokenPlain: string): Promise<void> {
  const hash = hashRefreshToken(refreshTokenPlain);
  await sessionRepo.revokeSessionByTokenHash(hash);
}

export { revokeAllUserSessions } from '../repositories/user-session.repository';
