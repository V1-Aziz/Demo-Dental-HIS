import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface AppointmentFilters {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  doctorId?: number;
  status?: string;
  search?: string;
  academicId?: number;
}

export async function getAppointments(
  filters: AppointmentFilters,
  limit: number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();
  const request = pool.request();

  let where = `WHERE a.deleted_at IS NULL`;

  if (filters.date) {
    request.input('date', sql.VarChar(20), filters.date);
    where += ` AND CAST(a.appointment_start_time AS DATE) = @date`;
  }
  if (filters.dateFrom) {
    request.input('dateFrom', sql.VarChar(20), filters.dateFrom);
    where += ` AND CAST(a.appointment_start_time AS DATE) >= @dateFrom`;
  }
  if (filters.dateTo) {
    request.input('dateTo', sql.VarChar(20), filters.dateTo);
    where += ` AND CAST(a.appointment_start_time AS DATE) <= @dateTo`;
  }
  if (filters.doctorId) {
    request.input('doctorId', sql.Int, filters.doctorId);
    where += ` AND a.doctor_id = @doctorId`;
  }
  if (filters.status) {
    request.input('status', sql.VarChar(20), filters.status);
    where += ` AND a.status = @status`;
  }
  if (filters.search) {
    request.input('search', sql.NVarChar(100), `%${filters.search}%`);
    where += ` AND (p.first_name + ' ' + p.middle_name + ' ' + p.last_name LIKE @search OR CAST(p.file_number AS VARCHAR) LIKE @search)`;
  }
  if (filters.academicId) {
    request.input('academicId', sql.Int, filters.academicId);
    where += ` AND a.academic_id = @academicId`;
  }

  request.input('limit', sql.Int, limit);
  request.input('offset', sql.Int, offset);

  const countReq = pool.request();
  if (filters.date)       countReq.input('date',       sql.VarChar(20),   filters.date);
  if (filters.dateFrom)   countReq.input('dateFrom',   sql.VarChar(20),   filters.dateFrom);
  if (filters.dateTo)     countReq.input('dateTo',     sql.VarChar(20),   filters.dateTo);
  if (filters.doctorId)   countReq.input('doctorId',   sql.Int,           filters.doctorId);
  if (filters.status)     countReq.input('status',     sql.VarChar(20),   filters.status);
  if (filters.search)     countReq.input('search',     sql.NVarChar(100), `%${filters.search}%`);
  if (filters.academicId) countReq.input('academicId', sql.Int,           filters.academicId);

  const countResult = await countReq.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM Appointments a
     JOIN Patients p ON p.patient_id = a.patient_id
     ${where}`,
  );

  const rows = await request.query(
    `SELECT a.appointment_id, a.appointment_start_time, a.appointment_end_time,
            a.status, at2.type_name, at2.type_name AS procedure_name,
            p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS patient_name,
            p.file_number,
            a.patient_id, a.doctor_id, a.appointment_type_id, a.academic_id,
            e.first_name + ' ' + e.last_name AS doctor_name,
            c.clinic_name,
            s.first_name + ' ' + s.last_name AS student_name,
            s.academic_level AS student_level
     FROM Appointments a
     JOIN Patients p ON p.patient_id = a.patient_id
     JOIN Employee e ON e.employee_id = a.doctor_id
     JOIN Appointment_Type at2 ON at2.type_id = a.appointment_type_id
     LEFT JOIN Clinic c ON c.clinic_id = a.clinic_id
     LEFT JOIN Student s ON s.academic_id = a.academic_id
     ${where}
     ORDER BY a.appointment_start_time
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export interface CreateAppointmentInput {
  patientId: number;
  doctorId: number;
  clinicId?: number;
  academicId?: number | null;
  appointmentTypeId: number;
  appointmentStartTime: string;
  appointmentEndTime: string;
  bookedBy?: number;
}

export interface UpdateAppointmentInput {
  doctorId: number;
  clinicId?: number;
  academicId?: number | null;
  appointmentTypeId: number;
  appointmentStartTime: string;
  appointmentEndTime: string;
}

export interface StudentForDropdown {
  academic_id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  academic_level: number;
  employee_id: number;
}

// Finds the active Medical_Records row for a patient, or creates one on the
// fly. Every appointment/diagnosis/treatment hangs off a record_id, so this
// helper is called on first booking to guarantee the FK exists.
export async function getOrCreatePatientRecord(patientId: number): Promise<number> {
  const pool = await getPool();
  const existing = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<{ record_id: number }>(
      `SELECT TOP 1 record_id FROM Medical_Records
       WHERE patient_id = @patientId AND deleted_at IS NULL
       ORDER BY record_id`,
    );
  if (existing.recordset.length) return existing.recordset[0].record_id;

  const inserted = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<{ record_id: number }>(
      `INSERT INTO Medical_Records (patient_id) OUTPUT INSERTED.record_id VALUES (@patientId)`,
    );
  return inserted.recordset[0].record_id;
}

export async function createAppointment(
  data: CreateAppointmentInput & { recordId: number },
): Promise<{ appointment_id: number }> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId',  sql.Int,      data.patientId)
    .input('doctorId',   sql.Int,      data.doctorId)
    .input('clinicId',   sql.Int,      data.clinicId ?? null)
    .input('academicId', sql.Int,      data.academicId ?? null)
    .input('recordId',   sql.Int,      data.recordId)
    .input('typeId',     sql.Int,      data.appointmentTypeId)
    .input('startTime',  sql.DateTime, new Date(data.appointmentStartTime))
    .input('endTime',    sql.DateTime, new Date(data.appointmentEndTime))
    .input('bookedBy',   sql.Int,      data.bookedBy ?? null)
    .query<{ appointment_id: number }>(
      `INSERT INTO Appointments
         (patient_id, doctor_id, clinic_id, academic_id, record_id, appointment_type_id,
          appointment_start_time, appointment_end_time, status, booked_by)
       OUTPUT INSERTED.appointment_id
       VALUES (@patientId, @doctorId, @clinicId, @academicId, @recordId, @typeId,
               @startTime, @endTime, 'Scheduled', @bookedBy)`,
    );
  return result.recordset[0];
}

