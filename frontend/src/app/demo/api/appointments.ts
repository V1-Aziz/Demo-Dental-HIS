// /appointments — mirrors appointment.routes.ts, appointment.service.ts and
// appointment.repository.ts. Dates are compared on the viewer's local
// calendar day, which is what the receptionist and doctor screens send.
import { DemoRouter, ok, created, badRequest, conflict, notFound, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { localDate, now, today } from '../data/time';
import {
  activeRecord, appointmentById, audit, buildLinkTo, clinicById, employeeById, like, name2, name3,
  notifyUsers, patientById, studentById, typeById, userById, userIdsByRole,
} from '../helpers';

const VIEW_ROLES = ['Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'];
const STATUSES = ['Scheduled', 'Checked-In', 'In Progress', 'Completed', 'Canceled', 'No Show'];
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const live = (a: Row) => !a.deleted_at;
const notCanceled = (a: Row) => !a.deleted_at && a.status !== 'Canceled';
const ms = (iso: string) => new Date(iso).getTime();

/** SQL DATEDIFF(MINUTE, a, b): counts minute boundaries crossed. */
export function minutesBetween(a: string, b: string): number {
  return Math.floor(ms(b) / 60_000) - Math.floor(ms(a) / 60_000);
}

function listRow(db: DemoDb, a: Row): Row {
  const p = patientById(db, a.patient_id);
  const t = typeById(db, a.appointment_type_id);
  const s = studentById(db, a.academic_id);
  return {
    appointment_id: a.appointment_id,
    appointment_start_time: a.appointment_start_time,
    appointment_end_time: a.appointment_end_time,
    status: a.status,
    type_name: t?.type_name ?? null,
    procedure_name: t?.type_name ?? null,
    patient_name: name3(p),
    file_number: p?.file_number ?? null,
    patient_id: a.patient_id,
    doctor_id: a.doctor_id,
    appointment_type_id: a.appointment_type_id,
    academic_id: a.academic_id,
    doctor_name: name2(employeeById(db, a.doctor_id)),
    clinic_name: clinicById(db, a.clinic_id)?.clinic_name ?? null,
    student_name: name2(s),
    student_level: s?.academic_level ?? null,
  };
}

/** getAppointmentsByDate(): the day sheet used by several dashboards. */
export function appointmentsOnDay(db: DemoDb, day: string): Row[] {
  return db.tables.Appointments
    .filter(a => notCanceled(a) && localDate(a.appointment_start_time) === day)
    .sort((x, y) => x.appointment_start_time.localeCompare(y.appointment_start_time))
    .map(a => {
      const p = patientById(db, a.patient_id);
      const t = typeById(db, a.appointment_type_id);
      return {
        appointment_id: a.appointment_id,
        appointment_start_time: a.appointment_start_time,
        appointment_end_time: a.appointment_end_time,
        status: a.status,
        arrival_status: a.arrival_status,
        arrived_at: a.arrived_at,
        type_name: t?.type_name ?? null,
        procedure_name: t?.type_name ?? null,
        patient_id: a.patient_id,
        patient_name: name3(p),
        file_number: p?.file_number ?? null,
        gender: p?.gender ?? null,
        date_of_birth: p?.date_of_birth ?? null,
        doctor_name: name2(employeeById(db, a.doctor_id)),
        clinic_name: clinicById(db, a.clinic_id)?.clinic_name ?? null,
      };
    });
}

function workingSchedule(db: DemoDb, doctorId: number): { day_of_week: number; start_minutes: number; end_minutes: number }[] {
  const minutes = (t: string) => {
    const d = new Date(t);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  };
  return db.tables.Doctor_Availability
    .filter(d => d.doctor_id === doctorId && d.is_active)
    .map(d => ({ day_of_week: d.day_of_week, start_minutes: minutes(d.start_time), end_minutes: minutes(d.end_time) }));
}

function overlaps(db: DemoDb, key: 'doctor_id' | 'academic_id', id: number, start: number, end: number, ignoreId?: number): boolean {
  return db.tables.Appointments.some(a =>
    notCanceled(a) && a[key] === id && a.appointment_id !== ignoreId &&
    ms(a.appointment_start_time) < end && ms(a.appointment_end_time) > start);
}

function userIdOfEmployee(db: DemoDb, employeeId: number | null): number | null {
  return employeeById(db, employeeId)?.user_id ?? null;
}

function userIdOfStudent(db: DemoDb, academicId: number | null): number | null {
  return studentById(db, academicId)?.user_id ?? null;
}

export function registerAppointments(r: DemoRouter): void {
  r.get('/appointments/today', VIEW_ROLES, ({ db }) => ok(appointmentsOnDay(db, today())));

  r.get('/appointments/types', VIEW_ROLES, ({ db }) => {
    const groups = new Map<string, Row>();
    for (const t of db.tables.Appointment_Type.filter(x => x.is_active)) {
      const key = `${t.type_name}|${t.duration}`;
      const g = groups.get(key);
      if (!g) groups.set(key, { type_id: t.type_id, type_name: t.type_name, duration: t.duration, order: t.display_order });
      else {
        g['type_id'] = Math.min(g['type_id'], t.type_id);
        g['order'] = Math.min(g['order'], t.display_order);
      }
    }
    const rows = [...groups.values()]
      .sort((a, b) => a['order'] - b['order'] || a['type_name'].localeCompare(b['type_name']))
      .map(({ order: _o, ...rest }) => rest);
    return ok(rows);
  });

  r.get('/appointments/doctors', VIEW_ROLES, ({ db }) => {
    const doctorRole = db.tables.Roles.find(x => x.role_name === 'Doctor')?.role_id;
    const groups = new Map<string, Row>();
    for (const e of db.tables.Employee.filter(x => !x.deleted_at)) {
      const u = userById(db, e.user_id);
      if (!u || u.role_id !== doctorRole || u.account_status !== 'Active') continue;
      const name = name2(e)!;
      const key = `${name}|${e.specialization}`;
      const g = groups.get(key);
      if (!g) groups.set(key, { employee_id: e.employee_id, doctor_name: name, specialization: e.specialization });
      else g['employee_id'] = Math.min(g['employee_id'], e.employee_id);
    }
    return ok([...groups.values()].sort((a, b) => a['doctor_name'].localeCompare(b['doctor_name'])));
  });

  r.get('/appointments/students', ['Admin', 'Receptionist'], ({ query, db }) => {
    const supervisorId = query['supervisor_id'] ? parseInt(query['supervisor_id'], 10) : undefined;
    const rows = db.tables.Student
      .filter(s => userById(db, s.user_id) && (!supervisorId || s.employee_id === supervisorId))
      .sort((a, b) => a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name))
      .map(s => ({
        academic_id: s.academic_id,
        first_name: s.first_name,
        middle_name: s.middle_name,
        last_name: s.last_name,
        academic_level: s.academic_level,
        employee_id: s.employee_id,
      }));
    return ok(rows);
  });

  r.get('/appointments/available-days', ['Receptionist', 'Admin'], ({ query, db }) => {
    const doctorId = parseInt(query['doctor_id'] ?? '', 10);
    const year = parseInt(query['year'] ?? '', 10);
    const month = parseInt(query['month'] ?? '', 10);
    if (isNaN(doctorId) || isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return badRequest('doctor_id, year, and month (1–12) are required');
    }
    const schedule = workingSchedule(db, doctorId);
    if (!schedule.length) return ok({ available: [], busy: [] });
    const workingByDow = new Map(schedule.map(s => [s.day_of_week, s.end_minutes - s.start_minutes]));

    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const bookedByDay = new Map<number, number>();
    for (const a of db.tables.Appointments.filter(x => notCanceled(x) && x.doctor_id === doctorId)) {
      const day = localDate(a.appointment_start_time)!;
      if (!day.startsWith(prefix)) continue;
      const d = parseInt(day.slice(8), 10);
      bookedByDay.set(d, (bookedByDay.get(d) ?? 0) + minutesBetween(a.appointment_start_time, a.appointment_end_time));
    }

    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const lastDay = new Date(year, month, 0).getDate();
    const available: number[] = [];
    const busy: number[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(year, month - 1, day);
      if (date < midnight) continue;
      const total = workingByDow.get(date.getDay());
      if (total === undefined) continue;
      if ((bookedByDay.get(day) ?? 0) >= total) busy.push(day);
      else available.push(day);
    }
    return ok({ available, busy });
  });

  r.get('/appointments/available-slots', ['Receptionist', 'Admin'], ({ query, db }) => {
    const doctorId = parseInt(query['doctor_id'] ?? '', 10);
    const date = String(query['date'] ?? '');
    const typeId = parseInt(query['type_id'] ?? '', 10);
    const studentId = query['student_id'] ? parseInt(query['student_id'], 10) : undefined;
    if (isNaN(doctorId) || !date || isNaN(typeId)) {
      return badRequest('doctor_id, date (YYYY-MM-DD), and type_id are required');
    }
    const duration = typeById(db, typeId)?.duration;
    if (duration === undefined) return ok({ slots: [] });

    const [y, m, d] = date.split('-').map(Number);
    const daySchedule = workingSchedule(db, doctorId).find(s => s.day_of_week === new Date(y, m - 1, d).getDay());
    if (!daySchedule) return ok({ slots: [] });

    const midnight = new Date(y, m - 1, d).getTime();
    const slots: string[] = [];
    for (let start = daySchedule.start_minutes; start + duration <= daySchedule.end_minutes; start += duration) {
      const s = midnight + start * 60_000;
      const e = s + duration * 60_000;
      const clash = overlaps(db, 'doctor_id', doctorId, s, e) || (studentId ? overlaps(db, 'academic_id', studentId, s, e) : false);
      if (!clash) slots.push(`${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`);
    }
    return ok({ slots });
  });

  r.get('/appointments', VIEW_ROLES, ({ user, query, db }) => {
    const { limit, offset, page } = pagination(query);
    const f = {
      date: query['date'] || undefined,
      dateFrom: query['dateFrom'] || undefined,
      dateTo: query['dateTo'] || undefined,
      doctorId: query['doctorId'] ? parseInt(query['doctorId'], 10) : undefined,
      status: query['status'] || undefined,
      search: query['search'] || undefined,
      academicId: undefined as number | undefined,
    };
    if (user.role === 'Student' && user.academicId) f.academicId = user.academicId;
    if (user.role === 'Doctor' && user.employeeId) f.doctorId = user.employeeId;

    const all = db.tables.Appointments.filter(a => {
      if (!live(a)) return false;
      const day = localDate(a.appointment_start_time)!;
      if (f.date && day !== f.date) return false;
      if (f.dateFrom && day < f.dateFrom) return false;
      if (f.dateTo && day > f.dateTo) return false;
      if (f.doctorId && a.doctor_id !== f.doctorId) return false;
      if (f.status && a.status !== f.status) return false;
      if (f.academicId && a.academic_id !== f.academicId) return false;
      if (f.search) {
        const p = patientById(db, a.patient_id);
        if (!like(name3(p), f.search) && !like(p?.file_number, f.search)) return false;
      }
      return true;
    }).sort((a, b) => a.appointment_start_time.localeCompare(b.appointment_start_time));

    return ok({ rows: all.slice(offset, offset + limit).map(a => listRow(db, a)), total: all.length, page, limit });
  });

  r.post('/appointments', ['Admin', 'Receptionist'], (req) => {
    const { body, db, user } = req;
    const errors = validateCreate(body);
    if (errors.length) return badRequest(errors.join(', '));

    const type = typeById(db, body.appointmentTypeId);
    if (!type) return badRequest('Invalid appointment type.');
    const start = new Date(body.appointmentStartTime);
    const end = new Date(start.getTime() + type.duration * 60_000);

    if (body.academicId) {
      const s = studentById(db, body.academicId);
      if (!s || s.employee_id !== body.doctorId) return badRequest('The selected student is not supervised by the selected doctor.');
    }
    if (overlaps(db, 'doctor_id', body.doctorId, start.getTime(), end.getTime())) {
      return badRequest('The selected time slot is no longer available. Please choose another.');
    }
    if (body.academicId && overlaps(db, 'academic_id', body.academicId, start.getTime(), end.getTime())) {
      return badRequest('The selected student is not available at this time. Please choose another slot.');
    }

    const record = activeRecord(db, body.patientId) ?? db.insert('Medical_Records', { patient_id: body.patientId });
    const appt = db.insert('Appointments', {
      patient_id: body.patientId,
      doctor_id: body.doctorId,
      clinic_id: body.clinicId ?? null,
      academic_id: body.academicId ?? null,
      record_id: record.record_id,
      appointment_type_id: body.appointmentTypeId,
      appointment_start_time: start.toISOString(),
      appointment_end_time: end.toISOString(),
      status: 'Scheduled',
      booked_by: user.userId ?? null,
    });

    notifyUsers(db, [userIdOfEmployee(db, body.doctorId)], {
      type: 'appointment.assigned',
      title: 'New appointment assigned',
      message: `An appointment has been scheduled for you on ${start.toLocaleDateString()}.`,
      linkTo: buildLinkTo('appointment.assigned', null, 'Doctor'),
      relatedEntityType: 'Appointments',
      relatedEntityId: appt.appointment_id,
    });
    audit(db, user, 'Appointment_Create', 'Appointment scheduled',
      `Appointment scheduled for patient #${body.patientId ?? ''}`, body.patientId ?? null);
    return created({ appointment_id: appt.appointment_id }, 'Appointment booked successfully');
  });

  r.get('/appointments/:id', VIEW_ROLES, ({ params, db }) => {
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid appointment ID');
    const a = db.tables.Appointments.find(x => x.appointment_id === id && live(x));
    if (!a) return notFound('Appointment not found');
    const t = typeById(db, a.appointment_type_id);
    const s = studentById(db, a.academic_id);
    const p = patientById(db, a.patient_id);
    return ok({
      appointment_id: a.appointment_id,
      appointment_start_time: a.appointment_start_time,
      appointment_end_time: a.appointment_end_time,
      status: a.status,
      clinic_id: a.clinic_id,
      doctor_id: a.doctor_id,
      appointment_type_id: a.appointment_type_id,
      academic_id: a.academic_id,
      type_name: t?.type_name ?? null,
      duration: t?.duration ?? null,
      patient_id: a.patient_id,
      patient_name: name3(p),
      file_number: p?.file_number ?? null,
      doctor_name: name2(employeeById(db, a.doctor_id)),
      clinic_name: clinicById(db, a.clinic_id)?.clinic_name ?? null,
      student_name: name2(s),
      student_level: s?.academic_level ?? null,
    });
  });

  r.put('/appointments/:id', ['Admin', 'Receptionist'], (req) => {
    const { params, body, db } = req;
    const errors = validateUpdate(body);
    if (errors.length) return badRequest(errors.join(', '));
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid appointment ID');
    const a = db.tables.Appointments.find(x => x.appointment_id === id && live(x) && x.status === 'Scheduled');
    if (a) {
      a.doctor_id = body.doctorId;
      a.clinic_id = body.clinicId ?? null;
      a.academic_id = body.academicId ?? null;
      a.appointment_type_id = body.appointmentTypeId;
      a.appointment_start_time = new Date(body.appointmentStartTime).toISOString();
      a.appointment_end_time = new Date(body.appointmentEndTime).toISOString();
      db.save();
    }
    audit(db, req.user, 'Appointment_Update', 'Appointment details updated',
      `Appointment #${params['id']} details updated`, body.patientId ?? null);
    return ok(null, 'Appointment updated');
  });

  r.patch('/appointments/:id/status', ['Admin', 'Doctor', 'Receptionist'], (req) => {
    const { params, body, db } = req;
    if (!STATUSES.includes(body?.status)) {
      return badRequest(`Invalid enum value. Expected ${STATUSES.map(s => `'${s}'`).join(' | ')}, received '${body?.status}'`);
    }
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid appointment ID');
    const a = db.tables.Appointments.find(x => x.appointment_id === id && live(x));
    if (a) {
      a.status = body.status;
      db.save();
      const doctorUser = userIdOfEmployee(db, a.doctor_id);
      const studentUser = userIdOfStudent(db, a.academic_id);
      if (body.status === 'Canceled') {
        notifyUsers(db, [doctorUser, studentUser], {
          type: 'appointment.cancelled', title: 'Appointment cancelled',
          message: 'An appointment you were involved in has been cancelled.',
          relatedEntityType: 'Appointments', relatedEntityId: id,
        });
        notifyUsers(db, userIdsByRole(db, 'Receptionist'), {
          type: 'appointment.cancelled', title: 'Appointment cancelled', message: 'An appointment has been cancelled.',
          linkTo: buildLinkTo('appointment.cancelled', id, 'Receptionist'),
          relatedEntityType: 'Appointments', relatedEntityId: id,
        });
      } else if (body.status === 'Checked-In') {
        notifyUsers(db, [doctorUser, studentUser], {
          type: 'appointment.checked_in', title: 'Patient checked in',
          message: 'Your patient has arrived and been checked in.',
          relatedEntityType: 'Appointments', relatedEntityId: id,
        });
      } else if (body.status === 'No Show') {
        notifyUsers(db, userIdsByRole(db, 'Receptionist'), {
          type: 'appointment.no_show', title: 'Appointment no-show recorded',
          message: 'A patient did not attend their scheduled appointment.',
          linkTo: buildLinkTo('appointment.no_show', id, 'Receptionist'),
          relatedEntityType: 'Appointments', relatedEntityId: id,
        });
      }
    }
    audit(db, req.user, 'Appointment_Update', 'Appointment status updated',
      `Appointment #${params['id']} status set to ${body.status ?? ''}`);
    return ok(null, 'Status updated');
  });

  r.patch('/appointments/:id/arrival', ['Admin', 'Receptionist'], (req) => {
    const { params, body, db } = req;
    const status = body?.arrival_status;
    if (!['On Time', 'Late', 'No Show'].includes(status)) {
      return badRequest(`Invalid enum value. Expected 'On Time' | 'Late' | 'No Show', received '${status}'`);
    }
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid appointment ID');
    const a = db.tables.Appointments.find(x => x.appointment_id === id && live(x) && !x.arrival_status);
    if (!a) {
      audit(db, req.user, 'APPT_ARRIVAL_MARKED', 'Patient arrival status recorded',
        `Appointment #${params['id']} arrival set to ${status}`, null, 'Failure');
      return conflict('Arrival is already recorded for this appointment. Use DELETE /arrival to undo first.');
    }
    a.arrival_status = status;
    a.arrived_at = status !== 'No Show' ? now() : null;
    if (status === 'No Show') a.status = 'No Show';
    db.save();

    const lateBy = a.arrived_at ? minutesBetween(a.appointment_start_time, a.arrived_at) : null;
    const row = {
      appointment_id: a.appointment_id,
      arrival_status: a.arrival_status,
      arrived_at: a.arrived_at,
      appointment_start_time: a.appointment_start_time,
      late_by_minutes: lateBy,
    };

    // Arrival fan-out: the procedure's section, the doctor and the student.
    const type = typeById(db, a.appointment_type_id);
    const p = patientById(db, a.patient_id);
    const recipients = new Set<number>();
    if (type?.section_id !== null && type?.section_id !== undefined) {
      for (const es of db.tables.Employee_Section.filter(x => x.section_id === type.section_id)) {
        const e = employeeById(db, es.employee_id);
        const u = userById(db, e?.user_id);
        if (e && !e.deleted_at && u?.account_status === 'Active') recipients.add(u.user_id);
      }
    }
    const doctorUser = userIdOfEmployee(db, a.doctor_id);
    if (doctorUser) recipients.add(doctorUser);
    const studentUser = userIdOfStudent(db, a.academic_id);
    if (studentUser) recipients.add(studentUser);

    const patientName = p ? `${p.first_name} ${p.middle_name ? p.middle_name + ' ' : ''}${p.last_name}` : '';
    const title = status === 'On Time' ? 'Patient arrived' : status === 'Late' ? 'Patient arrived late' : 'Patient marked no-show';
    const message = status === 'No Show'
      ? `${patientName} (File #${p?.file_number}) did not attend their ${type?.type_name} appointment.`
      : status === 'Late' && lateBy !== null
        ? `${patientName} (File #${p?.file_number}) arrived late for ${type?.type_name}. Late by ${lateBy} min.`
        : `${patientName} (File #${p?.file_number}) arrived on time for ${type?.type_name}.`;
    notifyUsers(db, [...recipients], {
      type: 'appointment.patient_arrived', title, message,
      linkTo: buildLinkTo('appointment.patient_arrived', id, 'Doctor'),
      relatedEntityType: 'Appointments', relatedEntityId: id,
    });

    audit(db, req.user, 'APPT_ARRIVAL_MARKED', 'Patient arrival status recorded', `Appointment #${params['id']} arrival set to ${status}`);
    return ok(row, 'Arrival recorded');
  });

  r.delete('/appointments/:id/arrival', ['Admin', 'Receptionist'], (req) => {
    const { params, db, user } = req;
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid appointment ID');
    const a = appointmentById(db, id);
    const allowed = a && live(a) && a.arrival_status && (
      user.role === 'Admin' || !a.arrived_at || minutesBetween(a.arrived_at, now()) <= 5);
    if (!a || !allowed) {
      audit(db, user, 'APPT_ARRIVAL_CLEARED', 'Patient arrival record cleared', `Appointment #${params['id']} arrival cleared`, null, 'Failure');
      return notFound('Arrival record not found or undo window has expired');
    }
    if (a.arrival_status === 'No Show') a.status = 'Scheduled';
    a.arrived_at = null;
    a.arrival_status = null;
    db.save();
    audit(db, user, 'APPT_ARRIVAL_CLEARED', 'Patient arrival record cleared', `Appointment #${params['id']} arrival cleared`);
    return ok(null, 'Arrival record cleared');
  });
}

// createSchema / updateSchema (appointment.routes.ts)
function validateCreate(b: any): string[] {
  const errors: string[] = [];
  const posInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
  if (!posInt(b?.patientId)) errors.push('patientId is required');
  if (!posInt(b?.doctorId)) errors.push('doctorId is required');
  if (!posInt(b?.appointmentTypeId)) errors.push('appointmentTypeId is required');
  if (b?.clinicId !== undefined && !posInt(b.clinicId)) errors.push('Invalid clinicId');
  if (b?.academicId !== undefined && b.academicId !== null && !posInt(b.academicId)) errors.push('Invalid academicId');
  if (!ISO_DATETIME.test(String(b?.appointmentStartTime ?? ''))) errors.push('Use ISO datetime format (YYYY-MM-DDTHH:mm…)');
  return errors;
}

function validateUpdate(b: any): string[] {
  const errors = validateCreate({ ...b, patientId: 1 });
  if (!ISO_DATETIME.test(String(b?.appointmentEndTime ?? ''))) errors.push('Use ISO datetime format (YYYY-MM-DDTHH:mm…)');
  return errors;
}
