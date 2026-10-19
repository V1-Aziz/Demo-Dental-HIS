// Raw parameterized SQL for the academic review workflow.
// All business logic lives in academic.service.ts — only data access here.
import sql from 'mssql';
import { getPool } from '../config/db.config';
import { ReviewStatus, SubmissionType, ReviewHistoryAction } from '../enums/academic.enum';
import {
  ReviewQueueItem,
  ReviewQueueStats,
  ReviewSubmissionDetail,
  ReviewHistoryEntry,
  ResubmitRequest,
} from '../types/academic.types';

// ─── Queue ────────────────────────────────────────────────────────────────────

export async function getReviewQueue(
  doctorEmployeeId: number,
  statuses: ReviewStatus[],
  todayOnly = false,
): Promise<ReviewQueueItem[]> {
  const pool = await getPool();
  const req  = pool.request().input('doctorId', sql.Int, doctorEmployeeId);

  const statusParams = statuses
    .map((s, i) => {
      req.input(`status${i}`, sql.VarChar(20), s);
      return `@status${i}`;
    })
    .join(', ');

  const outerDateClause = todayOnly ? `WHERE CAST(reviewed_at AS DATE) = CAST(GETUTCDATE() AS DATE)` : '';

  const result = await req.query<ReviewQueueItem>(`
    SELECT
      submission_id, submission_type, student_id, student_name, student_level,
      patient_id, patient_name, patient_file_no, has_medical_alert,
      procedure_label, status, submitted_at, revision_count, is_stale, reviewed_at
    FROM (
      SELECT
        d.diagnosis_id                                        AS submission_id,
        'Diagnosis'                                           AS submission_type,
        s.academic_id                                         AS student_id,
        s.first_name + ' ' + s.last_name                     AS student_name,
        s.academic_level                                      AS student_level,
        p.patient_id                                          AS patient_id,
        p.first_name + ' ' + p.last_name                     AS patient_name,
        p.file_number                                         AS patient_file_no,
        CAST(CASE WHEN mr.chronic_diseases IS NOT NULL
                   AND LEN(mr.chronic_diseases) > 0
                 THEN 1 ELSE 0 END AS BIT)                   AS has_medical_alert,
        d.diagnosis_type                                      AS procedure_label,
        d.status                                              AS status,
        d.submitted_at                                        AS submitted_at,
        d.revision_count                                      AS revision_count,
        CAST(CASE WHEN DATEDIFF(HOUR, d.submitted_at, GETUTCDATE()) > 24
                   AND d.status IN ('Submitted', 'Revision_Requested')
                 THEN 1 ELSE 0 END AS BIT)                   AS is_stale,
        d.reviewed_at                                         AS reviewed_at
      FROM Diagnosis d
      JOIN Student s          ON s.academic_id = d.authored_by_student
      JOIN Medical_Records mr ON mr.record_id  = d.record_id
      JOIN Patients p         ON p.patient_id  = mr.patient_id
      WHERE s.employee_id = @doctorId
        AND d.status IN (${statusParams})
        AND d.deleted_at IS NULL
        AND d.authored_by_student IS NOT NULL

      UNION ALL

      SELECT
        t.treatment_id                                        AS submission_id,
        'Treatment'                                           AS submission_type,
        s.academic_id                                         AS student_id,
        s.first_name + ' ' + s.last_name                     AS student_name,
        s.academic_level                                      AS student_level,
        p.patient_id                                          AS patient_id,
        p.first_name + ' ' + p.last_name                     AS patient_name,
        p.file_number                                         AS patient_file_no,
        CAST(CASE WHEN mr.chronic_diseases IS NOT NULL
                   AND LEN(mr.chronic_diseases) > 0
                 THEN 1 ELSE 0 END AS BIT)                   AS has_medical_alert,
        t.treatment_type                                      AS procedure_label,
        t.status                                              AS status,
        t.submitted_at                                        AS submitted_at,
        t.revision_count                                      AS revision_count,
        CAST(CASE WHEN DATEDIFF(HOUR, t.submitted_at, GETUTCDATE()) > 24
                   AND t.status IN ('Submitted', 'Revision_Requested')
                 THEN 1 ELSE 0 END AS BIT)                   AS is_stale,
        t.reviewed_at                                         AS reviewed_at
      FROM Treatment t
      JOIN Student s          ON s.academic_id = t.authored_by_student
      JOIN Medical_Records mr ON mr.record_id  = t.record_id
      JOIN Patients p         ON p.patient_id  = mr.patient_id
      WHERE s.employee_id = @doctorId
        AND t.status IN (${statusParams})
        AND t.deleted_at IS NULL
        AND t.authored_by_student IS NOT NULL
    ) combined
    ${outerDateClause}
    ORDER BY submitted_at ASC
  `);

  return result.recordset;
}

