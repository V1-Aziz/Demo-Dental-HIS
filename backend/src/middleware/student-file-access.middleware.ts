import { Request, Response, NextFunction } from 'express';
import { forbidden } from '../utils/response.util';
import {
  findAssignment,
  expireAssignment,
} from '../repositories/student-assignment.repository';

export interface FileAccessInfo {
  accessType:            'write' | 'read';
  isAssigned:            boolean;
  isExpired:             boolean;
  hoursRemaining:        number;
  writeAccessExpiresAt?: Date;
  expiredAt?:            Date;
}

// Augment Express Request so downstream handlers can read access info without casts.
declare global {
  namespace Express {
    interface Request {
      fileAccess?: FileAccessInfo;
    }
  }
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Middleware factory — checks the student's write window for a specific patient file.
// Resolves patientId from req.params first, falls back to req.body.
// Sets req.fileAccess so route handlers can inspect access details if needed.
// Blocks WRITE_METHODS for read-only access with a descriptive 403; allows GET through.
export function checkStudentFileAccess() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId    = req.user?.userId;
      const rawId     = req.params['patientId'] ?? req.body?.patientId;
      const patientId = parseInt(rawId, 10);

      // Missing context — let downstream validation handle it
      if (!userId || isNaN(patientId) || patientId <= 0) {
        next();
        return;
      }

      const assignment = await findAssignment(userId, patientId);

      // ── Case 1: No assignment — global read-only ──────────────────────────
      if (!assignment) {
        req.fileAccess = {
          accessType:     'read',
          isAssigned:     false,
          isExpired:      false,
          hoursRemaining: 0,
        };
        if (WRITE_METHODS.has(req.method)) {
          forbidden(res, 'Read-only access. You are not assigned to this patient file.');
          return;
        }
        next();
        return;
      }

      const now       = Date.now();
      const expiresAt = new Date(assignment.write_access_expires_at).getTime();

      // ── Case 2: Assignment exists but window has closed ───────────────────
      if (now > expiresAt) {
        if (!assignment.is_expired) {
          await expireAssignment(assignment.assignment_id);
        }
        req.fileAccess = {
          accessType:     'read',
          isAssigned:     true,
          isExpired:      true,
          hoursRemaining: 0,
          expiredAt:      new Date(assignment.write_access_expires_at),
        };
        if (WRITE_METHODS.has(req.method)) {
          forbidden(
            res,
            'Write access expired. Your 24-hour window has ended. This file is now read-only.',
          );
          return;
        }
        next();
        return;
      }

      // ── Case 3: Active write window ───────────────────────────────────────
      const hoursRemaining = Math.round(((expiresAt - now) / 3_600_000) * 10) / 10;
      req.fileAccess = {
        accessType:           'write',
        isAssigned:           true,
        isExpired:            false,
        hoursRemaining,
        writeAccessExpiresAt: new Date(assignment.write_access_expires_at),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
