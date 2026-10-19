// /auth — mirrors auth.routes.ts, auth.controller.ts, auth.service.ts and the
// self-registration part of pending-registration.service.ts.
import { DemoRouter, PUBLIC, ANY_USER, ok, created, badRequest, conflict, unauthorized, signToken, decodeToken } from '../router';
import { audit, displayName, roleName } from '../helpers';
import { now } from '../data/time';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAuth(r: DemoRouter): void {
  r.post('/auth/login', PUBLIC, ({ body, db }) => {
    const email = String(body?.email ?? '');
    const password = String(body?.password ?? '');
    const errors = [];
    if (!EMAIL_RE.test(email)) errors.push('Invalid email address');
    if (!password) errors.push('Password is required');
    if (errors.length) return badRequest(errors.join(', '));

    const user = db.tables.Users.find(u => u.email === email);
    if (!user) return unauthorized('Invalid credentials');
    if (user['account_status'] !== 'Active') return unauthorized('Account is not active');
    if (user['password'] !== password) return unauthorized('Invalid credentials');

    user['last_login'] = now();
    const role = roleName(db, user['role_id'])!;
    const employee = db.tables.Employee.find(e => e.user_id === user['user_id']);
    const student = db.tables.Student.find(s => s.user_id === user['user_id']);
    const base = {
      userId: user['user_id'],
      role,
      employeeId: employee?.['employee_id'] ?? undefined,
      academicId: student?.['academic_id'] ?? undefined,
    };
    const refreshToken = signToken(base, 7);
    const session = db.insert('User_Sessions', {
      user_id: user['user_id'],
      refresh_token_hash: refreshToken,
      expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    });
    const accessToken = signToken({ ...base, sessionId: session['session_id'] });
    const name = displayName(db, user['user_id']);

    audit(db, { userId: user['user_id'] }, 'Login', 'User logged in', `${name} (${role}) logged in successfully`);
    db.save();
    return ok({ user: { id: user['user_id'], name, role }, accessToken, refreshToken }, 'Login successful');
  });

  r.post('/auth/refresh', PUBLIC, ({ body, db }) => {
    const token = String(body?.refreshToken ?? '');
    if (!token) return badRequest('Refresh token is required');
    const payload = decodeToken(token);
    if (!payload) return unauthorized('Invalid or expired refresh token');
    const session = db.tables.User_Sessions.find(s => s.refresh_token_hash === token && !s.revoked_at);
    if (!session) return unauthorized('Session not found or revoked');

    const base = { userId: payload.userId, role: payload.role, employeeId: payload.employeeId, academicId: payload.academicId };
    const refreshToken = signToken(base, 7);
    session['refresh_token_hash'] = refreshToken;
    session['last_activity_at'] = now();
    db.save();
    return ok({ accessToken: signToken({ ...base, sessionId: session['session_id'] }), refreshToken }, 'Token refreshed');
  });

  r.post('/auth/logout', PUBLIC, ({ body, db }) => {
    const session = db.tables.User_Sessions.find(s => s.refresh_token_hash === body?.refreshToken);
    if (session && !session['revoked_at']) {
      session['revoked_at'] = now();
      db.save();
    }
    return ok(null, 'Logged out');
  });

  r.post('/auth/register', PUBLIC, ({ body, db }) => {
    const errors = validateRegistration(body);
    if (errors.length) return badRequest(errors.join(', '));

    const role = db.tables.Roles.find(x => x.role_id === body.requestedRoleId);
    if (!role) return badRequest('Role not found');
    if (role['role_name'] === 'Admin') return badRequest('Admin self-registration is not permitted');

    const primary = body.contacts.find((c: any) => c.isPrimary);
    if (primary?.contactType === 'Email') {
      if (db.tables.Users.some(u => u.email === primary.value)) return conflict('Email already registered');
      const pendingIds = new Set(db.tables.Pending_Registrations.filter(p => p.status === 'Pending').map(p => p.registration_id));
      const taken = db.tables.Pending_Registration_Contacts.some(c =>
        c.contact_type === 'Email' && c.value === primary.value && c.is_primary && pendingIds.has(c.registration_id));
      if (taken) return conflict('A pending registration with this email already exists');
    }

    const reg = db.insert('Pending_Registrations', {
      first_name: body.firstName.trim(),
      middle_name: body.middleName.trim(),
      last_name: body.lastName.trim(),
      civil_id: body.civilId,
      requested_role_id: body.requestedRoleId,
      password_hash: body.password, // demo mode keeps the password as-is
    });
    for (const c of body.contacts) {
      db.insert('Pending_Registration_Contacts', {
        registration_id: reg['registration_id'],
        contact_type: c.contactType,
        value: c.value,
        is_primary: !!c.isPrimary,
      });
    }
    return created({ registrationId: reg['registration_id'] },
      'Registration submitted. Your account is awaiting admin approval.');
  });

  r.get('/auth/registerable-roles', PUBLIC, ({ db }) => {
    const roles = db.tables.Roles
      .filter(x => x.role_name !== 'Admin')
      .map(x => ({ role_id: x.role_id, role_name: x.role_name }))
      .sort((a, b) => a.role_name.localeCompare(b.role_name));
    return ok(roles);
  });

  r.post('/auth/heartbeat', ANY_USER, ({ user, db }) => {
    const session = db.tables.User_Sessions.find(s => s.session_id === user.sessionId);
    if (session) {
      session['last_activity_at'] = now();
      db.save();
    }
    return ok(null, 'OK');
  });
}

// submitRegistrationSchema (pending-registration.validator.ts)
function validateRegistration(b: any): string[] {
  const errors: string[] = [];
  const nameOk = (v: unknown) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 100;
  if (!nameOk(b?.firstName) || !nameOk(b?.middleName) || !nameOk(b?.lastName)) errors.push('Required');
  if (!/^\d{10}$/.test(String(b?.civilId ?? ''))) errors.push('Civil ID must be exactly 10 digits');
  if (!Number.isInteger(b?.requestedRoleId) || b.requestedRoleId <= 0) errors.push('Expected number, received ' + typeof b?.requestedRoleId);
  const pw = String(b?.password ?? '');
  if (pw.length < 8) errors.push('String must contain at least 8 character(s)');
  else if (!(/[a-zA-Z]/.test(pw) && /\d/.test(pw))) errors.push('Password must contain at least one letter and one digit');
  const contacts = Array.isArray(b?.contacts) ? b.contacts : [];
  if (!contacts.length) errors.push('At least one contact is required');
  for (const c of contacts) {
    const valid = c?.contactType === 'Email' ? EMAIL_RE.test(c?.value ?? '') : /^\+?\d{8,15}$/.test(c?.value ?? '');
    if (!valid) errors.push('Invalid contact value format');
  }
  if (contacts.length && contacts.filter((c: any) => c?.isPrimary).length !== 1) errors.push('Exactly one contact must be marked as primary');
  if (new Set(contacts.map((c: any) => c?.value)).size !== contacts.length) errors.push('Contact values must be unique');
  return errors;
}