export async function getReviewQueueStats(
  doctorEmployeeId: number,
): Promise<ReviewQueueStats> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('doctorId', sql.Int, doctorEmployeeId)
    .query<ReviewQueueStats>(`
      SELECT
        SUM(CASE WHEN status = 'Submitted'          THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status = 'Revision_Requested' THEN 1 ELSE 0 END) AS revision_requested_count,
        SUM(CASE WHEN status = 'Approved'
                  AND CAST(reviewed_at AS DATE) = CAST(GETUTCDATE() AS DATE)
                 THEN 1 ELSE 0 END)                                     AS approved_today_count,
        SUM(CASE WHEN status = 'Rejected'
                  AND CAST(reviewed_at AS DATE) = CAST(GETUTCDATE() AS DATE)
                 THEN 1 ELSE 0 END)                                     AS rejected_today_count
      FROM (
        SELECT d.status, d.reviewed_at
        FROM Diagnosis d
        JOIN Student s ON s.academic_id = d.authored_by_student
        WHERE s.employee_id = @doctorId
          AND d.deleted_at IS NULL
          AND d.authored_by_student IS NOT NULL

        UNION ALL

        SELECT t.status, t.reviewed_at
        FROM Treatment t
        JOIN Student s ON s.academic_id = t.authored_by_student
        WHERE s.employee_id = @doctorId
          AND t.deleted_at IS NULL
          AND t.authored_by_student IS NOT NULL
      ) combined
    `);

  return result.recordset[0] ?? {
    pending_count: 0, revision_requested_count: 0,
    approved_today_count: 0, rejected_today_count: 0,
  };
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export async function getSubmissionDetail(
  type:         SubmissionType,
  submissionId: number,
): Promise<ReviewSubmissionDetail | null> {
  const pool = await getPool();

  if (type === SubmissionType.Diagnosis) {
    const result = await pool
      .request()
      .input('id', sql.Int, submissionId)
      .query<any>(`
        SELECT
          d.diagnosis_id          AS submission_id,
          'Diagnosis'             AS submission_type,
          s.academic_id           AS student_id,
          s.first_name + ' ' + s.last_name AS student_name,
          s.academic_level        AS student_level,
          p.patient_id            AS patient_id,
          p.first_name + ' ' + p.last_name AS patient_name,
          p.file_number           AS patient_file_no,
          CAST(CASE WHEN mr.chronic_diseases IS NOT NULL AND LEN(mr.chronic_diseases) > 0
                    THEN 1 ELSE 0 END AS BIT) AS has_medical_alert,
          d.diagnosis_type        AS procedure_label,
          d.status                AS status,
          d.submitted_at          AS submitted_at,
          d.revision_count        AS revision_count,
          CAST(CASE WHEN DATEDIFF(HOUR, d.submitted_at, GETUTCDATE()) > 24
                     AND d.status IN ('Submitted', 'Revision_Requested')
                    THEN 1 ELSE 0 END AS BIT) AS is_stale,
          d.clinical_findings     AS clinical_findings,
          d.radiographic_findings AS radiographic_findings,
          d.progress_note         AS progress_note,
          mr.chronic_diseases     AS chronic_conditions
        FROM Diagnosis d
        JOIN Student s          ON s.academic_id = d.authored_by_student
        JOIN Medical_Records mr ON mr.record_id  = d.record_id
        JOIN Patients p         ON p.patient_id  = mr.patient_id
        WHERE d.diagnosis_id = @id AND d.deleted_at IS NULL
      `);
    if (!result.recordset.length) return null;
    const row = result.recordset[0] as ReviewSubmissionDetail;
    row.history = await getSubmissionHistory(type, submissionId);
    return row;
  } else {
    const result = await pool
      .request()
      .input('id', sql.Int, submissionId)
      .query<any>(`
        SELECT
          t.treatment_id          AS submission_id,
          'Treatment'             AS submission_type,
          s.academic_id           AS student_id,
          s.first_name + ' ' + s.last_name AS student_name,
          s.academic_level        AS student_level,
          p.patient_id            AS patient_id,
          p.first_name + ' ' + p.last_name AS patient_name,
          p.file_number           AS patient_file_no,
          CAST(CASE WHEN mr.chronic_diseases IS NOT NULL AND LEN(mr.chronic_diseases) > 0
                    THEN 1 ELSE 0 END AS BIT) AS has_medical_alert,
          t.treatment_type        AS procedure_label,
          t.status                AS status,
          t.submitted_at          AS submitted_at,
          t.revision_count        AS revision_count,
          CAST(CASE WHEN DATEDIFF(HOUR, t.submitted_at, GETUTCDATE()) > 24
                     AND t.status IN ('Submitted', 'Revision_Requested')
                    THEN 1 ELSE 0 END AS BIT) AS is_stale,
          t.treatment_note        AS treatment_note,
          mr.chronic_diseases     AS chronic_conditions
        FROM Treatment t
        JOIN Student s          ON s.academic_id = t.authored_by_student
        JOIN Medical_Records mr ON mr.record_id  = t.record_id
        JOIN Patients p         ON p.patient_id  = mr.patient_id
        WHERE t.treatment_id = @id AND t.deleted_at IS NULL
      `);
    if (!result.recordset.length) return null;
    const row = result.recordset[0] as ReviewSubmissionDetail;
    row.history = await getSubmissionHistory(type, submissionId);
    return row;
  }
}

