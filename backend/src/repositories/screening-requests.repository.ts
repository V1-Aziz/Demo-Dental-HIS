// Raw parameterized SQL for the Screening_Requests table.
// All business logic lives in screening-requests.service.ts.
import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface ScreeningRequestRow {
  request_id:              number;
  record_id:               number;
  patient_id:              number;
  appointment_id:          number | null;
  requested_by_user_id:    number;
  assigned_radiologist_id: number;  // Employee.employee_id
  request_status:          string;
  requested_at:            string;
  completed_at:            string | null;
  fulfilled_image_id:      number | null;
}

export interface ScreeningRequestDetail extends ScreeningRequestRow {
  patient_full_name:      string;
  requester_name:         string;
  appointment_time:       string | null;
  appointment_status:     string | null;
  doctor_full_name:       string | null;
}

export interface InsertScreeningRequestInput {
  recordId:              number;
  patientId:             number;
  appointmentId:         number | null;
  requestedByUserId:     number;
  assignedRadiologistId: number;  // Employee.employee_id
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function insertScreeningRequest(
  data: InsertScreeningRequestInput,
): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',              sql.Int, data.recordId)
    .input('patientId',             sql.Int, data.patientId)
    .input('appointmentId',         sql.Int, data.appointmentId)
    .input('requestedByUserId',     sql.Int, data.requestedByUserId)
    .input('assignedRadiologistId', sql.Int, data.assignedRadiologistId)
    .query<{ request_id: number }>(
      `INSERT INTO Screening_Requests
         (record_id, patient_id, appointment_id, requested_by_user_id,
          assigned_radiologist_id, request_status, requested_at)
       OUTPUT INSERTED.request_id
       VALUES (@recordId, @patientId, @appointmentId, @requestedByUserId,
               @assignedRadiologistId, 'Pending', GETUTCDATE())`,
    );
  return result.recordset[0].request_id;
}

export async function cancelScreeningRequest(requestId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('requestId', sql.Int, requestId)
    .query(
      `UPDATE Screening_Requests
       SET    request_status = 'Cancelled'
       WHERE  request_id    = @requestId
         AND  request_status = 'Pending'`,
    );
}