export async function getAppointmentById(id: number): Promise<unknown | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(
      `SELECT a.appointment_id, a.appointment_start_time, a.appointment_end_time,
              a.status, a.clinic_id, a.doctor_id, a.appointment_type_id, a.academic_id,
              at2.type_name, at2.duration,
              a.patient_id,
              p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS patient_name,
              p.file_number,
              e.first_name + ' ' + e.last_name AS doctor_name,
              c.clinic_name,
              s.first_name + ' ' + s.last_name AS student_name,
              s.academic_level AS student_level
       FROM Appointments a
       JOIN Patients p          ON p.patient_id   = a.patient_id
       JOIN Employee e          ON e.employee_id  = a.doctor_id
       JOIN Appointment_Type at2 ON at2.type_id   = a.appointment_type_id
       LEFT JOIN Clinic c       ON c.clinic_id    = a.clinic_id
       LEFT JOIN Student s      ON s.academic_id  = a.academic_id
       WHERE a.appointment_id = @id AND a.deleted_at IS NULL`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

export async function updateAppointmentStatus(id: number, status: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('id',     sql.Int,        id)
    .input('status', sql.VarChar(20), status)
    .query(`UPDATE Appointments SET status = @status WHERE appointment_id = @id AND deleted_at IS NULL`);
}

// Only Scheduled appointments can be rescheduled — once the status moves to
// CheckedIn / InProgress / Completed / Canceled, the slot is frozen. The
// status clause in the WHERE enforces this at the DB layer so the update
// silently no-ops rather than mutating a completed appointment.
export async function updateAppointment(id: number, data: UpdateAppointmentInput): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('id',         sql.Int,      id)
    .input('doctorId',   sql.Int,      data.doctorId)
    .input('clinicId',   sql.Int,      data.clinicId ?? null)
    .input('academicId', sql.Int,      data.academicId ?? null)
    .input('typeId',     sql.Int,      data.appointmentTypeId)
    .input('startTime',  sql.DateTime, new Date(data.appointmentStartTime))
    .input('endTime',    sql.DateTime, new Date(data.appointmentEndTime))
    .query(
      `UPDATE Appointments
       SET doctor_id              = @doctorId,
           clinic_id              = @clinicId,
           academic_id            = @academicId,
           appointment_type_id    = @typeId,
           appointment_start_time = @startTime,
           appointment_end_time   = @endTime
       WHERE appointment_id = @id AND deleted_at IS NULL AND status = 'Scheduled'`,
    );
}