export async function getSubmissionBasic(
  type:         SubmissionType,
  submissionId: number,
): Promise<{ status: ReviewStatus; revision_count: number; authored_by_student: number | null } | null> {
  const pool  = await getPool();
  const table = type === SubmissionType.Diagnosis ? 'Diagnosis' : 'Treatment';
  const idCol = type === SubmissionType.Diagnosis ? 'diagnosis_id' : 'treatment_id';
  const result = await pool
    .request()
    .input('id', sql.Int, submissionId)
    .query<{ status: ReviewStatus; revision_count: number; authored_by_student: number | null }>(
      `SELECT status, revision_count, authored_by_student FROM ${table} WHERE ${idCol} = @id AND deleted_at IS NULL`,
    );
  return result.recordset[0] ?? null;
}

// ─── Review updates ───────────────────────────────────────────────────────────

export async function updateDiagnosisReview(
  diagnosisId:       number,
  status:            ReviewStatus,
  reviewerId:        number,
  feedback:          string | null,
  incrementRevision: boolean,
): Promise<void> {
  const pool      = await getPool();
  const revClause = incrementRevision ? ', revision_count = revision_count + 1' : '';
  await pool
    .request()
    .input('id',       sql.Int,               diagnosisId)
    .input('status',   sql.VarChar(20),       status)
    .input('reviewer', sql.Int,               reviewerId)
    .input('feedback', sql.NVarChar(sql.MAX), feedback)
    .query(`
      UPDATE Diagnosis
      SET status          = @status,
          reviewed_by     = @reviewer,
          reviewed_at     = GETUTCDATE(),
          doctor_feedback = @feedback
          ${revClause}
      WHERE diagnosis_id = @id AND deleted_at IS NULL
    `);
}

export async function updateTreatmentReview(
  treatmentId:       number,
  status:            ReviewStatus,
  reviewerId:        number,
  feedback:          string | null,
  incrementRevision: boolean,
): Promise<void> {
  const pool      = await getPool();
  const revClause = incrementRevision ? ', revision_count = revision_count + 1' : '';
  await pool
    .request()
    .input('id',       sql.Int,               treatmentId)
    .input('status',   sql.VarChar(20),       status)
    .input('reviewer', sql.Int,               reviewerId)
    .input('feedback', sql.NVarChar(sql.MAX), feedback)
    .query(`
      UPDATE Treatment
      SET status             = @status,
          approved_by_doctor = @reviewer,
          reviewed_at        = GETUTCDATE(),
          doctor_feedback    = @feedback
          ${revClause}
      WHERE treatment_id = @id AND deleted_at IS NULL
    `);
}

// ─── Review history ───────────────────────────────────────────────────────────

