import { Request, Response, NextFunction } from 'express';
import { getPool } from '../config/db.config';

interface AuditOptions {
  eventType: string;
  eventDescription: string;
  includePatientId?: boolean;
  getDetails?: (req: Request) => string;
}

// Audit middleware factory. Monkey-patches `res.json` so that *after* the
// controller decides the response, we log the attempt (with Success/Failure
// derived from the final status code) and then forward the original body
// to the client. Logging happens fire-and-forget — we never block or fail
// the user's request because the audit write had a problem.
export function audit(options: AuditOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);

    // Intercepting res.json (rather than listening to `res.on('finish')`)
    // lets us capture the response body if future callers ever need it,
    // while still running before headers/body are flushed.
    res.json = function (body: unknown) {
      const operationStatus = res.statusCode >= 200 && res.statusCode < 300 ? 'Success' : 'Failure';
      const userId = req.user?.userId;
      // patientId may live in the URL (`/patients/:patientId/...`) or in the
      // POST body; prefer the route param. Only looked up if the route opts in.
      const patientId = options.includePatientId
        ? (req.params['patientId'] ?? (req.body as Record<string, unknown>)?.['patientId'] ?? null)
        : null;
      const details = options.getDetails ? options.getDetails(req) : options.eventDescription;

      // Skip logging for unauthenticated requests (login failures, etc.) —
      // Audit_Log.user_id is NOT NULL, so we don't have anyone to attribute to.
      if (userId) {
        getPool()
          .then(pool => {
            pool
              .request()
              .input('userId', userId)
              .input('patientId', patientId ?? null)
              .input('eventType', options.eventType)
              .input('eventDescription', options.eventDescription)
              // Column is VARCHAR(500); truncate to avoid truncation errors.
              .input('details', details.slice(0, 500))
              .input('operationStatus', operationStatus)
              .query(
                `INSERT INTO Audit_Log (user_id, patient_id, event_type, event_description, details, operation_status)
                 VALUES (@userId, @patientId, @eventType, @eventDescription, @details, @operationStatus)`
              )
              .catch(err => console.error('[AUDIT]', err));
          })
          .catch(err => console.error('[AUDIT POOL]', err));
      }

      return originalJson(body);
    };

    next();
  };
}
