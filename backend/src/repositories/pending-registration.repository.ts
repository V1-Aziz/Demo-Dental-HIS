import sql from 'mssql';
import { getPool } from '../config/db.config';
import { PendingRegistrationContact } from '../types/pending-registration';

export interface PendingRegRow {
  registration_id:     number;
  first_name:          string;
  middle_name:         string;
  last_name:           string;
  civil_id:            string;
  requested_role_id:   number;
  requested_role_name: string;
  password_hash:       string;
  status:              string;
  submitted_at:        string;
  reviewed_by:         number | null;
  reviewed_at:         string | null;
  rejection_reason:    string | null;
  created_user_id:     number | null;
  created_employee_id: number | null;
  created_academic_id: number | null;
}

export interface PendingContactRow {
  pending_contact_id: number;
  registration_id:    number;
  contact_type:       string;
  value:              string;
  is_primary:         boolean;
}

export async function insertPendingRegistration(
  data: {
    firstName: string;
    middleName: string;
    lastName: string;
    civilId: string;
    requestedRoleId: number;
    passwordHash: string;
  },
): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('firstName',       sql.VarChar(100), data.firstName)
    .input('middleName',      sql.VarChar(100), data.middleName)
    .input('lastName',        sql.VarChar(100), data.lastName)
    .input('civilId',         sql.VarChar(20),  data.civilId)
    .input('requestedRoleId', sql.Int,          data.requestedRoleId)
    .input('passwordHash',    sql.VarChar(255), data.passwordHash)
    .query<{ registration_id: number }>(
      `INSERT INTO Pending_Registrations
         (first_name, middle_name, last_name, civil_id, requested_role_id, password_hash)
       OUTPUT INSERTED.registration_id
       VALUES (@firstName, @middleName, @lastName, @civilId, @requestedRoleId, @passwordHash)`,
    );
  return result.recordset[0].registration_id;
}

export async function insertPendingContact(
  registrationId: number,
  contact: PendingRegistrationContact,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('registrationId', sql.Int,          registrationId)
    .input('contactType',    sql.VarChar(50),  contact.contactType)
    .input('value',          sql.VarChar(255), contact.value)
    .input('isPrimary',      sql.Bit,          contact.isPrimary ? 1 : 0)
    .query(
      `INSERT INTO Pending_Registration_Contacts (registration_id, contact_type, value, is_primary)
       VALUES (@registrationId, @contactType, @value, @isPrimary)`,
    );
}

export async function findPendingRegistrations(opts: {
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: PendingRegRow[]; total: number }> {
  const pool   = await getPool();
  const limit  = opts.limit  ?? 50;
  const offset = opts.offset ?? 0;

  let where = 'WHERE 1=1';
  const req = pool.request()
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset);

  if (opts.status && opts.status !== 'All') {
    where += ' AND pr.status = @status';
    req.input('status', sql.VarChar(20), opts.status);
  }
  if (opts.q) {
    where += ` AND (pr.first_name + ' ' + pr.middle_name + ' ' + pr.last_name LIKE @q OR pr.civil_id LIKE @q)`;
    req.input('q', sql.NVarChar(255), `%${opts.q}%`);
  }

  const countResult = await req.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM Pending_Registrations pr ${where}`,
  );

  const rows = await pool
    .request()
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .input('status', sql.VarChar(20),  opts.status && opts.status !== 'All' ? opts.status : null)
    .input('q',      sql.NVarChar(255), opts.q ? `%${opts.q}%` : null)
    .query<PendingRegRow>(`
      SELECT pr.registration_id, pr.first_name, pr.middle_name, pr.last_name,
             pr.civil_id, pr.requested_role_id, r.role_name AS requested_role_name,
             pr.password_hash, pr.status, pr.submitted_at,
             pr.reviewed_by, pr.reviewed_at, pr.rejection_reason,
             pr.created_user_id, pr.created_employee_id, pr.created_academic_id
      FROM Pending_Registrations pr
      JOIN Roles r ON r.role_id = pr.requested_role_id
      WHERE (@status IS NULL OR pr.status = @status)
        AND (@q      IS NULL OR pr.first_name + ' ' + pr.middle_name + ' ' + pr.last_name LIKE @q OR pr.civil_id LIKE @q)
      ORDER BY pr.submitted_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function findPendingRegistrationById(id: number): Promise<PendingRegRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query<PendingRegRow>(`
      SELECT pr.registration_id, pr.first_name, pr.middle_name, pr.last_name,
             pr.civil_id, pr.requested_role_id, r.role_name AS requested_role_name,
             pr.password_hash, pr.status, pr.submitted_at,
             pr.reviewed_by, pr.reviewed_at, pr.rejection_reason,
             pr.created_user_id, pr.created_employee_id, pr.created_academic_id
      FROM Pending_Registrations pr
      JOIN Roles r ON r.role_id = pr.requested_role_id
      WHERE pr.registration_id = @id
    `);
  return result.recordset[0] ?? null;
}

