// Raw parameterized SQL for the Notifications table.  No business logic here —
// all orchestration lives in notification.service.ts.
import sql from 'mssql';
import { getPool } from '../config/db.config';
export interface NotificationDispatchInput {
  userId:              number;
  type:                string;
  title:               string;
  message:             string;
  linkTo?:             string | null;
  relatedEntityType?:  string | null;
  relatedEntityId?:    number | null;
}

export interface StoredNotification {
  notification_id:     number;
  user_id:             number;
  type:                string;
  title:               string;
  message:             string;
  link_to:             string | null;
  related_entity_type: string | null;
  related_entity_id:   number | null;
  is_read:             boolean;
  read_at:             string | null;
  created_at:          string;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function insertNotification(
  data: NotificationDispatchInput,
): Promise<StoredNotification> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId',             sql.Int,           data.userId)
    .input('type',               sql.NVarChar(60),  data.type)
    .input('title',              sql.NVarChar(120), data.title)
    .input('message',            sql.NVarChar(500), data.message)
    .input('linkTo',             sql.NVarChar(255), data.linkTo ?? null)
    .input('relatedEntityType',  sql.NVarChar(50),  data.relatedEntityType ?? null)
    .input('relatedEntityId',    sql.Int,           data.relatedEntityId ?? null)
    .query<StoredNotification>(
      `INSERT INTO Notifications
         (user_id, type, title, message, link_to, related_entity_type, related_entity_id)
       OUTPUT
         INSERTED.notification_id, INSERTED.user_id, INSERTED.type,
         INSERTED.title, INSERTED.message, INSERTED.link_to,
         INSERTED.related_entity_type, INSERTED.related_entity_id,
         CAST(0 AS BIT)              AS is_read,
         INSERTED.read_at,
         INSERTED.created_at
       VALUES
         (@userId, @type, @title, @message, @linkTo, @relatedEntityType, @relatedEntityId)`,
    );
  return result.recordset[0];
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function findNotificationsByUser(
  userId: number,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: StoredNotification[]; total: number }> {
  const pool    = await getPool();
  const limit   = opts.limit  ?? 20;
  const offset  = opts.offset ?? 0;
  const filter  = opts.unreadOnly ? `AND read_at IS NULL` : '';

  const countResult = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM Notifications WHERE user_id = @userId ${filter}`,
    );

  const rows = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query<StoredNotification>(
      `SELECT
         notification_id, user_id, type, title, message, link_to,
         related_entity_type, related_entity_id,
         CAST(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS is_read,
         read_at, created_at
       FROM Notifications
       WHERE user_id = @userId ${filter}
       ORDER BY created_at DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function countUnreadByUser(userId: number): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM Notifications WHERE user_id = @userId AND read_at IS NULL`,
    );
  return result.recordset[0].count;
}

// ─── Mark-read ────────────────────────────────────────────────────────────────

export async function markNotificationRead(
  notificationId: number,
  userId: number,
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id',     sql.Int, notificationId)
    .input('userId', sql.Int, userId)
    .query(
      `UPDATE Notifications
       SET read_at = GETDATE(), is_read = 1
       WHERE notification_id = @id AND user_id = @userId AND read_at IS NULL`,
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(
      `UPDATE Notifications
       SET read_at = GETDATE(), is_read = 1
       WHERE user_id = @userId AND read_at IS NULL`,
    );
}

// ─── Fan-out helpers ──────────────────────────────────────────────────────────

export async function findUserIdsByRole(roleName: string): Promise<number[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('roleName', sql.NVarChar(50), roleName)
    .query<{ user_id: number }>(
      `SELECT u.user_id
       FROM Users u
       JOIN Roles r ON r.role_id = u.role_id
       WHERE r.role_name = @roleName`,
    );
  return result.recordset.map(r => r.user_id);
}

// Resolves an Employee.employee_id → Users.user_id.
export async function getUserIdByEmployeeId(
  employeeId: number,
): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('employeeId', sql.Int, employeeId)
    .query<{ user_id: number }>(
      `SELECT user_id FROM Employee WHERE employee_id = @employeeId`,
    );
  return result.recordset.length ? result.recordset[0].user_id : null;
}

// Resolves a Student.academic_id → Users.user_id.
export async function getUserIdByAcademicId(
  academicId: number,
): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('academicId', sql.Int, academicId)
    .query<{ user_id: number }>(
      `SELECT user_id FROM Student WHERE academic_id = @academicId`,
    );
  return result.recordset.length ? result.recordset[0].user_id : null;
}

// Returns diagnosis author (student user_id) and supervisor (employee) info.
export async function getDiagnosisDispatchInfo(diagnosisId: number): Promise<{
  authored_by_student: number | null;
  reviewed_by: number;
} | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, diagnosisId)
    .query<{ authored_by_student: number | null; reviewed_by: number }>(
      `SELECT authored_by_student, reviewed_by FROM Diagnosis WHERE diagnosis_id = @id`,
    );
  return result.recordset[0] ?? null;
}

// Returns lab request requester info needed for dispatch.
export async function getLabRequestDispatchInfo(labRequestId: number): Promise<{
  employee_id: number;
  student_id: number | null;
} | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, labRequestId)
    .query<{ employee_id: number; student_id: number | null }>(
      `SELECT employee_id, student_id FROM Lab_Requests WHERE lab_request_id = @id`,
    );
  return result.recordset[0] ?? null;
}

// Returns ticket owner user_id needed for dispatch.
export async function getTicketOwnerUserId(ticketId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, ticketId)
    .query<{ user_id: number }>(
      `SELECT user_id FROM Tickets WHERE ticket_id = @id`,
    );
  return result.recordset.length ? result.recordset[0].user_id : null;
}

// Returns appointment dispatch info: assigned doctor employee_id and optional
// student academic_id.
export async function getAppointmentDispatchInfo(appointmentId: number): Promise<{
  doctor_id: number;
  academic_id: number | null;
  booked_by: number | null;
} | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, appointmentId)
    .query<{ doctor_id: number; academic_id: number | null; booked_by: number | null }>(
      `SELECT doctor_id, academic_id, booked_by FROM Appointments WHERE appointment_id = @id`,
    );
  return result.recordset[0] ?? null;
}
