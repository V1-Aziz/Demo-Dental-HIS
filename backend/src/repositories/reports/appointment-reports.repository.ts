// Read-only SQL for the Appointment reports module.
// Feeds `GET /reports/appointments/attendance` (completed / no-show /
// canceled counts + weekly trend), `/occupancy` (per-doctor + per-clinic
// booking load), and `/clinics` (lookup for the filter dropdown). All
// queries exclude soft-deleted appointments and treat status values as
// case-sensitive enum strings — always match the values allowed by the
// CK_Appointments_Status constraint in database/schema.sql.
import sql from 'mssql';
import { getPool } from '../../config/db.config';

export interface AttendanceSummaryRow {
  total_appointments: number;
  completed_count: number;
  no_show_count: number;
  canceled_count: number;
  completed_pct: number | null;
  no_show_pct: number | null;
  canceled_pct: number | null;
}

export interface AttendanceWeeklyRow {
  year: number;
  week_number: number;
  week_start: Date;
  completed: number;
  no_show: number;
  canceled: number;
  scheduled: number;
}

export interface ClinicOccupancyRow {
  clinic_id: number;
  clinic_name: string;
  booked_slots: number;
  busiest_doctor: string | null;
}

export interface ClinicRow {
  clinic_id: number;
  clinic_name: string;
}

export async function getAttendanceSummary(
  startDate: string,
  endDate: string,
  clinicId?: number | null,
): Promise<AttendanceSummaryRow> {
  const pool = await getPool();
  const request = new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('clinicId', sql.Int, clinicId ?? null);

  const result = await request.query<AttendanceSummaryRow>(`
    SELECT
      COUNT(*) AS total_appointments,
      SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN a.status = 'No Show' THEN 1 ELSE 0 END) AS no_show_count,
      SUM(CASE WHEN a.status = 'Canceled' THEN 1 ELSE 0 END) AS canceled_count,
      CAST(
        SUM(CASE WHEN a.status = 'Completed' THEN 1.0 ELSE 0 END) * 100.0 /
        NULLIF(COUNT(*), 0)
      AS DECIMAL(5,1)) AS completed_pct,
      CAST(
        SUM(CASE WHEN a.status = 'No Show' THEN 1.0 ELSE 0 END) * 100.0 /
        NULLIF(COUNT(*), 0)
      AS DECIMAL(5,1)) AS no_show_pct,
      CAST(
        SUM(CASE WHEN a.status = 'Canceled' THEN 1.0 ELSE 0 END) * 100.0 /
        NULLIF(COUNT(*), 0)
      AS DECIMAL(5,1)) AS canceled_pct
    FROM Appointments a
    WHERE a.deleted_at IS NULL
      AND a.appointment_start_time >= @startDate
      AND a.appointment_start_time < DATEADD(DAY, 1, @endDate)
      AND (@clinicId IS NULL OR a.clinic_id = @clinicId)
  `);

  return result.recordset[0];
}

export async function getAttendanceWeekly(
  startDate: string,
  endDate: string,
  clinicId?: number | null,
): Promise<AttendanceWeeklyRow[]> {
  const pool = await getPool();
  const request = new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('clinicId', sql.Int, clinicId ?? null);

  const result = await request.query<AttendanceWeeklyRow>(`
    SELECT
      DATEPART(YEAR, a.appointment_start_time) AS year,
      DATEPART(WEEK, a.appointment_start_time) AS week_number,
      MIN(CAST(a.appointment_start_time AS DATE)) AS week_start,
      SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN a.status = 'No Show' THEN 1 ELSE 0 END) AS no_show,
      SUM(CASE WHEN a.status = 'Canceled' THEN 1 ELSE 0 END) AS canceled,
      SUM(CASE WHEN a.status = 'Scheduled' THEN 1 ELSE 0 END) AS scheduled
    FROM Appointments a
    WHERE a.deleted_at IS NULL
      AND a.appointment_start_time >= @startDate
      AND a.appointment_start_time < DATEADD(DAY, 1, @endDate)
      AND (@clinicId IS NULL OR a.clinic_id = @clinicId)
    GROUP BY DATEPART(YEAR, a.appointment_start_time), DATEPART(WEEK, a.appointment_start_time)
    ORDER BY year, week_number
  `);

  return result.recordset;
}

export async function getClinicOccupancyRows(
  startDate: string,
  endDate: string,
): Promise<ClinicOccupancyRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<ClinicOccupancyRow>(`
      SELECT
        c.clinic_id,
        c.clinic_name,
        COUNT(a.appointment_id) AS booked_slots,
        (
          SELECT TOP 1 CONCAT(e.first_name, ' ', e.last_name)
          FROM Appointments a2
          INNER JOIN Employee e ON e.employee_id = a2.doctor_id
          WHERE a2.clinic_id = c.clinic_id
            AND a2.deleted_at IS NULL
            AND a2.appointment_start_time >= @startDate
            AND a2.appointment_start_time < DATEADD(DAY, 1, @endDate)
          GROUP BY e.employee_id, e.first_name, e.last_name
          ORDER BY COUNT(*) DESC
        ) AS busiest_doctor
      FROM Clinic c
      LEFT JOIN Appointments a ON a.clinic_id = c.clinic_id
        AND a.deleted_at IS NULL
        AND a.appointment_start_time >= @startDate
        AND a.appointment_start_time < DATEADD(DAY, 1, @endDate)
      GROUP BY c.clinic_id, c.clinic_name
      ORDER BY booked_slots DESC
    `);

  return result.recordset;
}

export async function getClinicsForFilter(): Promise<ClinicRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query<ClinicRow>(`
    SELECT clinic_id, clinic_name FROM Clinic ORDER BY clinic_name
  `);
  return result.recordset;
}