export async function findContactsByRegistrationId(
  registrationId: number,
): Promise<PendingContactRow[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('registrationId', sql.Int, registrationId)
    .query<PendingContactRow>(
      `SELECT pending_contact_id, registration_id, contact_type, value,
              CAST(is_primary AS BIT) AS is_primary
       FROM Pending_Registration_Contacts
       WHERE registration_id = @registrationId`,
    );
  return result.recordset;
}

export async function countPendingRegistrations(): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM Pending_Registrations WHERE status = 'Pending'`,
    );
  return result.recordset[0].count;
}

export async function getRoleById(
  roleId: number,
): Promise<{ role_id: number; role_name: string } | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('roleId', sql.Int, roleId)
    .query<{ role_id: number; role_name: string }>(
      `SELECT role_id, role_name FROM Roles WHERE role_id = @roleId`,
    );
  return result.recordset[0] ?? null;
}

export async function getAllRolesExceptAdmin(): Promise<{ role_id: number; role_name: string }[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<{ role_id: number; role_name: string }>(
      `SELECT role_id, role_name FROM Roles WHERE role_name <> 'Admin' ORDER BY role_name`,
    );
  return result.recordset;
}

export async function isEmailTakenInUsers(email: string): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM Users WHERE email = @email`);
  return result.recordset[0].cnt > 0;
}

export async function isEmailTakenInPending(email: string): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('email', sql.NVarChar(255), email)
    .query<{ cnt: number }>(`
      SELECT COUNT(*) AS cnt
      FROM Pending_Registrations pr
      JOIN Pending_Registration_Contacts prc ON prc.registration_id = pr.registration_id
      WHERE prc.contact_type = 'Email'
        AND prc.value = @email
        AND prc.is_primary = 1
        AND pr.status = 'Pending'
    `);
  return result.recordset[0].cnt > 0;
}

export async function insertUserInTransaction(
  tx: sql.Transaction,
  data: { email: string; passwordHash: string; roleId: number },
): Promise<number> {
  const result = await tx
    .request()
    .input('email',        sql.NVarChar(255), data.email)
    .input('passwordHash', sql.VarChar(255),  data.passwordHash)
    .input('roleId',       sql.Int,           data.roleId)
    .query<{ user_id: number }>(
      `INSERT INTO Users (email, password, role_id, account_status, last_login)
       OUTPUT INSERTED.user_id
       VALUES (@email, @passwordHash, @roleId, 'Active', GETUTCDATE())`,
    );
  return result.recordset[0].user_id;
}

export async function insertEmployeeInTransaction(
  tx: sql.Transaction,
  data: {
    userId: number;
    firstName: string;
    middleName: string;
    lastName: string;
    specialization: string;
    hireDate: string;
  },
): Promise<number> {
  const result = await tx
    .request()
    .input('userId',         sql.Int,          data.userId)
    .input('firstName',      sql.VarChar(100), data.firstName)
    .input('middleName',     sql.VarChar(100), data.middleName)
    .input('lastName',       sql.VarChar(100), data.lastName)
    .input('specialization', sql.VarChar(100), data.specialization)
    .input('hireDate',       sql.Date,         data.hireDate)
    .query<{ employee_id: number }>(
      `INSERT INTO Employee (user_id, first_name, middle_name, last_name, specialization, hire_date)
       OUTPUT INSERTED.employee_id
       VALUES (@userId, @firstName, @middleName, @lastName, @specialization, @hireDate)`,
    );
  return result.recordset[0].employee_id;
}

export async function insertStudentInTransaction(
  tx: sql.Transaction,
  data: {
    userId: number;
    firstName: string;
    middleName: string;
    lastName: string;
    supervisingEmployeeId: number;
    academicLevel: number;
  },
): Promise<number> {
  const result = await tx
    .request()
    .input('userId',                sql.Int,          data.userId)
    .input('firstName',             sql.VarChar(100), data.firstName)
    .input('middleName',            sql.VarChar(100), data.middleName)
    .input('lastName',              sql.VarChar(100), data.lastName)
    .input('supervisingEmployeeId', sql.Int,          data.supervisingEmployeeId)
    .input('academicLevel',         sql.Int,          data.academicLevel)
    .query<{ academic_id: number }>(
      `INSERT INTO Student (user_id, first_name, middle_name, last_name, employee_id, academic_level)
       OUTPUT INSERTED.academic_id
       VALUES (@userId, @firstName, @middleName, @lastName, @supervisingEmployeeId, @academicLevel)`,
    );
  return result.recordset[0].academic_id;
}

