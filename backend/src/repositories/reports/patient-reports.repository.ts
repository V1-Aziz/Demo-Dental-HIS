// Read-only SQL for the Patient reports module.
// Feeds `GET /reports/patients/registrations` (new registrations + peak-day
// summary + weekly breakdown) and `GET /reports/patients/demographics`
// (age distribution + gender split + total). All queries filter out
// soft-deleted patients (`deleted_at IS NULL`). Date ranges are half-open
// on the upper bound: `created_at < DATEADD(DAY, 1, @endDate)` so the last
// day is fully included regardless of the stored time component.
import sql from 'mssql';
import { getPool } from '../../config/db.config';

export async function getNewRegistrationsSummary(startDate: string, endDate: string) {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<{ total: number; peakDay: string | null; peakDayCount: number | null }>(`
      SELECT
        COUNT(*) AS total,
        (SELECT TOP 1 CAST(created_at AS DATE) FROM Patients
         WHERE deleted_at IS NULL AND created_at >= @startDate AND created_at < DATEADD(DAY, 1, @endDate)
         GROUP BY CAST(created_at AS DATE) ORDER BY COUNT(*) DESC) AS peakDay,
        (SELECT TOP 1 COUNT(*) FROM Patients
         WHERE deleted_at IS NULL AND created_at >= @startDate AND created_at < DATEADD(DAY, 1, @endDate)
         GROUP BY CAST(created_at AS DATE) ORDER BY COUNT(*) DESC) AS peakDayCount
      FROM Patients
      WHERE deleted_at IS NULL AND created_at >= @startDate AND created_at < DATEADD(DAY, 1, @endDate)
    `);
  return result.recordset[0];
}

export async function getWeeklyRegistrations(startDate: string, endDate: string) {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<{ weekStart: Date; count: number }>(`
      SELECT
        DATEADD(WEEK, DATEDIFF(WEEK, 0, created_at), 0) AS weekStart,
        COUNT(*) AS count
      FROM Patients
      WHERE deleted_at IS NULL AND created_at >= @startDate AND created_at < DATEADD(DAY, 1, @endDate)
      GROUP BY DATEADD(WEEK, DATEDIFF(WEEK, 0, created_at), 0)
      ORDER BY weekStart
    `);
  return result.recordset;
}

export async function getRegistrationCountForPeriod(startDate: string, endDate: string): Promise<number> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM Patients
      WHERE deleted_at IS NULL AND created_at >= @startDate AND created_at < DATEADD(DAY, 1, @endDate)
    `);
  return result.recordset[0].total;
}

export async function getAgeDistribution() {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .query<{ ageGroup: string; count: number }>(`
      SELECT
        CASE
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) < 18 THEN '0-17'
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) BETWEEN 18 AND 29 THEN '18-29'
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) BETWEEN 30 AND 44 THEN '30-44'
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) BETWEEN 45 AND 59 THEN '45-59'
          ELSE '60+'
        END AS ageGroup,
        COUNT(*) AS count
      FROM Patients
      WHERE deleted_at IS NULL
      GROUP BY
        CASE
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) < 18 THEN '0-17'
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) BETWEEN 18 AND 29 THEN '18-29'
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) BETWEEN 30 AND 44 THEN '30-44'
          WHEN DATEDIFF(YEAR, date_of_birth, GETDATE()) BETWEEN 45 AND 59 THEN '45-59'
          ELSE '60+'
        END
      ORDER BY MIN(DATEDIFF(YEAR, date_of_birth, GETDATE()))
    `);
  return result.recordset;
}

export async function getGenderSplit() {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .query<{ gender: string; count: number }>(`
      SELECT gender, COUNT(*) AS count
      FROM Patients
      WHERE deleted_at IS NULL
      GROUP BY gender
    `);
  return result.recordset;
}

export async function getTotalPatients(): Promise<number> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .query<{ total: number }>(`
      SELECT COUNT(*) AS total FROM Patients WHERE deleted_at IS NULL
    `);
  return result.recordset[0].total;
}