export async function insertReviewHistory(entry: {
  submissionType: SubmissionType;
  submissionId:   number;
  roundNumber:    number;
  reviewedBy:     number;
  action:         ReviewHistoryAction;
  feedback:       string | null;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('type',     sql.VarChar(20),       entry.submissionType)
    .input('id',       sql.Int,               entry.submissionId)
    .input('round',    sql.Int,               entry.roundNumber)
    .input('reviewer', sql.Int,               entry.reviewedBy)
    .input('action',   sql.VarChar(20),       entry.action)
    .input('feedback', sql.NVarChar(sql.MAX), entry.feedback)
    .query(`
      INSERT INTO Review_History (submission_type, submission_id, round_number, reviewed_by, action, feedback)
      VALUES (@type, @id, @round, @reviewer, @action, @feedback)
    `);
}

export async function getSubmissionHistory(
  type:         SubmissionType,
  submissionId: number,
): Promise<ReviewHistoryEntry[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('type', sql.VarChar(20), type)
    .input('id',   sql.Int,         submissionId)
    .query<ReviewHistoryEntry>(`
      SELECT
        rh.round_number,
        rh.action,
        rh.feedback,
        e.first_name + ' ' + e.last_name AS reviewer_name,
        rh.created_at
      FROM Review_History rh
      JOIN Employee e ON e.employee_id = rh.reviewed_by
      WHERE rh.submission_type = @type AND rh.submission_id = @id
      ORDER BY rh.round_number ASC
    `);
  return result.recordset;
}

// ─── Student-side ─────────────────────────────────────────────────────────────

export async function getMySubmissions(
  studentAcademicId: number,
): Promise<any[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('studentId', sql.Int, studentAcademicId)
    .query(`
      SELECT
        d.diagnosis_id          AS submission_id,
        'Diagnosis'             AS submission_type,
        p.first_name + ' ' + p.last_name AS patient_name,
        p.file_number           AS patient_file_no,
        d.diagnosis_type        AS procedure_label,
        d.status                AS status,
        d.submitted_at          AS submitted_at,
        d.revision_count        AS revision_count,
        d.doctor_feedback       AS doctor_feedback,
        d.clinical_findings     AS clinical_findings,
        d.radiographic_findings AS radiographic_findings,
        d.progress_note         AS progress_note,
        NULL                    AS treatment_note
      FROM Diagnosis d
      JOIN Medical_Records mr ON mr.record_id  = d.record_id
      JOIN Patients p         ON p.patient_id  = mr.patient_id
      WHERE d.authored_by_student = @studentId AND d.deleted_at IS NULL

      UNION ALL

      SELECT
        t.treatment_id          AS submission_id,
        'Treatment'             AS submission_type,
        p.first_name + ' ' + p.last_name AS patient_name,
        p.file_number           AS patient_file_no,
        t.treatment_type        AS procedure_label,
        t.status                AS status,
        t.submitted_at          AS submitted_at,
        t.revision_count        AS revision_count,
        t.doctor_feedback       AS doctor_feedback,
        NULL                    AS clinical_findings,
        NULL                    AS radiographic_findings,
        NULL                    AS progress_note,
        t.treatment_note        AS treatment_note
      FROM Treatment t
      JOIN Medical_Records mr ON mr.record_id  = t.record_id
      JOIN Patients p         ON p.patient_id  = mr.patient_id
      WHERE t.authored_by_student = @studentId AND t.deleted_at IS NULL

      ORDER BY submitted_at DESC
    `);
  return result.recordset;
}

export async function resubmitDiagnosis(
  diagnosisId: number,
  fields:      Partial<ResubmitRequest>,
): Promise<void> {
  const pool = await getPool();
  const req  = pool.request().input('id', sql.Int, diagnosisId);
  const sets: string[] = [
    `status          = 'Submitted'`,
    `submitted_at    = GETUTCDATE()`,
    `reviewed_at     = NULL`,
    `reviewed_by     = NULL`,
    `doctor_feedback = NULL`,
  ];
  if (fields.diagnosis_type       !== undefined) { req.input('dt', sql.VarChar(100), fields.diagnosis_type);              sets.push('diagnosis_type = @dt'); }
  if (fields.clinical_findings    !== undefined) { req.input('cf', sql.NVarChar(sql.MAX), fields.clinical_findings);      sets.push('clinical_findings = @cf'); }
  if (fields.radiographic_findings!== undefined) { req.input('rf', sql.NVarChar(sql.MAX), fields.radiographic_findings);  sets.push('radiographic_findings = @rf'); }
  if (fields.progress_note        !== undefined) { req.input('pn', sql.NVarChar(sql.MAX), fields.progress_note);          sets.push('progress_note = @pn'); }
  await req.query(`UPDATE Diagnosis SET ${sets.join(', ')} WHERE diagnosis_id = @id AND deleted_at IS NULL`);
}

export async function resubmitTreatment(
  treatmentId: number,
  fields:      Partial<ResubmitRequest>,
): Promise<void> {
  const pool = await getPool();
  const req  = pool.request().input('id', sql.Int, treatmentId);
  const sets: string[] = [
    `status             = 'Submitted'`,
    `submitted_at       = GETUTCDATE()`,
    `reviewed_at        = NULL`,
    `approved_by_doctor = NULL`,
    `doctor_feedback    = NULL`,
  ];
  if (fields.treatment_type !== undefined) { req.input('tt', sql.VarChar(100), fields.treatment_type);         sets.push('treatment_type = @tt'); }
  if (fields.treatment_note !== undefined) { req.input('tn', sql.NVarChar(sql.MAX), fields.treatment_note);    sets.push('treatment_note = @tn'); }
  await req.query(`UPDATE Treatment SET ${sets.join(', ')} WHERE treatment_id = @id AND deleted_at IS NULL`);
}

export async function withdrawSubmission(
  type:         SubmissionType,
  submissionId: number,
): Promise<void> {
  const pool = await getPool();
  if (type === SubmissionType.Diagnosis) {
    await pool.request().input('id', sql.Int, submissionId)
      .query(`UPDATE Diagnosis SET deleted_at = GETUTCDATE() WHERE diagnosis_id = @id AND deleted_at IS NULL`);
  } else {
    await pool.request().input('id', sql.Int, submissionId)
      .query(`UPDATE Treatment SET deleted_at = GETUTCDATE() WHERE treatment_id = @id AND deleted_at IS NULL`);
  }
}

// ─── Grades ───────────────────────────────────────────────────────────────────

export interface GradeRow {
  grade_id:        number;
  submission_type: string;
  submission_id:   number;
  student_id:      number;
  graded_by:       number;
  grade:           number;
  feedback_note:   string | null;
  graded_at:       string;
}

export interface GradeSummaryRow {
  student_id:     number;
  student_name:   string;
  student_level:  number;
  total_count:    number;
  graded_count:   number;
  avg_grade:      number | null;
  last_graded_at: string | null;
}

export interface StudentGradeRecord {
  submission_id:   number;
  submission_type: string;
  student_id:      number;
  student_name:    string;
  procedure_label: string;
  patient_name:    string;
  patient_file_no: number;
  submitted_at:    string;
  status:          string;
  grade:           number | null;
  feedback_note:   string | null;
  graded_at:       string | null;
}

export async function getGradeBySubmission(
  submissionType: string,
  submissionId:   number,
): Promise<GradeRow | null> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('type', sql.VarChar(20), submissionType)
    .input('id',   sql.Int,         submissionId)
    .query<GradeRow>(`
      SELECT * FROM Student_Grades
      WHERE submission_type = @type AND submission_id = @id
    `);
  return result.recordset[0] ?? null;
}

