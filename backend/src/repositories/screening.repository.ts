// Raw parameterized SQL for the Screening table.  No business logic here —
// orchestration lives in screening.service.ts.  Legacy rows have NULL
// uploaded_by (pre-UI era) — the SELECTs tolerate that via LEFT JOINs.
import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface InsertScreeningInput {
  recordId:      number;
  imagePath:     string;          // relative path under uploads/screenings/
  imageType:     string;
  toothNumbers:  string | null;
  notes:         string | null;
  uploadedBy:    number;          // user_id
  appointmentId: number | null;   // required for radiologist uploads
}

export interface ScreeningRow {
  image_id:         number;
  record_id:        number;
  image_path:       string;
  image_type:       string;
  tooth_numbers:    string | null;
  notes:            string | null;
  uploaded_by:      number | null;
  uploaded_by_name: string;
  uploaded_by_role: string;
  uploaded_at:      string;
  deleted_at:       string | null;
  patient_id:       number;
  appointment_id:   number | null;
}

// ─── Today's appointment lookup ────────────────────────────────────────────────

export interface TodaysAppointmentRow {
  appointment_id: number;
  record_id:      number;
  doctor_id:      number;
  academic_id:    number | null;
  status:         string;
  appointment_start_time: string;
}

// Returns every appointment scheduled today for this patient that a DA
// screening upload can legally attach to — Scheduled, In Progress, or
// Completed and not soft-deleted.  Ordered by start time ascending so the
// DA picker renders them in the order they occur during the day.
export async function getAllTodaysAppointmentsForPatient(
  patientId: number,
): Promise<TodaysAppointmentRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<TodaysAppointmentRow>(
      `SELECT appointment_id, record_id, doctor_id, academic_id, status, appointment_start_time
       FROM   Appointments
       WHERE  patient_id = @patientId
         AND  deleted_at IS NULL
         AND  CAST(appointment_start_time AS DATE) = CAST(GETDATE() AS DATE)
         AND  status IN ('Scheduled', 'In Progress', 'Completed')
       ORDER BY appointment_start_time ASC`,
    );
  return result.recordset;
}

