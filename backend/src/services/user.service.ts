import sql from 'mssql';
import { getPool } from '../config/db.config';
import {
  getUsers, getEmployees, getRoles, updateUserById,
  getUserProfileById, updateUserAccountById, UserProfile,
} from '../repositories/user.repository';
import {
  findContactsByOwner, insertContactForOwner, updateContactForOwner,
  deleteContactsForOwner, ContactOwner, ContactRow,
} from '../repositories/contact.repository';

export async function listUsersService(search: string, limit: number, offset: number) {
  return getUsers(search, limit, offset);
}

export async function listEmployeesService(search: string) {
  return getEmployees(search);
}

export async function listRolesService() {
  return getRoles();
}

export async function updateUserService(userId: number, roleId: number, accountStatus: string) {
  return updateUserById(userId, roleId, accountStatus);
}

// ─────────────────────────────────────────────────────────────────────────────

export interface UpsertContactEntry {
  contact_id?: number;
  contact_type: string;
  email: string;
  phone_number: string;
}

export interface UpdateUserPayload {
  account?: {
    email?: string;
    role_id?: number;
    account_status?: string;
  };
  contacts?: {
    upsert: UpsertContactEntry[];
    delete: number[];
  };
}

export async function getUserContactsService(
  userId: number,
): Promise<{ profile: UserProfile; contacts: ContactRow[] } | null> {
  const profile = await getUserProfileById(userId);
  if (!profile) return null;
  if (!profile.owner_type || !profile.owner_id) {
    return { profile, contacts: [] };
  }
  const owner: ContactOwner = { type: profile.owner_type, id: profile.owner_id };
  const contacts = await findContactsByOwner(owner);
  return { profile, contacts };
}

export async function updateUserWithContacts(
  userId: number,
  payload: UpdateUserPayload,
  actingAdminId: number,
): Promise<{ user: UserProfile; contacts: ContactRow[] }> {
  const current = await getUserProfileById(userId);
  if (!current) throw Object.assign(new Error('User not found'), { status: 404 });
  if (!current.owner_type || !current.owner_id) {
    throw Object.assign(new Error('User has no profile record'), { status: 404 });
  }

  const owner: ContactOwner = { type: current.owner_type, id: current.owner_id };

  // Pre-flight: in-payload duplicate check
  if (payload.contacts?.upsert?.length) {
    const upsert = payload.contacts.upsert;
    const emails = upsert.map(u => u.email.toLowerCase());
    const phones = upsert.map(u => normalizePhone(u.phone_number));
    if (new Set(emails).size !== emails.length) {
      throw Object.assign(new Error('Duplicate email in payload'), { status: 400, code: 'DUPLICATE_IN_PAYLOAD' });
    }
    if (new Set(phones).size !== phones.length) {
      throw Object.assign(new Error('Duplicate phone in payload'), { status: 400, code: 'DUPLICATE_IN_PAYLOAD' });
    }
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  const auditEntries: Array<{ event_type: string; event_description: string; details: string }> = [];

  try {
    // Account changes
    if (payload.account) {
      const acct = payload.account;
      const fields: { email?: string; roleId?: number; accountStatus?: string } = {};

      if (acct.email !== undefined && acct.email !== current.email) {
        fields.email = acct.email;
        auditEntries.push({
          event_type: 'USER_EMAIL_CHANGED',
          event_description: 'Login email changed',
          details: JSON.stringify({ old: current.email, new: acct.email }),
        });
      }
      if (acct.role_id !== undefined && acct.role_id !== current.role_id) {
        fields.roleId = acct.role_id;
        auditEntries.push({
          event_type: 'USER_ROLE_CHANGED',
          event_description: 'Role changed',
          details: JSON.stringify({ old: current.role_id, new: acct.role_id }),
        });
      }
      if (acct.account_status !== undefined && acct.account_status !== current.account_status) {
        fields.accountStatus = acct.account_status;
        auditEntries.push({
          event_type: 'USER_STATUS_CHANGED',
          event_description: 'Account status changed',
          details: JSON.stringify({ old: current.account_status, new: acct.account_status }),
        });
      }

      await updateUserAccountById(userId, fields, transaction);
    }

    // Contact deletes
    if (payload.contacts?.delete?.length) {
      await deleteContactsForOwner(owner, payload.contacts.delete, transaction);
      for (const cid of payload.contacts.delete) {
        auditEntries.push({
          event_type: 'USER_CONTACT_REMOVED',
          event_description: 'Contact removed',
          details: JSON.stringify({ contact_id: cid }),
        });
      }
    }

    // Contact upserts
    if (payload.contacts?.upsert?.length) {
      for (const entry of payload.contacts.upsert) {
        const data = {
          contact_type: entry.contact_type,
          email: entry.email,
          phone_number: normalizePhone(entry.phone_number),
        };

        if (entry.contact_id) {
          const updated = await updateContactForOwner(owner, entry.contact_id, data, transaction);
          if (!updated) {
            throw Object.assign(
              new Error(`Contact ${entry.contact_id} not found for this user`),
              { status: 404 },
            );
          }
          auditEntries.push({
            event_type: 'USER_CONTACT_UPDATED',
            event_description: 'Contact updated',
            details: JSON.stringify({ contact_id: entry.contact_id }),
          });
        } else {
          const inserted = await insertContactForOwner(owner, data, transaction);
          auditEntries.push({
            event_type: 'USER_CONTACT_ADDED',
            event_description: 'Contact added',
            details: JSON.stringify({ contact_id: inserted.contact_id, contact_type: inserted.contact_type }),
          });
        }
      }
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  // Fire-and-forget audit entries (after commit)
  if (auditEntries.length > 0) {
    getPool().then(p => {
      for (const entry of auditEntries) {
        p.request()
          .input('userId', sql.Int, actingAdminId)
          .input('eventType', sql.NVarChar(50), entry.event_type)
          .input('eventDescription', sql.NVarChar(255), entry.event_description)
          .input('details', sql.NVarChar(500), entry.details.slice(0, 500))
          .input('operationStatus', sql.NVarChar(20), 'Success')
          .query(
            `INSERT INTO Audit_Log (user_id, patient_id, event_type, event_description, details, operation_status)
             VALUES (@userId, NULL, @eventType, @eventDescription, @details, @operationStatus)`,
          )
          .catch(err => console.error('[AUDIT]', err));
      }
    }).catch(err => console.error('[AUDIT POOL]', err));
  }

  const freshProfile = await getUserProfileById(userId);
  const freshContacts = await findContactsByOwner(owner);
  return { user: freshProfile!, contacts: freshContacts };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('966') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('05') && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `+966${digits}`;
  return phone.trim();
}