export async function insertGrade(params: {
  submissionType: string;
  submissionId:   number;
  studentId:      number;
  gradedBy:       number;
  grade:          number;
  feedbackNote:   string | null;
}): Promise<GradeRow> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('type',     sql.VarChar(20),   params.submissionType)
    .input('subId',    sql.Int,           params.submissionId)
    .input('stuId',    sql.Int,           params.studentId)
    .input('gradedBy', sql.Int,           params.gradedBy)
    .input('grade',    sql.Int,           params.grade)
    .input('note',     sql.NVarChar(500), params.feedbackNote)
    .query<GradeRow>(`
      INSERT INTO Student_Grades
        (submission_type, submission_id, student_id, graded_by, grade, feedback_note)
      OUTPUT INSERTED.*
      VALUES (@type, @subId, @stuId, @gradedBy, @grade, @note)
    `);
  return result.recordset[0];
}

export async function getGradeSummary(
  doctorEmployeeId: number,
): Promise<GradeSummaryRow[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('doctorId', sql.Int, doctorEmployeeId)
    .query<GradeSummaryRow>(`
      SELECT
        s.academic_id                                          AS student_id,
        s.first_name + ' ' + s.last_name                      AS student_name,
        s.academic_level                                       AS student_level,
        COUNT(sub.submission_id)                               AS total_count,
        SUM(CASE WHEN sub.grade IS NOT NULL THEN 1 ELSE 0 END) AS graded_count,
        ROUND(AVG(CAST(sub.grade AS FLOAT)), 1)                AS avg_grade,
        MAX(sub.graded_at)                                     AS last_graded_at
      FROM Student s
      LEFT JOIN (
        SELECT d.authored_by_student AS student_id,
               d.diagnosis_id        AS submission_id,
               sg.grade,
               sg.graded_at
        FROM Diagnosis d
        LEFT JOIN Student_Grades sg
          ON sg.submission_type = 'Diagnosis' AND sg.submission_id = d.diagnosis_id
        WHERE d.authored_by_student IS NOT NULL AND d.deleted_at IS NULL AND d.status = 'Approved'

        UNION ALL

        SELECT t.authored_by_student AS student_id,
               t.treatment_id        AS submission_id,
               sg.grade,
               sg.graded_at
        FROM Treatment t
        LEFT JOIN Student_Grades sg
          ON sg.submission_type = 'Treatment' AND sg.submission_id = t.treatment_id
        WHERE t.authored_by_student IS NOT NULL AND t.deleted_at IS NULL AND t.status = 'Approved'
      ) sub ON sub.student_id = s.academic_id
      WHERE s.employee_id = @doctorId
      GROUP BY s.academic_id, s.first_name, s.last_name, s.academic_level
      HAVING COUNT(sub.submission_id) > 0
      ORDER BY s.first_name, s.last_name
    `);
  return result.recordset;
}