// Fetches a single appointment row only if it belongs to the given patient,
// is scheduled today, is not soft-deleted, and is in an eligible status.
// Used to validate a DA-selected appointment before attaching an upload to it.
export async function getTodaysAppointmentByIdForPatient(
  appointmentId: number,
  patientId: number,
): Promise<TodaysAppointmentRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('appointmentId', sql.Int, appointmentId)
    .input('patientId',     sql.Int, patientId)
    .query<TodaysAppointmentRow>(
      `SELECT TOP 1 appointment_id, record_id, doctor_id, academic_id, status, appointment_start_time
       FROM   Appointments
       WHERE  appointment_id = @appointmentId
         AND  patient_id     = @patientId
         AND  deleted_at IS NULL
         AND  CAST(appointment_start_time AS DATE) = CAST(GETDATE() AS DATE)
         AND  status IN ('Scheduled', 'In Progress', 'Completed')`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// Picks today's appointment for a patient that the caller can attach a
// screening to.  Rules:
//   1. Same calendar day (server time) and not soft-deleted.
//   2. Prefer an appointment that isn't yet 'Completed' (earliest start).
//   3. Fall back to the latest appointment of the day if all are 'Completed'.
// Returns null if there is no appointment for today.
export async function getTodaysAppointmentForPatient(
  patientId: number,
): Promise<TodaysAppointmentRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<TodaysAppointmentRow>(
      `;WITH TodaysAppts AS (
         SELECT appointment_id, record_id, doctor_id, academic_id, status, appointment_start_time
         FROM   Appointments
         WHERE  patient_id = @patientId
           AND  deleted_at IS NULL
           AND  CAST(appointment_start_time AS DATE) = CAST(GETDATE() AS DATE)
           AND  status IN ('Scheduled', 'In Progress', 'Completed')
       )
       SELECT TOP 1 *
       FROM   TodaysAppts
       ORDER BY
         -- 1) Non-Completed appointments win outright.
         CASE WHEN status = 'Completed' THEN 1 ELSE 0 END ASC,
         -- 2) Among non-Completed rows, pick the earliest start time.  NULLs
         --    (from Completed rows) sort first under ASC so this clause only
         --    affects the non-Completed bucket.
         CASE WHEN status <> 'Completed' THEN appointment_start_time END ASC,
         -- 3) All-Completed fallback: pick the latest start time.
         appointment_start_time DESC`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// ─── Insert ───────────────────────────────────────────────────────────────────

export async function insertScreening(data: InsertScreeningInput): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',      sql.Int,              data.recordId)
    .input('imagePath',     sql.VarChar(500),     data.imagePath)
    .input('imageType',     sql.VarChar(100),     data.imageType)
    .input('toothNumbers',  sql.VarChar(50),      data.toothNumbers)
    .input('notes',         sql.NVarChar(500),    data.notes)
    .input('uploadedBy',    sql.Int,              data.uploadedBy)
    .input('appointmentId', sql.Int,              data.appointmentId)
    .query<{ image_id: number }>(
      `INSERT INTO Screening
         (record_id, image_path, image_type, tooth_numbers, notes, uploaded_by, appointment_id, uploaded_at)
       OUTPUT INSERTED.image_id
       VALUES (@recordId, @imagePath, @imageType, @toothNumbers, @notes, @uploadedBy, @appointmentId, GETUTCDATE())`,
    );
  return result.recordset[0].image_id;
}

// ─── Reads ────────────────────────────────────────────────────────────────────

// Fetches all non-deleted screenings for a record with uploader name + role.
// Uploader display name prefers Employee (doctor / DA / ...) and falls back to
// Student.  Legacy rows with NULL uploaded_by return 'System' / 'Unknown'.
//
// OUTER APPLY with TOP 1 is used instead of plain LEFT JOIN on Employee /
// Student because duplicate seed data can create more than one Employee row
// per user_id — a regular join would fan out one Screening into N rows.
export async function findByRecordId(recordId: number): Promise<ScreeningRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId', sql.Int, recordId)
    .query<ScreeningRow>(
      `SELECT
         s.image_id, s.record_id, s.image_path, s.image_type,
         s.tooth_numbers, s.notes, s.uploaded_by, s.uploaded_at, s.deleted_at,
         s.appointment_id,
         mr.patient_id,
         ISNULL(
           RTRIM(LTRIM(COALESCE(
             e.full_name,
             st.full_name,
             'System'
           ))),
           'System'
         ) AS uploaded_by_name,
         ISNULL(r.role_name, 'Unknown') AS uploaded_by_role
       FROM     Screening s
       JOIN     Medical_Records mr ON mr.record_id = s.record_id
       LEFT JOIN Users u ON u.user_id = s.uploaded_by
       LEFT JOIN Roles r ON r.role_id = u.role_id
       OUTER APPLY (
         SELECT TOP 1 e2.first_name + ' ' + e2.last_name AS full_name
         FROM Employee e2
         WHERE e2.user_id = u.user_id AND e2.deleted_at IS NULL
         ORDER BY e2.employee_id
       ) e
       OUTER APPLY (
         SELECT TOP 1 s2.first_name + ' ' + s2.last_name AS full_name
         FROM Student s2
         WHERE s2.user_id = u.user_id
         ORDER BY s2.academic_id
       ) st
       WHERE    s.record_id  = @recordId
         AND    s.deleted_at IS NULL
       ORDER BY s.uploaded_at DESC, s.image_id DESC`,
    );
  return result.recordset;
}