// Returns active appointment types for the booking UI.
// MIN(type_id) deduplicates rows from repeated seed runs.
export async function getAppointmentTypes(): Promise<unknown[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(
      `SELECT MIN(type_id) AS type_id, type_name, duration
       FROM Appointment_Type
       WHERE is_active = 1
       GROUP BY type_name, duration
       ORDER BY MIN(display_order), type_name`,
    );
  return result.recordset;
}

export async function getAppointmentTypeDuration(typeId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('typeId', sql.Int, typeId)
    .query<{ duration: number }>(
      `SELECT duration FROM Appointment_Type WHERE type_id = @typeId`,
    );
  return result.recordset.length ? result.recordset[0].duration : null;
}

export async function getDoctors(): Promise<unknown[]> {
  const pool = await getPool();
  const result = await pool.request().query(
    `SELECT MIN(e.employee_id) AS employee_id,
            e.first_name + ' ' + e.last_name AS doctor_name,
            e.specialization
     FROM Employee e
     JOIN Users u ON u.user_id = e.user_id
     JOIN Roles r ON r.role_id = u.role_id
     WHERE r.role_name = 'Doctor' AND e.deleted_at IS NULL AND u.account_status = 'Active'
     GROUP BY e.first_name + ' ' + e.last_name, e.specialization
     ORDER BY doctor_name`,
  );
  return result.recordset;
}

export async function getAppointmentsByDate(date: string): Promise<unknown[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('date', sql.VarChar(20), date)
    .query(
      `SELECT a.appointment_id, a.appointment_start_time, a.appointment_end_time,
              a.status,
              a.arrival_status, a.arrived_at,
              at2.type_name, at2.type_name AS procedure_name,
              p.patient_id,
              p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS patient_name,
              p.file_number, p.gender, p.date_of_birth,
              e.first_name + ' ' + e.last_name AS doctor_name,
              c.clinic_name
       FROM Appointments a
       JOIN Patients p ON p.patient_id = a.patient_id
       JOIN Employee e ON e.employee_id = a.doctor_id
       JOIN Appointment_Type at2 ON at2.type_id = a.appointment_type_id
       LEFT JOIN Clinic c ON c.clinic_id = a.clinic_id
       WHERE a.deleted_at IS NULL
         AND a.status != 'Canceled'
         AND CAST(a.appointment_start_time AS DATE) = @date
       ORDER BY a.appointment_start_time`,
    );
  return result.recordset;
}

export type ArrivalStatus = 'On Time' | 'Late' | 'No Show';

export interface ArrivalResult {
  appointment_id:       number;
  arrival_status:       ArrivalStatus | null;
  arrived_at:           Date | null;
  late_by_minutes:      number | null;
  appointment_start_time: Date;
}

// Marks patient arrival in a single atomic UPDATE so a concurrent second call
// (arrival_status IS NULL guard) returns rowsAffected = 0 → 409 Conflict.
// For No Show, arrived_at is left NULL per spec; the cascade to status = 'No Show'
// is done in the same statement to keep the two columns consistent.
export async function markArrival(
  id:            number,
  arrivalStatus: ArrivalStatus,
): Promise<{ updated: boolean; row: ArrivalResult | null }> {
  const pool = await getPool();

  const updateResult = await pool
    .request()
    .input('id',            sql.Int,         id)
    .input('arrivalStatus', sql.VarChar(20),  arrivalStatus)
    .query(
      `UPDATE Appointments
       SET arrival_status = @arrivalStatus,
           arrived_at     = CASE WHEN @arrivalStatus <> 'No Show' THEN GETUTCDATE() ELSE NULL END,
           status         = CASE WHEN @arrivalStatus = 'No Show'  THEN 'No Show'    ELSE status END
       WHERE appointment_id = @id
         AND deleted_at     IS NULL
         AND arrival_status IS NULL`,
    );

  if ((updateResult.rowsAffected[0] ?? 0) === 0) return { updated: false, row: null };

  const rowResult = await pool
    .request()
    .input('id', sql.Int, id)
    .query<ArrivalResult>(
      `SELECT appointment_id, arrival_status, arrived_at, appointment_start_time,
              CASE WHEN arrived_at IS NOT NULL
                   THEN DATEDIFF(MINUTE, appointment_start_time, arrived_at)
                   ELSE NULL
              END AS late_by_minutes
       FROM Appointments
       WHERE appointment_id = @id`,
    );

  return { updated: true, row: rowResult.recordset[0] ?? null };
}

