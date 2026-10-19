// Read-only SQL for the Student Performance reports module.
// Feeds `GET /reports/students/procedure-log` (per-student treatment counts
// grouped by procedure type), `/evaluation-summary` (supervisor rollup of
// student activity), and `/supervisors` (lookup for the filter dropdown).
// "Procedures" come from `Treatment.authored_by_student` — only treatments
// a student authored count, not diagnoses. Supervisor filtering joins
// Student → Employee via `Student.employee_id` (the assigned supervisor).
import sql from 'mssql';
import { getPool } from '../../config/db.config';

export interface StudentProcedureRow {
  academic_id: number;
  student_name: string;
  academic_level: number;
  supervisor_name: string;
  supervisor_id: number;
  total_procedures: number;
  unique_procedure_types: number;
}

export interface ProcedureTypeRow {
  treatment_type: string;
  count: number;
}

export interface ProcedureSummaryRow {
  active_students: number;
  total_procedures: number;
  avg_per_student: number | null;
}

export interface EvaluationStudentRow {
  academic_id: number;
  student_name: string;
  academic_level: number;
  supervisor_name: string;
  supervisor_id: number;
  total_treatments: number;
  clean_approvals: number;
  needed_feedback: number;
  clean_approval_rate: number | null;
}

export interface EvaluationSummaryRow {
  students_evaluated: number;
  avg_clean_rate: number | null;
}

export interface SupervisorRow {
  employee_id: number;
  doctor_name: string;
}

export async function getStudentProcedureLog(
  supervisorId?: number | null,
): Promise<StudentProcedureRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<StudentProcedureRow>(`
      SELECT
        s.academic_id,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        s.academic_level,
        CONCAT(e.first_name, ' ', e.last_name) AS supervisor_name,
        e.employee_id AS supervisor_id,
        COUNT(t.treatment_id) AS total_procedures,
        COUNT(DISTINCT t.treatment_type) AS unique_procedure_types
      FROM Student s
      INNER JOIN Employee e ON e.employee_id = s.employee_id
      LEFT JOIN Treatment t ON t.authored_by_student = s.academic_id
        AND t.deleted_at IS NULL
      WHERE (@supervisorId IS NULL OR s.employee_id = @supervisorId)
      GROUP BY s.academic_id, s.first_name, s.last_name, s.academic_level,
               e.first_name, e.last_name, e.employee_id
      ORDER BY total_procedures DESC
    `);
  return result.recordset;
}

export async function getProcedureTypeDistribution(
  supervisorId?: number | null,
): Promise<ProcedureTypeRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<ProcedureTypeRow>(`
      SELECT
        t.treatment_type,
        COUNT(*) AS count
      FROM Treatment t
      INNER JOIN Student s ON s.academic_id = t.authored_by_student
      WHERE t.deleted_at IS NULL
        AND t.authored_by_student IS NOT NULL
        AND (@supervisorId IS NULL OR s.employee_id = @supervisorId)
      GROUP BY t.treatment_type
      ORDER BY count DESC
    `);
  return result.recordset;
}

export async function getProcedureLogSummary(
  supervisorId?: number | null,
): Promise<ProcedureSummaryRow> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<ProcedureSummaryRow>(`
      SELECT
        COUNT(DISTINCT s.academic_id) AS active_students,
        COUNT(t.treatment_id) AS total_procedures,
        CAST(
          COUNT(t.treatment_id) * 1.0 /
          NULLIF(COUNT(DISTINCT s.academic_id), 0)
        AS DECIMAL(10,1)) AS avg_per_student
      FROM Student s
      LEFT JOIN Treatment t ON t.authored_by_student = s.academic_id
        AND t.deleted_at IS NULL
      WHERE (@supervisorId IS NULL OR s.employee_id = @supervisorId)
    `);
  return (
    result.recordset[0] ?? {
      active_students: 0,
      total_procedures: 0,
      avg_per_student: 0,
    }
  );
}

export async function getEvaluationStudents(
  supervisorId?: number | null,
): Promise<EvaluationStudentRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<EvaluationStudentRow>(`
      SELECT
        s.academic_id,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        s.academic_level,
        CONCAT(e.first_name, ' ', e.last_name) AS supervisor_name,
        e.employee_id AS supervisor_id,
        COUNT(t.treatment_id) AS total_treatments,
        SUM(CASE WHEN t.doctor_feedback IS NULL OR DATALENGTH(t.doctor_feedback) = 0 THEN 1 ELSE 0 END) AS clean_approvals,
        SUM(CASE WHEN t.doctor_feedback IS NOT NULL AND DATALENGTH(t.doctor_feedback) > 0 THEN 1 ELSE 0 END) AS needed_feedback,
        CAST(
          SUM(CASE WHEN t.doctor_feedback IS NULL OR DATALENGTH(t.doctor_feedback) = 0 THEN 1.0 ELSE 0 END) * 100.0 /
          NULLIF(COUNT(t.treatment_id), 0)
        AS DECIMAL(5,1)) AS clean_approval_rate
      FROM Student s
      INNER JOIN Employee e ON e.employee_id = s.employee_id
      LEFT JOIN Treatment t ON t.authored_by_student = s.academic_id
        AND t.deleted_at IS NULL
      WHERE (@supervisorId IS NULL OR s.employee_id = @supervisorId)
      GROUP BY s.academic_id, s.first_name, s.last_name, s.academic_level,
               e.first_name, e.last_name, e.employee_id
      HAVING COUNT(t.treatment_id) > 0
      ORDER BY clean_approval_rate DESC
    `);
  return result.recordset;
}

export async function getEvaluationSummary(
  supervisorId?: number | null,
): Promise<EvaluationSummaryRow> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<EvaluationSummaryRow>(`
      SELECT
        COUNT(DISTINCT s.academic_id) AS students_evaluated,
        CAST(AVG(sub.clean_rate) AS DECIMAL(5,1)) AS avg_clean_rate
      FROM Student s
      CROSS APPLY (
        SELECT
          COUNT(t.treatment_id) AS total_t,
          CAST(
            SUM(CASE WHEN t.doctor_feedback IS NULL OR DATALENGTH(t.doctor_feedback) = 0 THEN 1.0 ELSE 0 END) * 100.0 /
            NULLIF(COUNT(t.treatment_id), 0)
          AS DECIMAL(5,1)) AS clean_rate
        FROM Treatment t
        WHERE t.authored_by_student = s.academic_id AND t.deleted_at IS NULL
      ) sub
      WHERE sub.total_t > 0
        AND (@supervisorId IS NULL OR s.employee_id = @supervisorId)
    `);
  return (
    result.recordset[0] ?? {
      students_evaluated: 0,
      avg_clean_rate: 0,
    }
  );
}

export async function getSupervisorsForFilter(): Promise<SupervisorRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query<SupervisorRow>(`
    SELECT DISTINCT
      e.employee_id,
      CONCAT(e.first_name, ' ', e.last_name) AS doctor_name
    FROM Employee e
    INNER JOIN Student s ON s.employee_id = e.employee_id
    WHERE e.deleted_at IS NULL
    ORDER BY doctor_name
  `);
  return result.recordset;
}
