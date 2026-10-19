import sql from 'mssql';
import { getPool } from '../../config/db.config';
import { hashPassword } from '../../utils/password.util';
import { PendingRegistrationContact } from '../../types/pending-registration';
import * as repo from '../../repositories/pending-registration.repository';

export async function submitRegistration(data: {
  firstName:       string;
  middleName:      string;
  lastName:        string;
  civilId:         string;
  requestedRoleId: number;
  password:        string;
  contacts:        PendingRegistrationContact[];
}): Promise<{ registrationId: number }> {
  const role = await repo.getRoleById(data.requestedRoleId);
  if (!role) throw Object.assign(new Error('Role not found'), { code: 'ROLE_NOT_FOUND' });
  if (role.role_name === 'Admin') {
    throw Object.assign(new Error('Admin self-registration is not permitted'), { code: 'ADMIN_FORBIDDEN' });
  }

  const primaryContact = data.contacts.find(c => c.isPrimary);
  if (primaryContact?.contactType === 'Email') {
    const takenInUsers   = await repo.isEmailTakenInUsers(primaryContact.value);
    if (takenInUsers) throw Object.assign(new Error('Email already registered'), { code: 'EMAIL_TAKEN' });

    const takenInPending = await repo.isEmailTakenInPending(primaryContact.value);
    if (takenInPending) throw Object.assign(new Error('A pending registration with this email already exists'), { code: 'EMAIL_PENDING' });
  }

  const passwordHash = await hashPassword(data.password);

  const registrationId = await repo.insertPendingRegistration({
    firstName:       data.firstName,
    middleName:      data.middleName,
    lastName:        data.lastName,
    civilId:         data.civilId,
    requestedRoleId: data.requestedRoleId,
    passwordHash,
  });

  for (const contact of data.contacts) {
    await repo.insertPendingContact(registrationId, contact);
  }

  return { registrationId };
}

