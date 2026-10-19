import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface StudentDiagnosisInput {
  recordId:             number;
  authoredByStudent:    number;   // academic_id
  reviewedBy:           number;   // supervising doctor's employee_id
  diagnosisType:        string;
  toothNumber?:         string;
  clinicalFindings:     string;
  radiographicFindings: string;
  progressNote:         string;
  appointmentId?:       number;
}

export interface DoctorDiagnosisInput {
  recordId:             number;
  authoredByDoctor:     number;   // employee_id
  diagnosisType:        string;
  toothNumber?:         string;
  clinicalFindings:     string;
  radiographicFindings: string;
  progressNote:         string;
  appointmentId?:       number;
}

// ─── Lookup helpers ──────────────────────────────────────────────────────────

export async function getStudentSupervisorId(academicId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('academicId', sql.Int, academicId)
    .query<{ employee_id: number }>(
      `SELECT employee_id FROM Student WHERE academic_id = @academicId`,
    );
  return result.recordset.length ? result.recordset[0].employee_id : null;
}

export async function getPatientRecordIdForSubmission(patientId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<{ record_id: number }>(
      `SELECT TOP 1 record_id FROM Medical_Records
       WHERE patient_id = @patientId AND deleted_at IS NULL
       ORDER BY record_id`,
    );
  return result.recordset.length ? result.recordset[0].record_id : null;
}

// ─── Student: submit diagnosis ────────────────────────────────────────────────

export async function submitStudentDiagnosis(
  data: StudentDiagnosisInput,
): Promise<{ diagnosis_id: number }> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',             sql.Int,               data.recordId)
    .input('authoredByStudent',    sql.Int,               data.authoredByStudent)
    .input('reviewedBy',           sql.Int,               data.reviewedBy)
    .input('diagnosisType',        sql.VarChar(100),      data.diagnosisType)
    .input('toothNumber',          sql.VarChar(10),       data.toothNumber ?? null)
    .input('clinicalFindings',     sql.NVarChar(sql.MAX), data.clinicalFindings)
    .input('radiographicFindings', sql.NVarChar(sql.MAX), data.radiographicFindings)
    .input('progressNote',         sql.NVarChar(sql.MAX), data.progressNote)
    .input('appointmentId',        sql.Int,               data.appointmentId ?? null)
    .query<{ diagnosis_id: number }>(
      `INSERT INTO Diagnosis
         (record_id, authored_by_student, reviewed_by, tooth_number,
          diagnosis_type, clinical_findings, radiographic_findings, progress_note,
          status, submitted_at, appointment_id)
       OUTPUT INSERTED.diagnosis_id
       VALUES (@recordId, @authoredByStudent, @reviewedBy, @toothNumber,
               @diagnosisType, @clinicalFindings, @radiographicFindings, @progressNote,
               'Submitted', GETUTCDATE(), @appointmentId)`,
    );
  return result.recordset[0];
}

// ─── Doctor: author a diagnosis (auto-approved on insert) ───────────────────

export async function submitDoctorDiagnosis(
  data: DoctorDiagnosisInput,
): Promise<{ diagnosis_id: number }> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',             sql.Int,               data.recordId)
    .input('authoredByDoctor',     sql.Int,               data.authoredByDoctor)
    .input('diagnosisType',        sql.VarChar(100),      data.diagnosisType)
    .input('toothNumber',          sql.VarChar(10),       data.toothNumber ?? null)
    .input('clinicalFindings',     sql.NVarChar(sql.MAX), data.clinicalFindings)
    .input('radiographicFindings', sql.NVarChar(sql.MAX), data.radiographicFindings)
    .input('progressNote',         sql.NVarChar(sql.MAX), data.progressNote)
    .input('appointmentId',        sql.Int,               data.appointmentId ?? null)
    .query<{ diagnosis_id: number }>(
      `INSERT INTO Diagnosis
         (record_id, authored_by_doctor, reviewed_by, tooth_number,
          diagnosis_type, clinical_findings, radiographic_findings, progress_note,
          status, submitted_at, reviewed_at, appointment_id)
       OUTPUT INSERTED.diagnosis_id
       VALUES (@recordId, @authoredByDoctor, @authoredByDoctor, @toothNumber,
               @diagnosisType, @clinicalFindings, @radiographicFindings, @progressNote,
               'Approved', GETUTCDATE(), GETUTCDATE(), @appointmentId)`,
    );
  return result.recordset[0];
}

