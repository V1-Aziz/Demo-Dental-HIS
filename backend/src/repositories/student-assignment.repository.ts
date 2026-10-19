// No SQL in the service or controller — all data access lives here.
// No req/res here — HTTP concerns stay in student-assignment.controller.ts.
import sql from 'mssql';
import { getPool } from '../config/db.config';

// TODO: move to environment config if duration needs to be configurable per institution
const WRITE_ACCESS_DURATION_MS = 24 * 60 * 60 * 1000;

export interface AssignmentRow {
  assignment_id:           number;
  student_id:              number;
  patient_id:              number;
  assigned_at:             Date;
  write_access_expires_at: Date;
  access_type:             'write' | 'read';
  is_expired:              boolean;
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

export async function findAssignment(
  studentUserId: number,
  patientId:     number,
): Promise<AssignmentRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('studentId', sql.Int, studentUserId)
    .input('patientId', sql.Int, patientId)
    .query<AssignmentRow>(
      `SELECT assignment_id, student_id, patient_id, assigned_at,
              write_access_expires_at, access_type,
              CAST(is_expired AS BIT) AS is_expired
         FROM Student_Assignments
        WHERE student_id = @studentId
          AND patient_id = @patientId`,
    );
  return result.recordset[0] ?? null;
}

export async function getStudentAssignments(
  studentUserId: number,
): Promise<unknown[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('studentId', sql.Int, studentUserId)
    .query(
      `SELECT sa.assignment_id,
              sa.patient_id,
              sa.assigned_at,
              sa.write_access_expires_at,
              sa.access_type,
              CAST(sa.is_expired AS BIT) AS is_expired,
              p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name AS patient_name,
              p.file_number AS patient_file_no
         FROM Student_Assignments sa
         JOIN Patients p ON p.patient_id = sa.patient_id
        WHERE sa.student_id = @studentId
        ORDER BY sa.assigned_at DESC`,
    );
  return result.recordset;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAssignment(
  studentUserId: number,
  patientId:     number,
): Promise<AssignmentRow> {
  const pool      = await getPool();
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + WRITE_ACCESS_DURATION_MS);

  const result = await pool
    .request()
    .input('studentId', sql.Int,      studentUserId)
    .input('patientId', sql.Int,      patientId)
    .input('assignedAt', sql.DateTime, now)
    .input('expiresAt',  sql.DateTime, expiresAt)
    .query<AssignmentRow>(
      `INSERT INTO Student_Assignments
         (student_id, patient_id, assigned_at, write_access_expires_at, access_type, is_expired)
       OUTPUT
         INSERTED.assignment_id,
         INSERTED.student_id,
         INSERTED.patient_id,
         INSERTED.assigned_at,
         INSERTED.write_access_expires_at,
         INSERTED.access_type,
         CAST(INSERTED.is_expired AS BIT) AS is_expired
       VALUES (@studentId, @patientId, @assignedAt, @expiresAt, 'write', 0)`,
    );
  return result.recordset[0];
}

export async function expireAssignment(assignmentId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('assignmentId', sql.Int, assignmentId)
    .query(
      `UPDATE Student_Assignments
          SET access_type = 'read',
              is_expired  = 1
        WHERE assignment_id = @assignmentId`,
    );
}
