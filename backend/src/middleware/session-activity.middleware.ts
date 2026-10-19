// Updates last_activity_at for the current session, debounced to 1 write/min/session.
// Runs after auth.middleware on every authenticated route. Never blocks the request.
import { Request, Response, NextFunction } from 'express';
import { touchLastActivity } from '../repositories/user-session.repository';

// In-memory debounce: sessionId → last DB write timestamp (ms).
// Reset on server restart — acceptable; triggers one extra write per session on restart.
const lastTouchMap = new Map<number, number>();
const DEBOUNCE_MS  = 60_000; // 1 minute

export function sessionActivityMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const sessionId = req.user?.sessionId;
  if (sessionId != null) {
    const now  = Date.now();
    const last = lastTouchMap.get(sessionId) ?? 0;
    if (now - last > DEBOUNCE_MS) {
      lastTouchMap.set(sessionId, now);
      // Fire-and-forget — a DB hiccup must never break the user's request.
      touchLastActivity(sessionId).catch(err =>
        console.warn('[session-activity] touch failed:', err),
      );
    }
  }
  next();
}