// Clears the arrival mark.  For receptionists the update only succeeds within
// 5 minutes of marking (arrived_at IS NULL = No Show, always undoable).
// Admins bypass the time limit via @isAdmin = 1.
// If the cascade had flipped status to 'No Show', it is reverted to 'Scheduled'.
export async function clearArrival(
  id:      number,
  isAdmin: boolean,
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id',      sql.Int,  id)
    .input('isAdmin', sql.Bit,  isAdmin ? 1 : 0)
    .query(
      `UPDATE Appointments
       SET status         = CASE WHEN arrival_status = 'No Show' THEN 'Scheduled' ELSE status END,
           arrived_at     = NULL,
           arrival_status = NULL
       WHERE appointment_id = @id
         AND deleted_at     IS NULL
         AND arrival_status IS NOT NULL
         AND (
               @isAdmin = 1
            OR arrived_at IS NULL                                          -- No Show: always allow
            OR DATEDIFF(MINUTE, arrived_at, GETUTCDATE()) <= 5            -- On Time/Late: 5-min window
         )`,
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

export interface ArrivalDispatchInfo {
  appointment_id:         number;
  doctor_id:              number;
  academic_id:            number | null;
  section_id:             number | null;
  procedure_name:         string;
  patient_name:           string;
  file_number:            number;
  appointment_start_time: Date;
  arrival_status:         ArrivalStatus | null;
  arrived_at:             Date | null;
}

// Fetches all fields needed to build the arrival notification payload and
// resolve the recipient set (section fan-out + direct doctor/student).
export async function getArrivalDispatchInfo(
  id: number,
): Promise<ArrivalDispatchInfo | null> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query<ArrivalDispatchInfo>(
      `SELECT
         a.appointment_id,
         a.doctor_id,
         a.academic_id,
         at2.section_id,
         at2.type_name AS procedure_name,
         p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name AS patient_name,
         p.file_number,
         a.appointment_start_time,
         a.arrival_status,
         a.arrived_at
       FROM Appointments a
       JOIN Appointment_Type at2 ON at2.type_id  = a.appointment_type_id
       JOIN Patients p            ON p.patient_id = a.patient_id
       WHERE a.appointment_id = @id AND a.deleted_at IS NULL`,
    );
  return result.recordset[0] ?? null;
}

// ── Doctor Availability ───────────────────────────────────────────────────────

// Returns the doctor's recurring weekly working hours flattened to minutes
// since midnight — makes slot math trivial (e.g. 09:30 → 570). `day_of_week`
// follows SQL Server conventions but callers treat it like JS `Date.getDay()`;
// make sure the @@DATEFIRST setting matches between seeder and runtime.
export async function getDoctorWorkingSchedule(
  doctorId: number,
): Promise<{ day_of_week: number; start_minutes: number; end_minutes: number }[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('doctorId', sql.Int, doctorId)
    .query<{ day_of_week: number; start_minutes: number; end_minutes: number }>(
      `SELECT
         day_of_week,
         DATEPART(HOUR, start_time) * 60 + DATEPART(MINUTE, start_time) AS start_minutes,
         DATEPART(HOUR, end_time)   * 60 + DATEPART(MINUTE, end_time)   AS end_minutes
       FROM Doctor_Availability
       WHERE doctor_id = @doctorId AND is_active = 1`,
    );
  return result.recordset;
}

export async function getBookedMinutesPerDay(
  doctorId: number,
  startDate: string,
  endDate: string,
): Promise<{ day_num: number; booked_minutes: number }[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('doctorId',  sql.Int,        doctorId)
    .input('startDate', sql.VarChar(10), startDate)
    .input('endDate',   sql.VarChar(10), endDate)
    .query<{ day_num: number; booked_minutes: number }>(
      `SELECT
         DAY(appointment_start_time) AS day_num,
         SUM(DATEDIFF(MINUTE, appointment_start_time, appointment_end_time)) AS booked_minutes
       FROM Appointments
       WHERE doctor_id = @doctorId
         AND deleted_at IS NULL
         AND status != 'Canceled'
         AND CAST(appointment_start_time AS DATE) >= @startDate
         AND CAST(appointment_start_time AS DATE) <= @endDate
       GROUP BY DAY(appointment_start_time)`,
    );
  return result.recordset;
}

export async function getAppointmentsOnDate(
  doctorId: number,
  date: string,
): Promise<{ start_time: Date; end_time: Date }[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('doctorId', sql.Int,        doctorId)
    .input('date',     sql.VarChar(10), date)
    .query<{ start_time: Date; end_time: Date }>(
      `SELECT
         appointment_start_time AS start_time,
         appointment_end_time   AS end_time
       FROM Appointments
       WHERE doctor_id = @doctorId
         AND deleted_at IS NULL
         AND status != 'Canceled'
         AND CAST(appointment_start_time AS DATE) = @date`,
    );
  return result.recordset;
}

// ── Student helpers ───────────────────────────────────────────────────────────

export async function getStudentsForDropdown(supervisorId?: number): Promise<StudentForDropdown[]> {
  const pool = await getPool();
  const req  = pool.request();
  let where  = '';
  if (supervisorId) {
    req.input('supervisorId', sql.Int, supervisorId);
    where = 'WHERE s.employee_id = @supervisorId';
  }
  const result = await req.query<StudentForDropdown>(
    `SELECT s.academic_id, s.first_name, s.middle_name, s.last_name,
            s.academic_level, s.employee_id
     FROM Student s
     JOIN Users u ON u.user_id = s.user_id
     ${where}
     ORDER BY s.first_name, s.last_name`,
  );
  return result.recordset;
}

// Returns true when Student.employee_id matches the given doctorId.
export async function verifyStudentSupervisor(
  academicId: number,
  doctorId: number,
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('academicId', sql.Int, academicId)
    .input('doctorId',   sql.Int, doctorId)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM Student WHERE academic_id = @academicId AND employee_id = @doctorId`,
    );
  return result.recordset[0].cnt > 0;
}

export async function getAppointmentsOnDateForStudent(
  academicId: number,
  date: string,
): Promise<{ start_time: Date; end_time: Date }[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('academicId', sql.Int,        academicId)
    .input('date',       sql.VarChar(10), date)
    .query<{ start_time: Date; end_time: Date }>(
      `SELECT appointment_start_time AS start_time, appointment_end_time AS end_time
       FROM Appointments
       WHERE academic_id = @academicId
         AND deleted_at IS NULL
         AND status != 'Canceled'
         AND CAST(appointment_start_time AS DATE) = @date`,
    );
  return result.recordset;
}

export async function checkStudentSlotConflict(
  academicId: number,
  startTime: Date,
  endTime: Date,
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('academicId', sql.Int,      academicId)
    .input('startTime',  sql.DateTime, startTime)
    .input('endTime',    sql.DateTime, endTime)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM Appointments
       WHERE academic_id = @academicId
         AND deleted_at IS NULL
         AND status != 'Canceled'
         AND appointment_start_time < @endTime
         AND appointment_end_time   > @startTime`,
    );
  return result.recordset[0].cnt > 0;
}

// Classic interval-overlap predicate: two ranges [a,b) and [c,d) overlap iff
// a < d AND b > c. Canceled appointments free the slot; deleted_at excludes
// soft-deleted rows. Use half-open semantics: an appointment ending at 10:00
// does NOT conflict with one starting at 10:00.
export async function checkSlotConflict(
  doctorId: number,
  startTime: Date,
  endTime: Date,
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('doctorId',  sql.Int,      doctorId)
    .input('startTime', sql.DateTime, startTime)
    .input('endTime',   sql.DateTime, endTime)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM Appointments
       WHERE doctor_id = @doctorId
         AND deleted_at IS NULL
         AND status != 'Canceled'
         AND appointment_start_time < @endTime
         AND appointment_end_time   > @startTime`,
    );
  return result.recordset[0].cnt > 0;
}