// ─── Doctor: approve or reject ────────────────────────────────────────────────

export async function reviewDiagnosis(
  diagnosisId: number,
  status: string,
  feedback: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('diagnosisId', sql.Int,          diagnosisId)
    .input('status',      sql.VarChar(20),  status)
    .input('feedback',    sql.NVarChar(sql.MAX), feedback)
    .query(
      `UPDATE Diagnosis
       SET status = @status, doctor_feedback = @feedback
       WHERE diagnosis_id = @diagnosisId AND deleted_at IS NULL`,
    );
}

// ─── Doctor: list student submissions for review ──────────────────────────────

export async function getStudentSubmissions(
  doctorEmployeeId: number,
  limit: number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();

  const countResult = await pool
    .request()
    .input('doctorId', sql.Int, doctorEmployeeId)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM Diagnosis d
       WHERE d.authored_by_student IS NOT NULL
         AND d.reviewed_by = @doctorId
         AND d.deleted_at IS NULL`,
    );

  const rows = await pool
    .request()
    .input('doctorId', sql.Int, doctorEmployeeId)
    .input('limit',    sql.Int, limit)
    .input('offset',   sql.Int, offset)
    .query(
      `SELECT d.diagnosis_id, d.diagnosis_type, d.clinical_findings,
              d.radiographic_findings, d.progress_note,
              d.status, d.doctor_feedback,
              ISNULL(d.created_at, GETDATE()) AS created_at,
              s.first_name + ' ' + s.last_name AS student_name,
              s.academic_id AS university_id,
              p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS patient_name,
              p.file_number
       FROM Diagnosis d
       JOIN Student s          ON s.academic_id   = d.authored_by_student
       JOIN Medical_Records mr ON mr.record_id    = d.record_id
       JOIN Patients p         ON p.patient_id    = mr.patient_id
       WHERE d.authored_by_student IS NOT NULL
         AND d.reviewed_by = @doctorId
         AND d.deleted_at IS NULL
       -- Pending reviews ('Submitted') float to the top of the list so
       -- supervisors see action items first; within each bucket, newest first.
       ORDER BY
         CASE d.status WHEN 'Submitted' THEN 0 ELSE 1 END,
         d.diagnosis_id DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

// ─── Student: view own notes ──────────────────────────────────────────────────

export async function getStudentNotes(
  studentAcademicId: number,
  limit: number,
  offset: number,
  patientId?: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();
  const patientFilter = patientId ? ` AND mr.patient_id = @patientId` : '';

  const countReq = pool.request().input('studentId', sql.Int, studentAcademicId);
  const rowsReq  = pool.request()
    .input('studentId', sql.Int, studentAcademicId)
    .input('limit',     sql.Int, limit)
    .input('offset',    sql.Int, offset);

  if (patientId) {
    countReq.input('patientId', sql.Int, patientId);
    rowsReq.input('patientId',  sql.Int, patientId);
  }

  const countResult = await countReq.query<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM Diagnosis d
     JOIN Medical_Records mr ON mr.record_id = d.record_id
     WHERE d.authored_by_student = @studentId AND d.deleted_at IS NULL${patientFilter}`,
  );

  const rows = await rowsReq.query(
    `SELECT d.diagnosis_id, d.diagnosis_type, d.clinical_findings,
            d.radiographic_findings, d.progress_note,
            d.status, d.doctor_feedback,
            ISNULL(d.created_at, GETDATE()) AS created_at,
            p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS patient_name,
            p.file_number,
            ISNULL(reviewer.first_name + ' ' + reviewer.last_name, 'Pending Review') AS supervisor_name
     FROM Diagnosis d
     JOIN Medical_Records mr ON mr.record_id          = d.record_id
     JOIN Patients p         ON p.patient_id          = mr.patient_id
     LEFT JOIN Employee reviewer ON reviewer.employee_id = d.reviewed_by
     WHERE d.authored_by_student = @studentId AND d.deleted_at IS NULL${patientFilter}
     ORDER BY d.diagnosis_id DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}