export async function listRegistrations(opts: {
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const { rows, total } = await repo.findPendingRegistrations(opts);

  const result = await Promise.all(
    rows.map(async row => {
      const contacts = await repo.findContactsByRegistrationId(row.registration_id);
      return mapRow(row, contacts);
    }),
  );
  return { rows: result, total };
}

export async function getRegistrationById(id: number) {
  const row = await repo.findPendingRegistrationById(id);
  if (!row) return null;
  const contacts = await repo.findContactsByRegistrationId(row.registration_id);
  return mapRow(row, contacts);
}

export async function getPendingCount(): Promise<number> {
  return repo.countPendingRegistrations();
}

export async function getRegisterableRoles() {
  return repo.getAllRolesExceptAdmin();
}

export async function approveRegistration(
  registrationId: number,
  adminUserId:     number,
  body: {
    supervisingEmployeeId?: number;
    hireDate?:              string;
    academicLevel?:         number;
  },
): Promise<void> {
  const row = await repo.findPendingRegistrationById(registrationId);
  if (!row) throw Object.assign(new Error('Registration not found'), { code: 'NOT_FOUND' });
  if (row.status !== 'Pending') throw Object.assign(new Error('Already reviewed'), { code: 'CONFLICT' });

  if (row.requested_role_name === 'Admin') {
    throw Object.assign(new Error('Admin accounts cannot be created via self-registration'), { code: 'FORBIDDEN' });
  }

  const contacts = await repo.findContactsByRegistrationId(registrationId);
  const primaryContact = contacts.find(c => c.is_primary);
  const primaryEmail   = primaryContact?.contact_type === 'Email' ? primaryContact.value : null;
  const email          = primaryEmail ?? `${row.civil_id}@his.najran.edu.sa`;

  if (primaryEmail) {
    const taken = await repo.isEmailTakenInUsers(primaryEmail);
    if (taken) throw Object.assign(new Error('Email already in use'), { code: 'EMAIL_TAKEN' });
  }

  if (row.requested_role_name === 'Student' && !body.supervisingEmployeeId) {
    throw Object.assign(new Error('supervisingEmployeeId is required for Student approvals'), { code: 'VALIDATION' });
  }

  const hireDate     = body.hireDate ?? new Date().toISOString().slice(0, 10);
  const academicLevel = body.academicLevel ?? 1;

  const pool = await getPool();
  const tx   = new sql.Transaction(pool);
  await tx.begin();

  try {
    const userId = await repo.insertUserInTransaction(tx, {
      email,
      passwordHash: row.password_hash,
      roleId:       row.requested_role_id,
    });

    const employeeId = await repo.insertEmployeeInTransaction(tx, {
      userId,
      firstName:      row.first_name,
      middleName:     row.middle_name,
      lastName:       row.last_name,
      specialization: row.requested_role_name,
      hireDate,
    });

    let academicId: number | null = null;
    if (row.requested_role_name === 'Student') {
      academicId = await repo.insertStudentInTransaction(tx, {
        userId,
        firstName:             row.first_name,
        middleName:            row.middle_name,
        lastName:              row.last_name,
        supervisingEmployeeId: body.supervisingEmployeeId!,
        academicLevel,
      });
    }

    for (const contact of contacts) {
      const isEmail = contact.contact_type === 'Email';
      await repo.insertContactInTransaction(tx, {
        employeeId,
        contactType:  contact.contact_type,
        email:        isEmail ? contact.value : null,
        phoneNumber:  isEmail ? null : contact.value,
      });
    }

    await repo.updatePendingRegistrationApproved(tx, {
      registrationId,
      reviewedBy:        adminUserId,
      createdUserId:     userId,
      createdEmployeeId: employeeId,
      createdAcademicId: academicId,
    });

    await repo.insertAuditLogInTransaction(tx, {
      userId:           adminUserId,
      eventType:        'REGISTRATION_APPROVED',
      eventDescription: 'Pending registration approved',
      details:          `Approved registration #${registrationId} for ${row.first_name} ${row.last_name} (${row.requested_role_name})`,
      operationStatus:  'Success',
    });

    await repo.insertNotificationInTransaction(tx, {
      userId,
      type:    'account.activated',
      title:   'Account activated',
      message: 'Your account has been approved by the administrator. You can now sign in.',
    });

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function rejectRegistration(
  registrationId: number,
  adminUserId:     number,
  reason:          string,
): Promise<void> {
  const row = await repo.findPendingRegistrationById(registrationId);
  if (!row) throw Object.assign(new Error('Registration not found'), { code: 'NOT_FOUND' });
  if (row.status !== 'Pending') throw Object.assign(new Error('Already reviewed'), { code: 'CONFLICT' });

  await repo.updatePendingRegistrationRejected({ registrationId, reviewedBy: adminUserId, reason });

  await repo.insertAuditLog({
    userId:           adminUserId,
    eventType:        'REGISTRATION_REJECTED',
    eventDescription: 'Pending registration rejected',
    details:          `Rejected registration #${registrationId} for ${row.first_name} ${row.last_name}. Reason: ${reason}`,
    operationStatus:  'Success',
  });
}

function mapRow(
  row: repo.PendingRegRow,
  contacts: repo.PendingContactRow[],
) {
  return {
    registrationId:    row.registration_id,
    firstName:         row.first_name,
    middleName:        row.middle_name,
    lastName:          row.last_name,
    civilId:           row.civil_id,
    requestedRoleId:   row.requested_role_id,
    requestedRoleName: row.requested_role_name,
    status:            row.status,
    submittedAt:       row.submitted_at,
    reviewedBy:        row.reviewed_by ?? undefined,
    reviewedAt:        row.reviewed_at ?? undefined,
    rejectionReason:   row.rejection_reason ?? undefined,
    contacts: contacts.map(c => ({
      contactType: c.contact_type,
      value:       c.value,
      isPrimary:   !!c.is_primary,
    })),
  };
}