// Marks a pending request as Completed and links the fulfilled image.
// Uses a transaction so the status flip and image link are atomic.
export async function fulfillScreeningRequest(
  requestId:        number,
  fulfilledImageId: number,
): Promise<void> {
  const pool = await getPool();
  const txn = pool.transaction();
  await txn.begin();
  try {
    await txn
      .request()
      .input('requestId',        sql.Int, requestId)
      .input('fulfilledImageId', sql.Int, fulfilledImageId)
      .query(
        `UPDATE Screening_Requests
         SET    request_status    = 'Completed',
                completed_at      = GETUTCDATE(),
                fulfilled_image_id = @fulfilledImageId
         WHERE  request_id       = @requestId
           AND  request_status   = 'Pending'`,
      );
    await txn.commit();
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function findScreeningRequestById(
  requestId: number,
): Promise<ScreeningRequestRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('requestId', sql.Int, requestId)
    .query<ScreeningRequestRow>(
      `SELECT TOP 1 request_id, record_id, patient_id, appointment_id,
              requested_by_user_id, assigned_radiologist_id, request_status,
              requested_at, completed_at, fulfilled_image_id
       FROM   Screening_Requests
       WHERE  request_id = @requestId`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

export async function findScreeningRequestsByRecord(
  recordId: number,
): Promise<ScreeningRequestDetail[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId', sql.Int, recordId)
    .query<ScreeningRequestDetail>(
      `SELECT
         sr.request_id, sr.record_id, sr.patient_id, sr.appointment_id,
         sr.requested_by_user_id, sr.assigned_radiologist_id,
         sr.request_status, sr.requested_at, sr.completed_at, sr.fulfilled_image_id,
         RTRIM(LTRIM(p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name)) AS patient_full_name,
         ISNULL(RTRIM(LTRIM(ru.first_name + ' ' + ru.last_name)), 'Unknown') AS requester_name,
         CONVERT(VARCHAR(5), a.appointment_start_time, 108)                  AS appointment_time,
         a.status                                                             AS appointment_status,
         'Dr. ' + RTRIM(LTRIM(de.first_name + ' ' + de.last_name))          AS doctor_full_name
       FROM      Screening_Requests sr
       JOIN      Patients p          ON p.patient_id = sr.patient_id
       OUTER APPLY (
         SELECT TOP 1 e2.first_name, e2.last_name
         FROM   Employee e2
         WHERE  e2.user_id = sr.requested_by_user_id AND e2.deleted_at IS NULL
         ORDER BY e2.employee_id
       ) ru
       LEFT JOIN Appointments a      ON a.appointment_id = sr.appointment_id
       LEFT JOIN Employee de         ON de.employee_id   = a.doctor_id AND de.deleted_at IS NULL
       WHERE sr.record_id = @recordId
       ORDER BY sr.requested_at DESC`,
    );
  return result.recordset;
}

// Returns pending requests assigned to a specific radiologist (by employee_id).
export async function findPendingRequestsByRadiologist(
  radiologistEmployeeId: number,
  limit: number,
  offset: number,
): Promise<ScreeningRequestDetail[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('radiologistId', sql.Int, radiologistEmployeeId)
    .input('limit',         sql.Int, limit)
    .input('offset',        sql.Int, offset)
    .query<ScreeningRequestDetail>(
      `SELECT
         sr.request_id, sr.record_id, sr.patient_id, sr.appointment_id,
         sr.requested_by_user_id, sr.assigned_radiologist_id,
         sr.request_status, sr.requested_at, sr.completed_at, sr.fulfilled_image_id,
         RTRIM(LTRIM(p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name)) AS patient_full_name,
         ISNULL(RTRIM(LTRIM(ru.first_name + ' ' + ru.last_name)), 'Unknown') AS requester_name,
         CONVERT(VARCHAR(5), a.appointment_start_time, 108)                  AS appointment_time,
         a.status                                                             AS appointment_status,
         'Dr. ' + RTRIM(LTRIM(de.first_name + ' ' + de.last_name))          AS doctor_full_name
       FROM      Screening_Requests sr
       JOIN      Patients p          ON p.patient_id = sr.patient_id
       OUTER APPLY (
         SELECT TOP 1 e2.first_name, e2.last_name
         FROM   Employee e2
         WHERE  e2.user_id = sr.requested_by_user_id AND e2.deleted_at IS NULL
         ORDER BY e2.employee_id
       ) ru
       LEFT JOIN Appointments a      ON a.appointment_id = sr.appointment_id
       LEFT JOIN Employee de         ON de.employee_id   = a.doctor_id AND de.deleted_at IS NULL
       WHERE sr.assigned_radiologist_id = @radiologistId
         AND sr.request_status          = 'Pending'
       ORDER BY sr.requested_at ASC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );
  return result.recordset;
}

// Finds a pending request matching (patient, appointment, radiologist user_id).
// Used by the upload service to auto-complete matching requests on upload.
export async function findPendingRequestForPatientAppointmentAndRadiologist(
  patientId:            number,
  appointmentId:        number,
  radiologistUserId:    number,
): Promise<ScreeningRequestRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId',     sql.Int, patientId)
    .input('appointmentId', sql.Int, appointmentId)
    .input('userId',        sql.Int, radiologistUserId)
    .query<ScreeningRequestRow>(
      `SELECT TOP 1
         sr.request_id, sr.record_id, sr.patient_id, sr.appointment_id,
         sr.requested_by_user_id, sr.assigned_radiologist_id,
         sr.request_status, sr.requested_at, sr.completed_at, sr.fulfilled_image_id
       FROM   Screening_Requests sr
       JOIN   Employee e ON e.employee_id = sr.assigned_radiologist_id
                        AND e.user_id     = @userId
                        AND e.deleted_at IS NULL
       WHERE  sr.patient_id     = @patientId
         AND  sr.appointment_id = @appointmentId
         AND  sr.request_status = 'Pending'
       ORDER BY sr.requested_at ASC`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// Checks for any non-cancelled/non-completed request for (patient, appointment).
// Used to enforce the 1-pending-request-per-patient-appointment rule.
export async function findActiveRequestForPatientAppointment(
  patientId:     number,
  appointmentId: number | null,
): Promise<ScreeningRequestRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId',     sql.Int, patientId)
    .input('appointmentId', sql.Int, appointmentId)
    .query<ScreeningRequestRow>(
      `SELECT TOP 1
         request_id, record_id, patient_id, appointment_id,
         requested_by_user_id, assigned_radiologist_id,
         request_status, requested_at, completed_at, fulfilled_image_id
       FROM  Screening_Requests
       WHERE patient_id     = @patientId
         AND appointment_id = @appointmentId
         AND request_status NOT IN ('Cancelled', 'Completed')`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

// Returns the employee_id of the least-loaded active radiologist.
// Ties broken by smallest employee_id.  Wrapped in a transaction in the
// service so the lookup + insert are atomic against race conditions.
export async function findLeastLoadedRadiologist(): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<{ employee_id: number }>(
      `SELECT TOP 1 e.employee_id
       FROM   Employee e
       JOIN   Users    u ON u.user_id  = e.user_id
       JOIN   Roles    r ON r.role_id  = u.role_id
       WHERE  r.role_name       = 'Radiologist'
         AND  u.account_status  = 'Active'
         AND  e.termination_date IS NULL
         AND  e.deleted_at IS NULL
       ORDER BY
         (
           SELECT COUNT(*)
           FROM   Screening_Requests sr
           WHERE  sr.assigned_radiologist_id = e.employee_id
             AND  sr.request_status          = 'Pending'
             AND  CAST(sr.requested_at AS DATE) = CAST(GETUTCDATE() AS DATE)
         ) ASC,
         e.employee_id ASC`,
    );
  return result.recordset.length ? result.recordset[0].employee_id : null;
}

// Returns the user_id for a radiologist given their employee_id.
export async function getRadiologistUserIdByEmployeeId(
  employeeId: number,
): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('employeeId', sql.Int, employeeId)
    .query<{ user_id: number }>(
      `SELECT TOP 1 user_id FROM Employee WHERE employee_id = @employeeId AND deleted_at IS NULL`,
    );
  return result.recordset.length ? result.recordset[0].user_id : null;
}

// Returns the employee_id for a user_id (used when radiologist uploads).
export async function getEmployeeIdByUserId(userId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query<{ employee_id: number }>(
      `SELECT TOP 1 employee_id FROM Employee WHERE user_id = @userId AND deleted_at IS NULL ORDER BY employee_id`,
    );
  return result.recordset.length ? result.recordset[0].employee_id : null;
}
