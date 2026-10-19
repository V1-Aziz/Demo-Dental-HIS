// Shared helpers for the demo API handlers: lookups that many endpoints need,
// plus ports of the backend's notification dispatch and audit logging.
import { DemoDb } from './db';
import { Row } from './data/schema';
import { DemoUser } from './router';
import { now } from './data/time';

export const ALL_ROLES = [
  'Admin', 'Doctor', 'Student', 'Receptionist',
  'LabTechnician', 'DentalAssistant', 'InventoryManager', 'Radiologist',
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function roleName(db: DemoDb, roleId: number): string | null {
  return db.tables.Roles.find(r => r.role_id === roleId)?.role_name ?? null;
}

export function userById(db: DemoDb, userId: number | null | undefined): Row | undefined {
  return db.tables.Users.find(u => u.user_id === userId);
}

export function employeeById(db: DemoDb, employeeId: number | null | undefined): Row | undefined {
  return db.tables.Employee.find(e => e.employee_id === employeeId);
}

/** The user's active employee profile (deleted_at IS NULL), if any. */
export function employeeByUser(db: DemoDb, userId: number | null | undefined): Row | undefined {
  return db.tables.Employee.find(e => e.user_id === userId && !e.deleted_at);
}

export function studentById(db: DemoDb, academicId: number | null | undefined): Row | undefined {
  return db.tables.Student.find(s => s.academic_id === academicId);
}

export function studentByUser(db: DemoDb, userId: number | null | undefined): Row | undefined {
  return db.tables.Student.find(s => s.user_id === userId);
}

export function patientById(db: DemoDb, patientId: number | null | undefined): Row | undefined {
  return db.tables.Patients.find(p => p.patient_id === patientId);
}

export function recordById(db: DemoDb, recordId: number | null | undefined): Row | undefined {
  return db.tables.Medical_Records.find(r => r.record_id === recordId);
}

/** The patient's active medical record (lowest record_id, deleted_at IS NULL). */
export function activeRecord(db: DemoDb, patientId: number): Row | undefined {
  return db.tables.Medical_Records
    .filter(r => r.patient_id === patientId && !r.deleted_at)
    .sort((a, b) => a.record_id - b.record_id)[0];
}

export function appointmentById(db: DemoDb, id: number | null | undefined): Row | undefined {
  return db.tables.Appointments.find(a => a.appointment_id === id);
}

export function typeById(db: DemoDb, typeId: number | null | undefined): Row | undefined {
  return db.tables.Appointment_Type.find(t => t.type_id === typeId);
}

export function clinicById(db: DemoDb, clinicId: number | null | undefined): Row | undefined {
  return db.tables.Clinic.find(c => c.clinic_id === clinicId);
}

export function userIdsByRole(db: DemoDb, role: string): number[] {
  const roleId = db.tables.Roles.find(r => r.role_name === role)?.role_id;
  return db.tables.Users.filter(u => u.role_id === roleId).map(u => u.user_id);
}

/** "First Last" like the SQL `first_name + ' ' + last_name`. */
export function name2(row: Row | undefined): string | null {
  return row ? `${row['first_name']} ${row['last_name']}` : null;
}

/** "First Middle Last" like `first_name + ' ' + middle_name + ' ' + last_name`. */
export function name3(row: Row | undefined): string | null {
  return row ? `${row['first_name']} ${row['middle_name']} ${row['last_name']}` : null;
}

/** Display name used at login: the employee name, else the email. */
export function displayName(db: DemoDb, userId: number): string {
  const emp = db.tables.Employee.find(e => e.user_id === userId);
  return emp ? `${emp['first_name']} ${emp['last_name']}` : (userById(db, userId)?.['email'] ?? '');
}

// ─── Small query helpers ─────────────────────────────────────────────────────

/** SQL `LIKE '%q%'` with the default case-insensitive collation. */
export function like(value: unknown, q: string): boolean {
  return value !== null && value !== undefined && String(value).toLowerCase().includes(q.toLowerCase());
}

export function byDesc(key: string): (a: Row, b: Row) => number {
  return (a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0);
}

export function byAsc(key: string): (a: Row, b: Row) => number {
  return (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

export function int(value: unknown): number {
  return parseInt(String(value ?? ''), 10);
}

// ─── SQL Server CONVERT(NVARCHAR, value, style) formats ──────────────────────

/** Style 23: yyyy-mm-dd (UTC date of a timestamp, or the DATE value itself). */
export function sql23(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** Style 127 on DATETIME: ISO 8601 without the trailing Z (and without .000). */
export function sql127(iso: string | null | undefined): string | null {
  return iso ? iso.replace('Z', '').replace(/\.000$/, '') : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Style 107: "Mon dd, yyyy". */
export function sql107(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} ${d}, ${y}`;
}

/** First letter upper-cased — used for 'diagnosis' → 'Diagnosis' route params. */
export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── Notifications (notification.service.ts) ─────────────────────────────────

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  linkTo?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
}

function trim(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function notifyUsers(db: DemoDb, userIds: (number | null | undefined)[], input: NotificationInput): void {
  for (const userId of userIds) {
    if (!userId) continue;
    db.insert('Notifications', {
      user_id: userId,
      type: input.type,
      title: trim(input.title, 120),
      message: trim(input.message, 500),
      link_to: input.linkTo ?? null,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    });
  }
}

export function notifyRole(db: DemoDb, role: string, input: NotificationInput): void {
  notifyUsers(db, userIdsByRole(db, role), input);
}

// ─── Audit log (audit.middleware.ts / audit.service.ts) ───────────────────────

export function audit(
  db: DemoDb,
  user: DemoUser | { userId: number } | null,
  eventType: string,
  eventDescription: string,
  details?: string,
  patientId: number | null = null,
  operationStatus: 'Success' | 'Failure' = 'Success',
): void {
  if (!user?.userId) return;
  db.insert('Audit_Log', {
    user_id: user.userId,
    patient_id: patientId,
    event_type: eventType,
    event_description: eventDescription,
    details: (details ?? eventDescription).slice(0, 500),
    operation_status: operationStatus,
    timestamp: now(),
  });
}

/** The notification link builder from notifications.links.ts. */
export function buildLinkTo(type: string, entityId: number | null | undefined, recipientRole: string): string | null {
  const id = entityId ?? 0;
  const rolePath = (role: string): string => ({
    Admin: 'admin',
    Doctor: 'doctor',
    Student: 'student',
    Receptionist: 'receptionist',
    LabTechnician: 'lab',
    DentalAssistant: 'assistant',
    InventoryManager: 'inventory-manager',
    Radiologist: 'radiologist',
  } as Record<string, string>)[role] ?? 'notifications';
  switch (type) {
    case 'academic.note.submitted':
    case 'academic.submission.new':
    case 'academic.submission.resubmitted':
      return '/doctor/evaluations';
    case 'academic.note.approved':
    case 'academic.note.rejected':
    case 'academic.note.feedback':
    case 'academic.submission.revision_requested':
    case 'academic.submission.approved':
    case 'academic.submission.rejected':
      return '/student/notes';
    case 'appointment.assigned':
      return recipientRole === 'Doctor' ? '/doctor/appointments' : '/student/appointments';
    case 'appointment.cancelled':
    case 'appointment.rescheduled':
      if (recipientRole === 'Doctor') return '/doctor/appointments';
      if (recipientRole === 'Student') return '/student/appointments';
      if (recipientRole === 'Receptionist') return '/receptionist/appointments';
      return null;
    case 'appointment.no_show':
      return '/receptionist/appointments';
    case 'appointment.checked_in':
      return '/doctor/appointments';
    case 'appointment.patient_arrived':
      if (recipientRole === 'Receptionist') return '/receptionist/scheduling';
      if (recipientRole === 'Student') return '/student/appointments';
      return '/doctor/appointments';
    case 'lab.request.created':
    case 'lab.request.approved':
      return recipientRole === 'LabTechnician' ? `/lab/requests/${id}` : null;
    case 'lab.request.rejected':
      return null;
    case 'lab.response.posted':
      return recipientRole === 'Doctor' ? `/doctor/lab/requests/${id}` : `/student/lab/requests/${id}`;
    case 'inventory.low_stock':
      return '/inventory-manager/inventory?filter=low-stock';
    case 'inventory.item_expiring':
      return '/inventory-manager/inventory?filter=expiring';
    case 'inventory.request.created':
    case 'inventory.request.approved':
    case 'inventory.request.rejected':
      return '/inventory-manager/requests';
    case 'screening.uploaded':
    case 'screening.deleted':
      return `/${rolePath(recipientRole)}/patients/${id}`;
    case 'screening.request.created':
    case 'screening.request.cancelled':
      return `/radiologist/patients/${id}`;
    case 'screening.request.fulfilled':
      return `/${rolePath(recipientRole)}/patients/${id}`;
    case 'ticket.created':
      return `/admin/tickets/${id}`;
    case 'ticket.reply':
    case 'ticket.resolved':
      return recipientRole === 'Admin' ? `/admin/tickets/${id}` : `/${rolePath(recipientRole)}/tickets/${id}`;
    default:
      return null;
  }
}