export async function getStudentGradeRecords(
  studentId:        number,
  doctorEmployeeId: number,
): Promise<StudentGradeRecord[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('studentId', sql.Int, studentId)
    .input('doctorId',  sql.Int, doctorEmployeeId)
    .query<StudentGradeRecord>(`
      SELECT
        d.diagnosis_id                       AS submission_id,
        'Diagnosis'                          AS submission_type,
        s.academic_id                        AS student_id,
        s.first_name + ' ' + s.last_name    AS student_name,
        d.diagnosis_type                     AS procedure_label,
        p.first_name + ' ' + p.last_name    AS patient_name,
        p.file_number                        AS patient_file_no,
        d.submitted_at,
        d.status,
        sg.grade,
        sg.feedback_note,
        sg.graded_at
      FROM Diagnosis d
      JOIN Student s          ON s.academic_id = d.authored_by_student
      JOIN Medical_Records mr ON mr.record_id  = d.record_id
      JOIN Patients p         ON p.patient_id  = mr.patient_id
      LEFT JOIN Student_Grades sg
        ON sg.submission_type = 'Diagnosis' AND sg.submission_id = d.diagnosis_id
      WHERE s.academic_id = @studentId
        AND s.employee_id = @doctorId
        AND d.authored_by_student IS NOT NULL
        AND d.deleted_at IS NULL
        AND d.status = 'Approved'

      UNION ALL

      SELECT
        t.treatment_id                       AS submission_id,
        'Treatment'                          AS submission_type,
        s.academic_id                        AS student_id,
        s.first_name + ' ' + s.last_name    AS student_name,
        t.treatment_type                     AS procedure_label,
        p.first_name + ' ' + p.last_name    AS patient_name,
        p.file_number                        AS patient_file_no,
        t.submitted_at,
        t.status,
        sg.grade,
        sg.feedback_note,
        sg.graded_at
      FROM Treatment t
      JOIN Student s          ON s.academic_id = t.authored_by_student
      JOIN Medical_Records mr ON mr.record_id  = t.record_id
      JOIN Patients p         ON p.patient_id  = mr.patient_id
      LEFT JOIN Student_Grades sg
        ON sg.submission_type = 'Treatment' AND sg.submission_id = t.treatment_id
      WHERE s.academic_id = @studentId
        AND s.employee_id = @doctorId
        AND t.authored_by_student IS NOT NULL
        AND t.deleted_at IS NULL
        AND t.status = 'Approved'

      ORDER BY submitted_at DESC
    `);
  return result.recordset;
}

