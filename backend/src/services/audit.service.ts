import { getAuditLogs } from '../repositories/audit.repository';
import { getPool } from '../config/db.config';

export async function listAuditLogsService(
  search: string,
  role: string,
  action: string,
  date: string,
  limit: number,
  offset: number,
) {
  return getAuditLogs(search, role, action, date, limit, offset);
}

export async function logAuditEvent(params: {
  userId: number;
  patientId?: number | null;
  eventType: string;
  eventDescription: string;
  details: string;
  operationStatus: 'Success' | 'Failure';
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('userId', params.userId)
    .input('patientId', params.patientId ?? null)
    .input('eventType', params.eventType)
    .input('eventDescription', params.eventDescription)
    .input('details', params.details.slice(0, 500))
    .input('operationStatus', params.operationStatus)
    .query(
      `INSERT INTO Audit_Log (user_id, patient_id, event_type, event_description, details, operation_status)
       VALUES (@userId, @patientId, @eventType, @eventDescription, @details, @operationStatus)`,
    );
}
