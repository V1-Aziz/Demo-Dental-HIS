// Extra row-level queries used ONLY by the `POST /reports/export` pipeline
// (PDF / Excel / CSV generation). The dashboard view of each report shows
// aggregates and charts; the exported files need the underlying tabular
// rows (patient lists, appointment lists, consumption transactions, etc.)
// which would be wasteful to ship on every dashboard load. Keep export-
// specific SQL here so the on-screen report repos stay lean, and so new
// export formats only need to touch this file + the export service.
import sql from 'mssql';
import { getPool } from '../../config/db.config';

export async function getUserDisplayName(userId: number): Promise<string> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('userId', sql.Int, userId)
    .query<{ name: string | null; email: string }>(`
      SELECT
        (SELECT TOP 1 CONCAT(first_name, ' ', last_name)
         FROM Employee WHERE user_id = @userId AND deleted_at IS NULL) AS name,
        u.email AS email
      FROM Users u
      WHERE u.user_id = @userId
    `);
  const row = result.recordset[0];
  if (!row) return 'System User';
  return row.name && row.name.trim() !== '' ? row.name : row.email;
}

export interface PatientListRow {
  patient_id: number;
  file_number: number;
  full_name: string;
  date_of_birth: Date;
  gender: string;
  created_at: Date;
}

export async function getPatientsRegisteredInPeriod(
  startDate: string,
  endDate: string,
): Promise<PatientListRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<PatientListRow>(`
      SELECT
        p.patient_id,
        p.file_number,
        CONCAT(p.first_name, ' ', p.last_name) AS full_name,
        p.date_of_birth,
        p.gender,
        p.created_at
      FROM Patients p
      WHERE p.deleted_at IS NULL
        AND p.created_at >= @startDate
        AND p.created_at < DATEADD(DAY, 1, @endDate)
      ORDER BY p.created_at DESC
    `);
  return result.recordset;
}

export async function getAllPatientsDemographics(): Promise<PatientListRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query<PatientListRow>(`
    SELECT
      p.patient_id,
      p.file_number,
      CONCAT(p.first_name, ' ', p.last_name) AS full_name,
      p.date_of_birth,
      p.gender,
      p.created_at
    FROM Patients p
    WHERE p.deleted_at IS NULL
    ORDER BY p.last_name, p.first_name
  `);
  return result.recordset;
}

export interface AttendanceByDoctorRow {
  doctor_name: string;
  total_appointments: number;
  completed: number;
  no_show: number;
  canceled: number;
  scheduled: number;
}

export async function getAttendanceByDoctor(
  startDate: string,
  endDate: string,
  clinicId?: number | null,
): Promise<AttendanceByDoctorRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('clinicId', sql.Int, clinicId ?? null)
    .query<AttendanceByDoctorRow>(`
      SELECT
        CONCAT(e.first_name, ' ', e.last_name) AS doctor_name,
        COUNT(*) AS total_appointments,
        SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN a.status = 'No Show' THEN 1 ELSE 0 END) AS no_show,
        SUM(CASE WHEN a.status = 'Canceled' THEN 1 ELSE 0 END) AS canceled,
        SUM(CASE WHEN a.status = 'Scheduled' THEN 1 ELSE 0 END) AS scheduled
      FROM Appointments a
      INNER JOIN Employee e ON e.employee_id = a.doctor_id
      WHERE a.deleted_at IS NULL
        AND a.appointment_start_time >= @startDate
        AND a.appointment_start_time < DATEADD(DAY, 1, @endDate)
        AND (@clinicId IS NULL OR a.clinic_id = @clinicId)
      GROUP BY e.first_name, e.last_name
      ORDER BY total_appointments DESC
    `);
  return result.recordset;
}

export interface AppointmentListRow {
  appointment_id: number;
  patient_name: string;
  doctor_name: string;
  clinic_name: string | null;
  appointment_start_time: Date;
  status: string;
}

export async function getAppointmentsList(
  startDate: string,
  endDate: string,
  clinicId?: number | null,
): Promise<AppointmentListRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('clinicId', sql.Int, clinicId ?? null)
    .query<AppointmentListRow>(`
      SELECT
        a.appointment_id,
        CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
        CONCAT(e.first_name, ' ', e.last_name) AS doctor_name,
        c.clinic_name,
        a.appointment_start_time,
        a.status
      FROM Appointments a
      INNER JOIN Patients p ON p.patient_id = a.patient_id
      INNER JOIN Employee e ON e.employee_id = a.doctor_id
      LEFT JOIN Clinic c    ON c.clinic_id = a.clinic_id
      WHERE a.deleted_at IS NULL
        AND a.appointment_start_time >= @startDate
        AND a.appointment_start_time < DATEADD(DAY, 1, @endDate)
        AND (@clinicId IS NULL OR a.clinic_id = @clinicId)
      ORDER BY a.appointment_start_time DESC
    `);
  return result.recordset;
}