export interface MyGradeRecord {
  grade_id:        number;
  submission_type: 'Diagnosis' | 'Treatment';
  submission_id:   number;
  procedure_label: string;
  patient_name:    string;
  patient_file_no: number;
  submitted_at:    string;
  grade:           number;
  feedback_note:   string | null;
  graded_at:       string;
}

export async function getMyGrades(studentAcademicId: number): Promise<{
  grades: MyGradeRecord[];
  ungradedApprovedCount: number;
}> {
  const pool = await getPool();

  const gradesResult = await pool
    .request()
    .input('studentId', sql.Int, studentAcademicId)
    .query<MyGradeRecord>(`
      SELECT
        sg.grade_id,
        'Diagnosis'                          AS submission_type,
        sg.submission_id,
        d.diagnosis_type                     AS procedure_label,
        p.first_name + ' ' + p.last_name    AS patient_name,
        p.file_number                        AS patient_file_no,
        d.submitted_at,
        sg.grade,
        sg.feedback_note,
        sg.graded_at
      FROM Student_Grades sg
      JOIN Diagnosis d        ON sg.submission_id = d.diagnosis_id
      JOIN Medical_Records mr ON mr.record_id     = d.record_id
      JOIN Patients p         ON p.patient_id     = mr.patient_id
      WHERE sg.submission_type = 'Diagnosis'
        AND sg.student_id = @studentId

      UNION ALL

      SELECT
        sg.grade_id,
        'Treatment'                          AS submission_type,
        sg.submission_id,
        t.treatment_type                     AS procedure_label,
        p.first_name + ' ' + p.last_name    AS patient_name,
        p.file_number                        AS patient_file_no,
        t.submitted_at,
        sg.grade,
        sg.feedback_note,
        sg.graded_at
      FROM Student_Grades sg
      JOIN Treatment t        ON sg.submission_id = t.treatment_id
      JOIN Medical_Records mr ON mr.record_id     = t.record_id
      JOIN Patients p         ON p.patient_id     = mr.patient_id
      WHERE sg.submission_type = 'Treatment'
        AND sg.student_id = @studentId

      ORDER BY graded_at DESC
    `);

  const ungradedResult = await pool
    .request()
    .input('studentId2', sql.Int, studentAcademicId)
    .query<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT d.diagnosis_id AS submission_id, 'Diagnosis' AS submission_type
        FROM Diagnosis d
        WHERE d.authored_by_student = @studentId2
          AND d.status = 'Approved'
          AND d.deleted_at IS NULL

        UNION ALL

        SELECT t.treatment_id AS submission_id, 'Treatment' AS submission_type
        FROM Treatment t
        WHERE t.authored_by_student = @studentId2
          AND t.status = 'Approved'
          AND t.deleted_at IS NULL
      ) approved
      WHERE NOT EXISTS (
        SELECT 1 FROM Student_Grades sg
        WHERE sg.submission_type = approved.submission_type
          AND sg.submission_id   = approved.submission_id
      )
    `);

  return {
    grades:               gradesResult.recordset,
    ungradedApprovedCount: ungradedResult.recordset[0]?.cnt ?? 0,
  };
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export async function getSupervisorForStudent(
  studentAcademicId: number,
): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('academicId', sql.Int, studentAcademicId)
    .query<{ employee_id: number }>(
      `SELECT employee_id FROM Student WHERE academic_id = @academicId`,
    );
  return result.recordset.length ? result.recordset[0].employee_id : null;
}

export async function getStudentForSubmission(
  type:         SubmissionType,
  submissionId: number,
): Promise<{ academicId: number; supervisorEmployeeId: number } | null> {
  const pool  = await getPool();
  const table = type === SubmissionType.Diagnosis ? 'Diagnosis' : 'Treatment';
  const idCol = type === SubmissionType.Diagnosis ? 'diagnosis_id' : 'treatment_id';
  const result = await pool
    .request()
    .input('id', sql.Int, submissionId)
    .query<{ academic_id: number; employee_id: number }>(`
      SELECT x.authored_by_student AS academic_id, s.employee_id
      FROM ${table} x
      JOIN Student s ON s.academic_id = x.authored_by_student
      WHERE x.${idCol} = @id AND x.deleted_at IS NULL
    `);
  if (!result.recordset.length) return null;
  return {
    academicId:           result.recordset[0].academic_id,
    supervisorEmployeeId: result.recordset[0].employee_id,
  };
}
