// /audit and /users — mirrors audit.routes.ts, user.routes.ts, user.service.ts,
// user.repository.ts and contact.repository.ts.
import { DemoRouter, ok, badRequest, notFound, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { localDate } from '../data/time';
import { audit, like, roleName, userById } from '../helpers';

const CONTACT_TYPES = ['Primary', 'Work', 'Secondary', 'Emergency'];
const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Suspended'];

function activeEmployeeName(db: DemoDb, userId: number): string | null {
  const e = db.tables.Employee.find(x => x.user_id === userId && !x.deleted_at);
  return e ? `${e.first_name} ${e.last_name}` : null;
}

interface Profile {
  user_id: number; email: string; role_id: number; role_name: string | null; account_status: string;
  full_name: string; owner_type: 'Employee' | 'Student' | null; owner_id: number | null;
}

function profile(db: DemoDb, userId: number): Profile | null {
  const u = userById(db, userId);
  if (!u) return null;
  const e = db.tables.Employee.find(x => x.user_id === userId && !x.deleted_at);
  const s = db.tables.Student.find(x => x.user_id === userId);
  return {
    user_id: u.user_id,
    email: u.email,
    role_id: u.role_id,
    role_name: roleName(db, u.role_id),
    account_status: u.account_status,
    full_name: e ? `${e.first_name} ${e.last_name}` : s ? `${s.first_name} ${s.last_name}` : u.email,
    owner_type: e ? 'Employee' : s ? 'Student' : null,
    owner_id: e ? e.employee_id : s ? s.academic_id : null,
  };
}

function ownerCol(p: Profile): 'employee_id' | 'student_id' {
  return p.owner_type === 'Employee' ? 'employee_id' : 'student_id';
}

function contactsOf(db: DemoDb, p: Profile): Row[] {
  const col = ownerCol(p);
  return db.tables.Contact_Information
    .filter(c => c[col] === p.owner_id)
    .map(c => ({ contact_id: c.contact_id, contact_type: c.contact_type, email: c.email, phone_number: c.phone_number }));
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('966') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('05') && digits.length === 10) return `+966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `+966${digits}`;
  return phone.trim();
}

function isSaudiPhone(phone: string): boolean {
  return /^\+966 ?5\d{1} ?\d{3} ?\d{4}$/.test(phone.trim()) || /^05\d{1} ?\d{3} ?\d{4}$/.test(phone.trim());
}

export function registerAudit(r: DemoRouter): void {
  r.get('/audit', ['Admin'], ({ query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = String(query['search'] ?? '');
    const role = String(query['role'] ?? '');
    const action = String(query['action'] ?? '');
    const date = String(query['date'] ?? '');
    const all = db.tables.Audit_Log
      .map(a => ({ a, u: userById(db, a.user_id) }))
      .filter(({ a, u }) => {
        if (!u) return false;
        if (!(like(a.event_type, search) || like(a.event_description, search) || like(a.details, search))) return false;
        if (role && roleName(db, u.role_id) !== role) return false;
        if (action && !like(a.event_type, action)) return false;
        if (date && localDate(a.timestamp) !== date) return false;
        return true;
      })
      .sort((x, y) => y.a.timestamp.localeCompare(x.a.timestamp));
    const rows = all.slice(offset, offset + limit).map(({ a, u }) => ({
      event_id: a.event_id,
      event_type: a.event_type,
      event_description: a.event_description,
      details: a.details,
      operation_status: a.operation_status,
      timestamp: a.timestamp,
      user_email: u!.email,
      role_name: roleName(db, u!.role_id),
      patient_id: a.patient_id,
    }));
    return ok({ rows, total: all.length, page, limit });
  });
}

export function registerUsers(r: DemoRouter): void {
  r.get('/users', ['Admin'], ({ query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = String(query['search'] ?? '');
    const all = [...db.tables.Users]
      .filter(u => like(u.email, search) || like(roleName(db, u.role_id), search) || like(activeEmployeeName(db, u.user_id) ?? '', search))
      .sort((a, b) => a.user_id - b.user_id);
    const rows = all.slice(offset, offset + limit).map(u => ({
      user_id: u.user_id,
      email: u.email,
      account_status: u.account_status,
      created_at: u.created_at,
      last_login: u.last_login,
      role_name: roleName(db, u.role_id),
      full_name: activeEmployeeName(db, u.user_id) ?? '',
    }));
    return ok({ rows, total: all.length, page, limit });
  });

  r.get('/users/roles', ['Admin'], ({ db }) =>
    ok({ roles: [...db.tables.Roles].sort((a, b) => a.role_id - b.role_id).map(x => ({ role_id: x.role_id, role_name: x.role_name })) }));

  r.get('/users/employees', ['Admin', 'InventoryManager'], ({ query, db }) => {
    const search = String(query['search'] ?? '');
    const groups = new Map<string, Row>();
    for (const e of db.tables.Employee.filter(x => !x.deleted_at)) {
      const u = userById(db, e.user_id);
      if (!u || u.account_status !== 'Active') continue;
      const name = `${e.first_name} ${e.last_name}`;
      const role = roleName(db, u.role_id);
      if (!like(name, search) && !like(role, search)) continue;
      const key = `${u.user_id}|${name}|${role}`;
      const g = groups.get(key);
      if (!g) groups.set(key, { user_id: u.user_id, employee_id: e.employee_id, full_name: name, role_name: role });
      else g['employee_id'] = Math.min(g['employee_id'], e.employee_id);
    }
    return ok({ rows: [...groups.values()].sort((a, b) => a['full_name'].localeCompare(b['full_name'])) });
  });

  r.get('/users/:id/contacts', ['Admin'], ({ params, db }) => {
    const userId = parseInt(params['id'], 10);
    if (!userId || isNaN(userId)) return badRequest('Invalid user id');
    const p = profile(db, userId);
    if (!p) return notFound('User not found');
    return ok({ contacts: p.owner_type ? contactsOf(db, p) : [] });
  });

  r.patch('/users/:id', ['Admin'], ({ user, params, body, db }) => {
    const userId = parseInt(params['id'], 10);
    if (!userId || isNaN(userId)) return badRequest('Invalid user id');
    const account = body?.account;
    const contacts = body?.contacts;

    if (account !== undefined) {
      if (account.email !== undefined && (typeof account.email !== 'string' || account.email.length > 255 || !account.email.includes('@'))) {
        return badRequest('account.email must be a valid email address');
      }
      if (account.role_id !== undefined && typeof account.role_id !== 'number') return badRequest('account.role_id must be a number');
      if (account.account_status !== undefined && !ACCOUNT_STATUSES.includes(account.account_status)) {
        return badRequest(`account.account_status must be one of: ${ACCOUNT_STATUSES.join(', ')}`);
      }
    }
    const upsert: any[] = Array.isArray(contacts?.upsert) ? contacts.upsert : [];
    const del: any[] = Array.isArray(contacts?.delete) ? contacts.delete : [];
    for (let i = 0; i < upsert.length; i++) {
      const c = upsert[i];
      if (!c?.contact_type || !CONTACT_TYPES.includes(c.contact_type)) {
        return badRequest(`contacts.upsert[${i}].contact_type must be one of: ${CONTACT_TYPES.join(', ')}`);
      }
      if (!c.email || typeof c.email !== 'string' || !c.email.includes('@')) return badRequest(`contacts.upsert[${i}].email must be a valid email`);
      if (!c.phone_number || typeof c.phone_number !== 'string') return badRequest(`contacts.upsert[${i}].phone_number is required`);
      if (!isSaudiPhone(c.phone_number)) {
        return badRequest(`contacts.upsert[${i}].phone_number is invalid (expected Saudi format, e.g. 0512 345 6789)`);
      }
    }
    for (let i = 0; i < del.length; i++) {
      if (typeof del[i] !== 'number' || del[i] < 1) return badRequest(`contacts.delete[${i}] must be a positive integer`);
    }

    const current = profile(db, userId);
    if (!current) return notFound('User not found');
    if (!current.owner_type || !current.owner_id) return notFound('User has no profile record');
    if (upsert.length) {
      const emails = upsert.map(c => c.email.toLowerCase());
      const phones = upsert.map(c => normalizePhone(c.phone_number));
      if (new Set(emails).size !== emails.length) return badRequest('Duplicate email in payload');
      if (new Set(phones).size !== phones.length) return badRequest('Duplicate phone in payload');
    }

    const col = ownerCol(current);
    for (const entry of upsert.filter(c => c.contact_id)) {
      if (!db.tables.Contact_Information.some(c => c.contact_id === entry.contact_id && c[col] === current.owner_id)) {
        return notFound(`Contact ${entry.contact_id} not found for this user`);
      }
    }

    const entries: { type: string; description: string; details: string }[] = [];
    const u = userById(db, userId)!;
    if (account) {
      if (account.email !== undefined && account.email !== current.email) {
        u.email = account.email;
        entries.push({ type: 'USER_EMAIL_CHANGED', description: 'Login email changed', details: JSON.stringify({ old: current.email, new: account.email }) });
      }
      if (account.role_id !== undefined && account.role_id !== current.role_id) {
        u.role_id = account.role_id;
        entries.push({ type: 'USER_ROLE_CHANGED', description: 'Role changed', details: JSON.stringify({ old: current.role_id, new: account.role_id }) });
      }
      if (account.account_status !== undefined && account.account_status !== current.account_status) {
        u.account_status = account.account_status;
        entries.push({ type: 'USER_STATUS_CHANGED', description: 'Account status changed', details: JSON.stringify({ old: current.account_status, new: account.account_status }) });
      }
    }
    if (del.length) {
      db.delete('Contact_Information', c => c[col] === current.owner_id && del.includes(c.contact_id));
      for (const cid of del) entries.push({ type: 'USER_CONTACT_REMOVED', description: 'Contact removed', details: JSON.stringify({ contact_id: cid }) });
    }
    for (const entry of upsert) {
      const data = { contact_type: entry.contact_type, email: entry.email, phone_number: normalizePhone(entry.phone_number) };
      if (entry.contact_id) {
        Object.assign(db.tables.Contact_Information.find(c => c.contact_id === entry.contact_id)!, data);
        entries.push({ type: 'USER_CONTACT_UPDATED', description: 'Contact updated', details: JSON.stringify({ contact_id: entry.contact_id }) });
      } else {
        const inserted = db.insert('Contact_Information', { [col]: current.owner_id, owner_type: current.owner_type, ...data });
        entries.push({ type: 'USER_CONTACT_ADDED', description: 'Contact added', details: JSON.stringify({ contact_id: inserted.contact_id, contact_type: inserted.contact_type }) });
      }
    }
    db.save();
    for (const e of entries) audit(db, user, e.type, e.description, e.details);

    const fresh = profile(db, userId)!;
    return ok({ user: fresh, contacts: contactsOf(db, fresh) }, 'User updated');
  });
}