// Fetches a single row by ID regardless of deletion state — the caller decides
// whether to 404 on soft-deleted rows.  Uses the same OUTER APPLY pattern as
// findByRecordId to stay 1:1 with Screening even when duplicate Employee /
// Student rows exist for the same user.
export async function findById(imageId: number): Promise<ScreeningRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('imageId', sql.Int, imageId)
    .query<ScreeningRow>(
      `SELECT
         s.image_id, s.record_id, s.image_path, s.image_type,
         s.tooth_numbers, s.notes, s.uploaded_by, s.uploaded_at, s.deleted_at,
         s.appointment_id,
         mr.patient_id,
         ISNULL(
           RTRIM(LTRIM(COALESCE(
             e.full_name,
             st.full_name,
             'System'
           ))),
           'System'
         ) AS uploaded_by_name,
         ISNULL(r.role_name, 'Unknown') AS uploaded_by_role
       FROM     Screening s
       JOIN     Medical_Records mr ON mr.record_id = s.record_id
       LEFT JOIN Users u ON u.user_id = s.uploaded_by
       LEFT JOIN Roles r ON r.role_id = u.role_id
       OUTER APPLY (
         SELECT TOP 1 e2.first_name + ' ' + e2.last_name AS full_name
         FROM Employee e2
         WHERE e2.user_id = u.user_id AND e2.deleted_at IS NULL
         ORDER BY e2.employee_id
       ) e
       OUTER APPLY (
         SELECT TOP 1 s2.first_name + ' ' + s2.last_name AS full_name
         FROM Student s2
         WHERE s2.user_id = u.user_id
         ORDER BY s2.academic_id
       ) st
       WHERE    s.image_id   = @imageId`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// ─── Soft delete ──────────────────────────────────────────────────────────────

export async function softDelete(imageId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('imageId', sql.Int, imageId)
    .query(
      `UPDATE Screening
       SET    deleted_at = GETUTCDATE()
       WHERE  image_id   = @imageId
         AND  deleted_at IS NULL`,
    );
}

// ─── Patient lookup ───────────────────────────────────────────────────────────

// Helper for notification dispatch — patient full name for the message body.
export async function getPatientDisplayName(patientId: number): Promise<string | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<{ full_name: string }>(
      `SELECT RTRIM(LTRIM(
                first_name + ' ' + ISNULL(middle_name + ' ', '') + last_name
              )) AS full_name
       FROM Patients
       WHERE patient_id = @patientId`,
    );
  return result.recordset.length ? result.recordset[0].full_name : null;
}

// Display name for a user — tries Employee first, then Student.
export async function getUserDisplayName(userId: number): Promise<string | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query<{ name: string }>(
      `SELECT TOP 1 RTRIM(LTRIM(COALESCE(
          e.first_name + ' ' + e.last_name,
          st.first_name + ' ' + st.last_name,
          'User #' + CAST(@userId AS VARCHAR(10))
       ))) AS name
       FROM Users u
       LEFT JOIN Employee e  ON e.user_id  = u.user_id
       LEFT JOIN Student  st ON st.user_id = u.user_id
       WHERE u.user_id = @userId`,
    );
  return result.recordset.length ? result.recordset[0].name : null;
}

// Display-level metadata for an appointment — time (HH:MM), doctor display
// name, and clinic name.  Used by the DA Screening tab to render the banner.
export interface AppointmentDisplayMeta {
  appointment_time: string; // HH:MM
  doctor_name:      string;
  clinic_name:      string;
}

export async function getAppointmentDisplayMeta(
  appointmentId: number,
): Promise<AppointmentDisplayMeta | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('appointmentId', sql.Int, appointmentId)
    .query<AppointmentDisplayMeta>(
      `SELECT TOP 1
         CONVERT(VARCHAR(5), a.appointment_start_time, 108)    AS appointment_time,
         'Dr. ' + e.first_name + ' ' + e.last_name             AS doctor_name,
         ISNULL(c.clinic_name, 'Unknown Clinic')               AS clinic_name
       FROM     Appointments a
       LEFT JOIN Employee e ON e.employee_id = a.doctor_id
       LEFT JOIN Clinic   c ON c.clinic_id   = a.clinic_id
       WHERE    a.appointment_id = @appointmentId`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// Returns the treating doctor (employee_id) of the most recent appointment
// tied to a medical record.  Used for post-delete notification dispatch.
export async function getTreatingDoctorEmpIdForRecord(recordId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId', sql.Int, recordId)
    .query<{ doctor_id: number | null }>(
      `SELECT TOP 1 doctor_id
       FROM Appointments
       WHERE record_id = @recordId AND deleted_at IS NULL
       ORDER BY appointment_start_time DESC`,
    );
  return result.recordset[0]?.doctor_id ?? null;
}
