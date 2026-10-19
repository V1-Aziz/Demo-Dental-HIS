// Business logic for appointment booking, scheduling, and status management.
import {
  getAppointments,
  getAppointmentsByDate,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  updateAppointment,
  getOrCreatePatientRecord,
  getAppointmentTypes,
  getAppointmentTypeDuration,
  getDoctors,
  getDoctorWorkingSchedule,
  getBookedMinutesPerDay,
  getAppointmentsOnDate,
  getAppointmentsOnDateForStudent,
  checkSlotConflict,
  checkStudentSlotConflict,
  verifyStudentSupervisor,
  getStudentsForDropdown,
  markArrival,
  clearArrival,
  getArrivalDispatchInfo,
  ArrivalStatus,
  AppointmentFilters,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '../repositories/appointment.repository';
import {
  getAppointmentDispatchInfo,
  getUserIdByEmployeeId,
  getUserIdByAcademicId,
  findUserIdsByRole,
} from '../repositories/notification.repository';
import { listUserIdsBySection } from '../repositories/section.repository';
import { dispatch, dispatchToUsers } from './notification.service';
import { buildLinkTo } from './notifications.links';

export async function listAppointmentsService(
  filters: AppointmentFilters,
  limit: number,
  offset: number,
) {
  return getAppointments(filters, limit, offset);
}

export async function getTodayAppointmentsService() {
  const today = new Date().toISOString().slice(0, 10);
  return getAppointmentsByDate(today);
}

export async function getAppointmentByIdService(id: number) {
  return getAppointmentById(id);
}

export interface BookAppointmentInput {
  patientId: number;
  doctorId: number;
  clinicId?: number;
  academicId?: number | null;
  appointmentTypeId: number;
  appointmentStartTime: string; // ISO 8601
  bookedBy: number;
}

export async function createAppointmentService(data: BookAppointmentInput) {
  // Duration (in minutes) is stored per appointment type, not per appointment —
  // derive end time server-side so the client can't book a longer slot than allowed.
  const duration = await getAppointmentTypeDuration(data.appointmentTypeId);
  if (duration === null) throw new Error('INVALID_TYPE');

  const start = new Date(data.appointmentStartTime);
  const end   = new Date(start.getTime() + duration * 60_000);

  // When a student is assigned, confirm they are supervised by the given doctor.
  if (data.academicId) {
    const valid = await verifyStudentSupervisor(data.academicId, data.doctorId);
    if (!valid) throw new Error('INVALID_SUPERVISION');
  }

  // Race-safe enough for single-admin usage: the controller translates this
  // into a 400 so the client can re-fetch free slots.
  const conflict = await checkSlotConflict(data.doctorId, start, end);
  if (conflict) throw new Error('SLOT_TAKEN');

  if (data.academicId) {
    const studentConflict = await checkStudentSlotConflict(data.academicId, start, end);
    if (studentConflict) throw new Error('STUDENT_SLOT_TAKEN');
  }

  // Every appointment must link to a Medical_Record; auto-create on first booking.
  const recordId = await getOrCreatePatientRecord(data.patientId);
  const result = await createAppointment({
    patientId:            data.patientId,
    doctorId:             data.doctorId,
    clinicId:             data.clinicId,
    academicId:           data.academicId,
    appointmentTypeId:    data.appointmentTypeId,
    appointmentStartTime: data.appointmentStartTime,
    appointmentEndTime:   end.toISOString(),
    bookedBy:             data.bookedBy,
    recordId,
  });

  // Notify the assigned doctor that a new appointment has been booked for them.
  try {
    const doctorUserId = await getUserIdByEmployeeId(data.doctorId);
    if (doctorUserId) {
      await dispatch({
        userId:            doctorUserId,
        type:              'appointment.assigned',
        title:             'New appointment assigned',
        message:           `An appointment has been scheduled for you on ${start.toLocaleDateString()}.`,
        linkTo:            buildLinkTo('appointment.assigned', null, 'Doctor'),
        relatedEntityType: 'Appointments',
        relatedEntityId:   result.appointment_id,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'appointment.assigned', err });
  }

  return result;
}

export async function updateAppointmentStatusService(id: number, status: string) {
  await updateAppointmentStatus(id, status);

  // Dispatch notifications based on the new status.
  try {
    const info = await getAppointmentDispatchInfo(id);
    if (!info) return;

    const doctorUserId  = await getUserIdByEmployeeId(info.doctor_id);
    const studentUserId = info.academic_id
      ? await getUserIdByAcademicId(info.academic_id)
      : null;

    if (status === 'Canceled') {
      const recipients = [doctorUserId, studentUserId].filter((x): x is number => x !== null);
      if (recipients.length) {
        await dispatchToUsers(recipients, {
          type:              'appointment.cancelled',
          title:             'Appointment cancelled',
          message:           'An appointment you were involved in has been cancelled.',
          linkTo:            null,
          relatedEntityType: 'Appointments',
          relatedEntityId:   id,
        });
      }
      // Also notify receptionists
      const receptionistIds = await findUserIdsByRole('Receptionist');
      if (receptionistIds.length) {
        await dispatchToUsers(receptionistIds, {
          type:              'appointment.cancelled',
          title:             'Appointment cancelled',
          message:           'An appointment has been cancelled.',
          linkTo:            buildLinkTo('appointment.cancelled', id, 'Receptionist'),
          relatedEntityType: 'Appointments',
          relatedEntityId:   id,
        });
      }
    } else if (status === 'Checked-In') {
      const recipients = [doctorUserId, studentUserId].filter((x): x is number => x !== null);
      if (recipients.length) {
        await dispatchToUsers(recipients, {
          type:              'appointment.checked_in',
          title:             'Patient checked in',
          message:           'Your patient has arrived and been checked in.',
          linkTo:            null,
          relatedEntityType: 'Appointments',
          relatedEntityId:   id,
        });
      }
    } else if (status === 'No Show') {
      const receptionistIds = await findUserIdsByRole('Receptionist');
      if (receptionistIds.length) {
        await dispatchToUsers(receptionistIds, {
          type:              'appointment.no_show',
          title:             'Appointment no-show recorded',
          message:           'A patient did not attend their scheduled appointment.',
          linkTo:            buildLinkTo('appointment.no_show', id, 'Receptionist'),
          relatedEntityType: 'Appointments',
          relatedEntityId:   id,
        });
      }
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'appointment.status', id, status, err });
  }
}

export async function updateAppointmentService(id: number, data: UpdateAppointmentInput) {
  return updateAppointment(id, data);
}

export async function getAppointmentTypesService() {
  return getAppointmentTypes();
}

export async function getDoctorsService() {
  return getDoctors();
}

export async function getStudentsService(supervisorId?: number) {
  return getStudentsForDropdown(supervisorId);
}

// Returns which day-of-month cells in the calendar UI should appear as
// "available" (green) or "busy" (fully booked — red). Days not returned in
// either array are non-working days for this doctor and stay greyed out.
export async function getAvailableDaysService(
  doctorId: number,
  year: number,
  month: number,
): Promise<{ available: number[]; busy: number[] }> {
  const schedule = await getDoctorWorkingSchedule(doctorId);
  if (!schedule.length) return { available: [], busy: [] };

  // Map day_of_week → total available minutes
  const workingMinutesByDow = new Map<number, number>(
    schedule.map(s => [s.day_of_week, s.end_minutes - s.start_minutes]),
  );

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay   = new Date(year, month, 0).getDate();
  const endDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const bookedData = await getBookedMinutesPerDay(doctorId, startDate, endDate);
  const bookedByDay = new Map<number, number>(bookedData.map(r => [r.day_num, r.booked_minutes]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const available: number[] = [];
  const busy: number[]      = [];

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day);
    if (date < today) continue; // skip past days

    const dow = date.getDay(); // 0=Sun … 6=Sat
    if (!workingMinutesByDow.has(dow)) continue; // not a working day

    const totalMinutes  = workingMinutesByDow.get(dow)!;
    const bookedMinutes = bookedByDay.get(day) ?? 0;

    if (bookedMinutes >= totalMinutes) {
      busy.push(day);
    } else {
      available.push(day);
    }
  }

  return { available, busy };
}

// For a given doctor + date + appointment type, returns the list of free
// start-time strings ("HH:MM") the UI should render as selectable slots.
// Generated by walking the doctor's working window in `duration`-minute steps
// and skipping any step that overlaps an existing booking.
// When `studentId` is provided, slots where that student is already booked
// are also excluded.
export async function getAvailableSlotsService(
  doctorId: number,
  date: string,
  typeId: number,
  studentId?: number,
): Promise<string[]> {
  const duration = await getAppointmentTypeDuration(typeId);
  if (duration === null) return [];

  const schedule = await getDoctorWorkingSchedule(doctorId);
  // date is YYYY-MM-DD; parse as local date to get correct day-of-week
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const daySchedule = schedule.find(s => s.day_of_week === dow);
  if (!daySchedule) return [];

  const bookedAppts        = await getAppointmentsOnDate(doctorId, date);
  const studentBookedAppts = studentId
    ? await getAppointmentsOnDateForStudent(studentId, date)
    : [];

  // Local midnight of the chosen date as a UTC timestamp.
  // Adding schedule minutes (local) to this gives the correct UTC ms for each slot,
  // which lines up exactly with how mssql stores the appointment datetimes.
  const localMidnightMs = new Date(y, m - 1, d).getTime();

  const slots: string[] = [];
  for (
    let slotStart = daySchedule.start_minutes;
    slotStart + duration <= daySchedule.end_minutes;
    slotStart += duration
  ) {
    const slotEnd     = slotStart + duration;
    const slotStartMs = localMidnightMs + slotStart * 60_000;
    const slotEndMs   = localMidnightMs + slotEnd   * 60_000;

    const hasConflict = bookedAppts.some(
      a => slotStartMs < a.end_time.getTime() && slotEndMs > a.start_time.getTime(),
    );
    const hasStudentConflict = studentBookedAppts.some(
      a => slotStartMs < a.end_time.getTime() && slotEndMs > a.start_time.getTime(),
    );

    if (!hasConflict && !hasStudentConflict) {
      const h  = Math.floor(slotStart / 60).toString().padStart(2, '0');
      const mn = (slotStart % 60).toString().padStart(2, '0');
      slots.push(`${h}:${mn}`);
    }
  }

  return slots;
}

// ── Arrival check-in ──────────────────────────────────────────────────────────

export async function markArrivalService(
  appointmentId: number,
  arrivalStatus: ArrivalStatus,
): Promise<{ alreadySet: boolean; row: unknown }> {
  const { updated, row } = await markArrival(appointmentId, arrivalStatus);

  if (!updated) return { alreadySet: true, row: null };

  // Notification fan-out: best-effort, never blocks or rolls back the update.
  try {
    const info = await getArrivalDispatchInfo(appointmentId);
    if (info) {
      const recipientSet = new Set<number>();

      // 1 — Every active employee in the procedure's section.
      if (info.section_id !== null) {
        const sectionUsers = await listUserIdsBySection(info.section_id);
        sectionUsers.forEach(id => recipientSet.add(id));
      } else {
        // section_id IS NULL: fall back to doctor + student only; log to audit.
        console.warn(`[arrival] appointment ${appointmentId} type has no section assigned`);
      }

      // 2 — Assigned doctor (explicit, covers cross-section cases).
      const doctorUserId = await getUserIdByEmployeeId(info.doctor_id);
      if (doctorUserId) recipientSet.add(doctorUserId);

      // 3 — Assigned student (if any).
      if (info.academic_id !== null) {
        const studentUserId = await getUserIdByAcademicId(info.academic_id);
        if (studentUserId) recipientSet.add(studentUserId);
      }

      const lateByMin = row?.late_by_minutes ?? null;
      const arrivedTime = info.arrived_at
        ? new Date(info.arrived_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

      const title =
        arrivalStatus === 'On Time' ? 'Patient arrived'
        : arrivalStatus === 'Late'  ? 'Patient arrived late'
        :                             'Patient marked no-show';

      const message =
        arrivalStatus === 'No Show'
          ? `${info.patient_name} (File #${info.file_number}) did not attend their ${info.procedure_name} appointment.`
          : arrivalStatus === 'Late' && lateByMin !== null
          ? `${info.patient_name} (File #${info.file_number}) arrived late for ${info.procedure_name}. Late by ${lateByMin} min.`
          : `${info.patient_name} (File #${info.file_number}) arrived on time for ${info.procedure_name}.`;

      if (recipientSet.size > 0) {
        await dispatchToUsers([...recipientSet], {
          type:              'appointment.patient_arrived',
          title,
          message,
          linkTo:            buildLinkTo('appointment.patient_arrived', appointmentId, 'Doctor'),
          relatedEntityType: 'Appointments',
          relatedEntityId:   appointmentId,
        });
      }
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'appointment.patient_arrived', appointmentId, err });
  }

  return { alreadySet: false, row };
}

export async function clearArrivalService(
  appointmentId: number,
  isAdmin:        boolean,
): Promise<boolean> {
  return clearArrival(appointmentId, isAdmin);
  // No correction notification on undo — see feature spec §4.4.
  // Audit trail is in Audit_Log (written by the audit middleware on the route).
}