export async function insertContactInTransaction(
  tx: sql.Transaction,
  data: {
    employeeId: number;
    contactType: string;
    email: string | null;
    phoneNumber: string | null;
  },
): Promise<void> {
  await tx
    .request()
    .input('employeeId',  sql.Int,          data.employeeId)
    .input('contactType', sql.NVarChar(50), data.contactType)
    .input('email',       sql.NVarChar(255), data.email)
    .input('phoneNumber', sql.NVarChar(50),  data.phoneNumber)
    .query(
      `INSERT INTO Contact_Information (employee_id, owner_type, contact_type, email, phone_number)
       VALUES (@employeeId, 'Employee', @contactType, @email, @phoneNumber)`,
    );
}

export async function insertAuditLogInTransaction(
  tx: sql.Transaction,
  data: {
    userId: number;
    eventType: string;
    eventDescription: string;
    details: string;
    operationStatus: string;
  },
): Promise<void> {
  await tx
    .request()
    .input('userId',           sql.Int,          data.userId)
    .input('eventType',        sql.NVarChar(50), data.eventType)
    .input('eventDescription', sql.NVarChar(200),data.eventDescription)
    .input('details',          sql.NVarChar(500),data.details.slice(0, 500))
    .input('operationStatus',  sql.NVarChar(20), data.operationStatus)
    .query(
      `INSERT INTO Audit_Log (user_id, event_type, event_description, details, operation_status)
       VALUES (@userId, @eventType, @eventDescription, @details, @operationStatus)`,
    );
}

export async function insertNotificationInTransaction(
  tx: sql.Transaction,
  data: { userId: number; type: string; title: string; message: string },
): Promise<void> {
  await tx
    .request()
    .input('userId',  sql.Int,          data.userId)
    .input('type',    sql.NVarChar(60), data.type)
    .input('title',   sql.NVarChar(120),data.title)
    .input('message', sql.NVarChar(500),data.message)
    .query(
      `INSERT INTO Notifications (user_id, type, title, message)
       VALUES (@userId, @type, @title, @message)`,
    );
}

export async function updatePendingRegistrationApproved(
  tx: sql.Transaction,
  data: {
    registrationId:    number;
    reviewedBy:        number;
    createdUserId:     number;
    createdEmployeeId: number;
    createdAcademicId: number | null;
  },
): Promise<void> {
  await tx
    .request()
    .input('registrationId',    sql.Int, data.registrationId)
    .input('reviewedBy',        sql.Int, data.reviewedBy)
    .input('createdUserId',     sql.Int, data.createdUserId)
    .input('createdEmployeeId', sql.Int, data.createdEmployeeId)
    .input('createdAcademicId', sql.Int, data.createdAcademicId)
    .query(
      `UPDATE Pending_Registrations
       SET status              = 'Approved',
           reviewed_by         = @reviewedBy,
           reviewed_at         = GETUTCDATE(),
           created_user_id     = @createdUserId,
           created_employee_id = @createdEmployeeId,
           created_academic_id = @createdAcademicId
       WHERE registration_id = @registrationId`,
    );
}

export async function updatePendingRegistrationRejected(
  data: {
    registrationId: number;
    reviewedBy:     number;
    reason:         string;
  },
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('registrationId', sql.Int,          data.registrationId)
    .input('reviewedBy',     sql.Int,          data.reviewedBy)
    .input('reason',         sql.VarChar(500), data.reason)
    .query(
      `UPDATE Pending_Registrations
       SET status           = 'Rejected',
           reviewed_by      = @reviewedBy,
           reviewed_at      = GETUTCDATE(),
           rejection_reason = @reason
       WHERE registration_id = @registrationId`,
    );
}

export async function insertAuditLog(data: {
  userId: number;
  eventType: string;
  eventDescription: string;
  details: string;
  operationStatus: string;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('userId',           sql.Int,          data.userId)
    .input('eventType',        sql.NVarChar(50), data.eventType)
    .input('eventDescription', sql.NVarChar(200),data.eventDescription)
    .input('details',          sql.NVarChar(500),data.details.slice(0, 500))
    .input('operationStatus',  sql.NVarChar(20), data.operationStatus)
    .query(
      `INSERT INTO Audit_Log (user_id, event_type, event_description, details, operation_status)
       VALUES (@userId, @eventType, @eventDescription, @details, @operationStatus)`,
    );
}
