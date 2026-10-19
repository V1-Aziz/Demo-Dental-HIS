import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface LabFilters {
  employeeId?: number;
  studentId?:  number;
  patientId?:  number;
  status?:     string;
  search?:     string;
  // LabTechnician queue scoping
  queue?:      'incoming' | 'my_work' | 'history';
  techEmployeeId?: number;   // required when queue is set
}

export interface CreateLabRequestInput {
  studentId:            number | null;
  supervisorEmployeeId: number;
  patientId:            number;
  requestNote:          string;
  toothNumber:          string | null;
}

export async function getLabRequests(
  filters: LabFilters,
  limit:   number,
  offset:  number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool     = await getPool();
  const request  = pool.request();
  const countReq = pool.request();

  let where = `WHERE 1=1`;

  // ── LabTechnician queue filters (mutually exclusive with employeeId filter) ──
  if (filters.queue && filters.techEmployeeId) {
    request.input('techEmpId',  sql.Int, filters.techEmployeeId);
    countReq.input('techEmpId', sql.Int, filters.techEmployeeId);

    if (filters.queue === 'incoming') {
      // Unassigned requests that are ready to be claimed
      where += ` AND lr.assigned_to IS NULL AND lr.request_status IN ('Pending', 'Approved')`;
    } else if (filters.queue === 'my_work') {
      // Requests this tech has claimed and is working on
      where += ` AND lr.assigned_to = @techEmpId AND lr.request_status = 'In Progress'`;
    } else if (filters.queue === 'history') {
      // Requests this tech completed
      where += ` AND lr.assigned_to = @techEmpId AND lr.request_status = 'Delivered'`;
    }
  } else {
    // Doctor / Student scoping (unchanged)
    if (filters.employeeId) {
      request.input('employeeId',  sql.Int, filters.employeeId);
      countReq.input('employeeId', sql.Int, filters.employeeId);
      where += ` AND lr.employee_id = @employeeId`;
    }
    if (filters.studentId) {
      request.input('studentId',  sql.Int, filters.studentId);
      countReq.input('studentId', sql.Int, filters.studentId);
      where += ` AND lr.student_id = @studentId`;
    }
  }

  if (filters.patientId) {
    request.input('patientId',  sql.Int, filters.patientId);
    countReq.input('patientId', sql.Int, filters.patientId);
    where += ` AND lr.patient_id = @patientId`;
  }
  if (filters.status) {
    request.input('status',  sql.VarChar(20), filters.status);
    countReq.input('status', sql.VarChar(20), filters.status);
    where += ` AND lr.request_status = @status`;
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    request.input('search',  sql.NVarChar(100), term);
    countReq.input('search', sql.NVarChar(100), term);
    where += ` AND (
      CAST(lr.lab_request_id AS VARCHAR) LIKE @search
      OR p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name LIKE @search
      OR CAST(p.file_number AS VARCHAR) LIKE @search
    )`;
  }

  request.input('limit',  sql.Int, limit);
  request.input('offset', sql.Int, offset);

  const countResult = await countReq.query<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM Lab_Requests lr
     LEFT JOIN Patients p ON p.patient_id = lr.patient_id
     ${where}`,
  );

  const rows = await request.query(
    `SELECT
       lr.lab_request_id,
       lr.request_timestamp,
       lr.request_note,
       lr.tooth_number,
       lr.request_status,
       lr.supervisor_feedback,
       lr.reviewed_at,
       lr.assigned_to,
       lr.assigned_at,
       lr.student_id AS student_academic_id,
       CASE WHEN lr.student_id IS NULL THEN 'doctor' ELSE 'student' END AS requester_kind,
       CASE
         WHEN lr.student_id IS NULL THEN sup.first_name + ' ' + sup.last_name
         ELSE st.first_name  + ' ' + st.last_name
       END AS requester_name,
       ISNULL(p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name, '—') AS patient_name,
       p.file_number AS patient_file_no
     FROM Lab_Requests lr
     JOIN  Employee sup ON sup.employee_id = lr.employee_id
     LEFT JOIN Student  st  ON st.academic_id = lr.student_id
     LEFT JOIN Patients p   ON p.patient_id   = lr.patient_id
     ${where}
     ORDER BY lr.request_timestamp DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function claimLabRequest(
  id:         number,
  employeeId: number,
): Promise<boolean> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('id',         sql.Int, id)
    .input('employeeId', sql.Int, employeeId)
    .query(
      `UPDATE Lab_Requests
       SET assigned_to    = @employeeId,
           assigned_at    = GETUTCDATE(),
           request_status = 'In Progress'
       WHERE lab_request_id = @id
         AND assigned_to IS NULL
         AND request_status IN ('Pending', 'Approved')`,
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function createLabRequest(
  data: CreateLabRequestInput,
): Promise<{ lab_request_id: number }> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('employeeId',  sql.Int,            data.supervisorEmployeeId)
    .input('studentId',   sql.Int,            data.studentId)
    .input('patientId',   sql.Int,            data.patientId)
    .input('approvedBy',  sql.Int,            data.supervisorEmployeeId)
    .input('requestNote', sql.NVarChar(500),  data.requestNote)
    .input('toothNumber', sql.NVarChar(20),   data.toothNumber ?? null)
    .query<{ lab_request_id: number }>(
      `INSERT INTO Lab_Requests
         (employee_id, student_id, patient_id, approved_by, request_note, tooth_number, request_status)
       OUTPUT INSERTED.lab_request_id
       VALUES (@employeeId, @studentId, @patientId, @approvedBy, @requestNote, @toothNumber, 'Pending')`,
    );
  return result.recordset[0];
}

export async function reviewLabRequest(
  id:                 number,
  status:             'Approved' | 'Rejected',
  supervisorFeedback: string | null,
  doctorEmployeeId:   number,
): Promise<boolean> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('id',                 sql.Int,           id)
    .input('status',             sql.VarChar(20),   status)
    .input('supervisorFeedback', sql.NVarChar(500), supervisorFeedback ?? null)
    .input('doctorEmployeeId',   sql.Int,           doctorEmployeeId)
    .query(
      `UPDATE Lab_Requests
       SET request_status      = @status,
           supervisor_feedback = @supervisorFeedback,
           reviewed_at         = GETUTCDATE()
       WHERE lab_request_id = @id
         AND employee_id    = @doctorEmployeeId
         AND student_id     IS NOT NULL
         AND request_status = 'Pending'`,
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function updateLabRequestStatus(
  id:         number,
  status:     string,
  employeeId: number,
): Promise<boolean> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('id',         sql.Int,         id)
    .input('status',     sql.VarChar(20), status)
    .input('employeeId', sql.Int,         employeeId)
    .query(
      `UPDATE Lab_Requests
       SET request_status = @status,
           assigned_to    = ISNULL(assigned_to, @employeeId),
           assigned_at    = CASE WHEN assigned_to IS NULL THEN GETUTCDATE() ELSE assigned_at END
       WHERE lab_request_id = @id
         AND (assigned_to = @employeeId OR assigned_to IS NULL)`,
    );
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function createLabResponse(
  labRequestId: number,
  responseNote: string,
): Promise<{ lab_response_id: number }> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('labRequestId',  sql.Int,           labRequestId)
    .input('responseNote',  sql.NVarChar(500), responseNote)
    .query<{ lab_response_id: number }>(
      `INSERT INTO Lab_Response (lab_request_id, response_note)
       OUTPUT INSERTED.lab_response_id
       VALUES (@labRequestId, @responseNote)`,
    );
  return result.recordset[0];
}

export async function getLabRequestById(
  id:        number,
  studentId: number | null,
): Promise<unknown | null> {
  const pool    = await getPool();
  const request = pool.request().input('id', sql.Int, id);

  let scopeClause = '';
  if (studentId !== null) {
    request.input('studentId', sql.Int, studentId);
    scopeClause = 'AND lr.student_id = @studentId';
  }

  const result = await request.query(
    `SELECT
       lr.lab_request_id,
       lr.request_timestamp,
       lr.request_note,
       lr.tooth_number,
       lr.request_status,
       lr.supervisor_feedback,
       lr.reviewed_at,
       lr.assigned_to,
       lr.assigned_at,
       lr.student_id AS student_academic_id,
       CASE WHEN lr.student_id IS NULL THEN 'Doctor' ELSE 'Student' END AS submitted_by_role,
       CASE WHEN lr.student_id IS NULL THEN 'doctor' ELSE 'student' END AS requester_kind,
       CASE
         WHEN lr.student_id IS NULL THEN emp.first_name + ' ' + emp.last_name
         ELSE st.first_name + ' ' + st.last_name
       END AS submitted_by_name,
       CASE
         WHEN lr.student_id IS NULL THEN emp.first_name + ' ' + emp.last_name
         ELSE st.first_name + ' ' + st.last_name
       END AS requester_name,
       CASE
         WHEN lr.request_status IN ('Approved', 'In Progress', 'Delivered')
         THEN appr.first_name + ' ' + appr.last_name
         ELSE NULL
       END AS approved_by_name,
       ISNULL(p.first_name + ' ' + ISNULL(p.middle_name + ' ', '') + p.last_name, '—') AS patient_name,
       p.file_number AS patient_file_no,
       resp.response_note AS lab_response_note
     FROM Lab_Requests lr
     JOIN  Employee emp  ON emp.employee_id  = lr.employee_id
     LEFT JOIN Student  st   ON st.academic_id  = lr.student_id
     LEFT JOIN Employee appr ON appr.employee_id = lr.approved_by
     LEFT JOIN Patients p    ON p.patient_id     = lr.patient_id
     LEFT JOIN Lab_Response resp ON resp.lab_request_id = lr.lab_request_id
     WHERE lr.lab_request_id = @id
     ${scopeClause}`,
  );
  return result.recordset[0] ?? null;
}