export interface ConsumptionTransactionRow {
  transaction_id: number;
  item_name: string;
  category: string;
  quantity: number;
  user_name: string | null;
  time_stamp: Date;
}

export async function getConsumptionTransactions(
  startDate: string,
  endDate: string,
  category?: string | null,
): Promise<ConsumptionTransactionRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('category', sql.VarChar(100), category ?? null)
    .query<ConsumptionTransactionRow>(`
      SELECT
        st.transaction_id,
        i.item_name,
        i.category,
        st.quantity,
        (SELECT TOP 1 CONCAT(e.first_name, ' ', e.last_name)
         FROM Employee e WHERE e.user_id = st.user_id AND e.deleted_at IS NULL) AS user_name,
        st.time_stamp
      FROM Stock_Transactions st
      INNER JOIN Inventory_Items i ON i.item_id = st.item_id
      WHERE st.transaction_type = 'Withdraw'
        AND st.time_stamp >= @startDate
        AND st.time_stamp < DATEADD(DAY, 1, @endDate)
        AND (@category IS NULL OR @category = '' OR i.category = @category)
      ORDER BY st.time_stamp DESC
    `);
  return result.recordset;
}

export interface LowStockCategoryRow {
  category: string;
  total: number;
}

export async function getLowStockCountByCategory(): Promise<LowStockCategoryRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query<LowStockCategoryRow>(`
    SELECT i.category, COUNT(*) AS total
    FROM Inventory_Items i
    OUTER APPLY (
      SELECT COALESCE(SUM(b.quantity_remaining), 0) AS quantity_on_hand
      FROM Item_Batches b
      WHERE b.item_id = i.item_id
    ) q
    WHERE q.quantity_on_hand <= i.low_stock_limit
    GROUP BY i.category
    ORDER BY total DESC
  `);
  return result.recordset;
}

export interface StudentProcedureTableRow {
  treatment_id: number;
  student_name: string;
  patient_name: string;
  treatment_type: string;
  approved_by: string;
}

export async function getStudentProceduresList(
  supervisorId?: number | null,
): Promise<StudentProcedureTableRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<StudentProcedureTableRow>(`
      SELECT
        t.treatment_id,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
        t.treatment_type,
        CONCAT(e.first_name, ' ', e.last_name) AS approved_by
      FROM Treatment t
      INNER JOIN Student s         ON s.academic_id = t.authored_by_student
      INNER JOIN Medical_Records r ON r.record_id = t.record_id
      INNER JOIN Patients p        ON p.patient_id = r.patient_id
      INNER JOIN Employee e        ON e.employee_id = t.approved_by_doctor
      WHERE t.deleted_at IS NULL
        AND t.authored_by_student IS NOT NULL
        AND (@supervisorId IS NULL OR s.employee_id = @supervisorId)
      ORDER BY t.treatment_id DESC
    `);
  return result.recordset;
}

export interface SupervisorEvaluationTableRow {
  treatment_id: number;
  student_name: string;
  supervisor_name: string;
  feedback_excerpt: string;
}

export async function getSupervisorEvaluationsList(
  supervisorId?: number | null,
): Promise<SupervisorEvaluationTableRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('supervisorId', sql.Int, supervisorId ?? null)
    .query<SupervisorEvaluationTableRow>(`
      SELECT
        t.treatment_id,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        CONCAT(e.first_name, ' ', e.last_name) AS supervisor_name,
        LEFT(CAST(t.doctor_feedback AS VARCHAR(MAX)), 160) AS feedback_excerpt
      FROM Treatment t
      INNER JOIN Student s  ON s.academic_id = t.authored_by_student
      INNER JOIN Employee e ON e.employee_id = t.approved_by_doctor
      WHERE t.deleted_at IS NULL
        AND t.authored_by_student IS NOT NULL
        AND t.doctor_feedback IS NOT NULL
        AND DATALENGTH(t.doctor_feedback) > 0
        AND (@supervisorId IS NULL OR s.employee_id = @supervisorId)
      ORDER BY t.treatment_id DESC
    `);
  return result.recordset;
}

export interface SupervisorVolumeRow {
  supervisor_name: string;
  evaluation_count: number;
}

export async function getSupervisorEvaluationVolume(): Promise<SupervisorVolumeRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query<SupervisorVolumeRow>(`
    SELECT
      CONCAT(e.first_name, ' ', e.last_name) AS supervisor_name,
      COUNT(*) AS evaluation_count
    FROM Treatment t
    INNER JOIN Employee e ON e.employee_id = t.approved_by_doctor
    WHERE t.deleted_at IS NULL
      AND t.authored_by_student IS NOT NULL
      AND t.doctor_feedback IS NOT NULL
      AND DATALENGTH(t.doctor_feedback) > 0
    GROUP BY e.first_name, e.last_name
    ORDER BY evaluation_count DESC
  `);
  return result.recordset;
}
