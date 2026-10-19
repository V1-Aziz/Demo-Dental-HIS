// Raw parameterized SQL for the Radiologist-specific endpoints.
// Computed age is derived server-side; date_of_birth is NEVER returned.
import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface RadiologistPatientRow {
  patient_id:  number;
  first_name:  string;
  last_name:   string;
  gender:      string;
  age:         number;
  file_number: string | null;
}

export interface RadiologistAppointmentRow {
  appointment_id:         number;
  appointment_start_time: string;
  appointment_time:       string;  // HH:MM
  doctor_name:            string;
  clinic_name:            string;
  status:                 string;
}

export interface DashboardCards {
  patientsNeedingScreeningToday: number;
  screeningsUploadedToday:       number;
  patientsScheduledToday:        number;
}

export interface DashboardPendingRow {
  request_id:             number;
  patient_id:             number;
  patient_full_name:      string;
  appointment_start_time: string;
  appointment_status:     string;
  doctor_full_name:       string;
  requested_at:           string;
}

// Age expression reused across queries — avoids storing DOB in the result set.
const AGE_EXPR = `DATEDIFF(YEAR, p.date_of_birth, GETUTCDATE())
  - CASE
      WHEN (MONTH(p.date_of_birth) > MONTH(GETUTCDATE()))
        OR (MONTH(p.date_of_birth) = MONTH(GETUTCDATE()) AND DAY(p.date_of_birth) > DAY(GETUTCDATE()))
      THEN 1 ELSE 0
    END`;

// ─── Patient list ─────────────────────────────────────────────────────────────

// Returns patients who have at least one Scheduled or Completed appointment
// in the same-day UTC window.  date_of_birth is never selected.
export async function findRadiologistPatients(): Promise<RadiologistPatientRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<RadiologistPatientRow>(
      `SELECT DISTINCT
         p.patient_id,
         p.first_name,
         p.last_name,
         p.gender,
         ${AGE_EXPR} AS age,
         p.file_number
       FROM   Patients p
       JOIN   Appointments a ON a.patient_id = p.patient_id
       WHERE  a.deleted_at IS NULL
         AND  a.status IN ('Scheduled', 'Completed')
         AND  CAST(a.appointment_start_time AS DATE) = CAST(GETUTCDATE() AS DATE)
       ORDER BY p.last_name, p.first_name`,
    );
  return result.recordset;
}

// Returns minimal detail for one patient — no DOB.
export async function findRadiologistPatientById(
  patientId: number,
): Promise<RadiologistPatientRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<RadiologistPatientRow>(
      `SELECT TOP 1
         p.patient_id,
         p.first_name,
         p.last_name,
         p.gender,
         ${AGE_EXPR} AS age,
         p.file_number
       FROM   Patients p
       WHERE  p.patient_id = @patientId`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// ─── Today's appointments for a patient ──────────────────────────────────────

export async function findTodaysAppointmentsForPatient(
  patientId: number,
): Promise<RadiologistAppointmentRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<RadiologistAppointmentRow>(
      `SELECT
         a.appointment_id,
         CONVERT(VARCHAR(23), a.appointment_start_time, 126) AS appointment_start_time,
         CONVERT(VARCHAR(5),  a.appointment_start_time, 108) AS appointment_time,
         ISNULL('Dr. ' + RTRIM(LTRIM(e.first_name + ' ' + e.last_name)), 'Unknown') AS doctor_name,
         ISNULL(c.clinic_name, 'Unknown Clinic')                                    AS clinic_name,
         a.status
       FROM      Appointments a
       LEFT JOIN Employee e ON e.employee_id = a.doctor_id AND e.deleted_at IS NULL
       LEFT JOIN Clinic   c ON c.clinic_id   = a.clinic_id
       WHERE a.patient_id = @patientId
         AND a.deleted_at IS NULL
         AND a.status IN ('Scheduled', 'Completed')
         AND CAST(a.appointment_start_time AS DATE) = CAST(GETUTCDATE() AS DATE)
       ORDER BY a.appointment_start_time ASC`,
    );
  return result.recordset;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardCards(
  radiologistEmployeeId: number,
): Promise<DashboardCards> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('empId', sql.Int, radiologistEmployeeId)
    .query<DashboardCards>(
      `SELECT
         -- Patients with pending screening requests assigned to me today
         (SELECT COUNT(DISTINCT sr.patient_id)
          FROM   Screening_Requests sr
          WHERE  sr.assigned_radiologist_id = @empId
            AND  sr.request_status          = 'Pending'
            AND  CAST(sr.requested_at AS DATE) = CAST(GETUTCDATE() AS DATE)
         ) AS patientsNeedingScreeningToday,

         -- Screenings I uploaded today
         (SELECT COUNT(*)
          FROM   Screening s
          JOIN   Employee  e ON e.employee_id = @empId
          WHERE  s.uploaded_by   = e.user_id
            AND  s.deleted_at IS NULL
            AND  CAST(s.uploaded_at AS DATE) = CAST(GETUTCDATE() AS DATE)
         ) AS screeningsUploadedToday,

         -- Patients with same-day appointments linked to my pending requests
         (SELECT COUNT(DISTINCT a.patient_id)
          FROM   Appointments a
          JOIN   Screening_Requests sr ON sr.appointment_id = a.appointment_id
          WHERE  sr.assigned_radiologist_id = @empId
            AND  a.status IN ('Scheduled', 'Completed')
            AND  CAST(a.appointment_start_time AS DATE) = CAST(GETUTCDATE() AS DATE)
         ) AS patientsScheduledToday`,
    );
  return result.recordset[0] ?? {
    patientsNeedingScreeningToday: 0,
    screeningsUploadedToday: 0,
    patientsScheduledToday: 0,
  };
}

export async function getDashboardTopPending(
  radiologistEmployeeId: number,
): Promise<DashboardPendingRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('empId', sql.Int, radiologistEmployeeId)
    .query<DashboardPendingRow>(
      `SELECT TOP 5
         sr.request_id,
         sr.patient_id,
         RTRIM(LTRIM(p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name)) AS patient_full_name,
         CONVERT(VARCHAR(23), a.appointment_start_time, 126)                               AS appointment_start_time,
         ISNULL(a.status, 'Unknown')                                                       AS appointment_status,
         ISNULL('Dr. ' + RTRIM(LTRIM(de.first_name + ' ' + de.last_name)), 'Unknown')     AS doctor_full_name,
         CONVERT(VARCHAR(23), sr.requested_at, 126)                                        AS requested_at
       FROM      Screening_Requests sr
       JOIN      Patients   p  ON p.patient_id    = sr.patient_id
       LEFT JOIN Appointments a ON a.appointment_id = sr.appointment_id
       LEFT JOIN Employee de    ON de.employee_id   = a.doctor_id AND de.deleted_at IS NULL
       WHERE sr.assigned_radiologist_id = @empId
         AND sr.request_status          = 'Pending'
       ORDER BY sr.requested_at DESC`,
    );
  return result.recordset;
}
