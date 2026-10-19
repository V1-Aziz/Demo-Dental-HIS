import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, created, badRequest, serverError, notFound, conflict } from '../utils/response.util';
import {
  listAppointmentsService,
  getTodayAppointmentsService,
  getAppointmentByIdService,
  createAppointmentService,
  updateAppointmentStatusService,
  updateAppointmentService,
  getAppointmentTypesService,
  getDoctorsService,
  getStudentsService,
  getAvailableDaysService,
  getAvailableSlotsService,
  markArrivalService,
  clearArrivalService,
} from '../services/appointment.service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const filters: {
      date?: string; dateFrom?: string; dateTo?: string; doctorId?: number; status?: string; search?: string; academicId?: number;
    } = {
      date:     req.query['date']     ? String(req.query['date'])                   : undefined,
      dateFrom: req.query['dateFrom'] ? String(req.query['dateFrom'])               : undefined,
      dateTo:   req.query['dateTo']   ? String(req.query['dateTo'])                 : undefined,
      doctorId: req.query['doctorId'] ? parseInt(String(req.query['doctorId']), 10) : undefined,
      status:   req.query['status']   ? String(req.query['status'])                 : undefined,
      search:   req.query['search']   ? String(req.query['search'])                 : undefined,
    };
    if (req.user?.role === 'Student' && req.user.academicId) {
      filters.academicId = req.user.academicId;
    }
    if (req.user?.role === 'Doctor' && req.user.employeeId) {
      filters.doctorId = req.user.employeeId;
    }
    const result = await listAppointmentsService(filters, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function today(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await getTodayAppointmentsService();
    success(res, rows);
  } catch {
    serverError(res);
  }
}

export async function types(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await getAppointmentTypesService();
    success(res, rows);
  } catch {
    serverError(res);
  }
}

export async function doctors(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await getDoctorsService();
    success(res, rows);
  } catch {
    serverError(res);
  }
}

export async function students(req: Request, res: Response): Promise<void> {
  try {
    const supervisorId = req.query['supervisor_id']
      ? parseInt(String(req.query['supervisor_id']), 10)
      : undefined;
    const rows = await getStudentsService(supervisorId);
    success(res, rows);
  } catch {
    serverError(res);
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid appointment ID'); return; }
    const appt = await getAppointmentByIdService(id);
    if (!appt) { notFound(res, 'Appointment not found'); return; }
    success(res, appt);
  } catch {
    serverError(res);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const bookedBy = req.user?.userId ?? 0;
    const result = await createAppointmentService({ ...req.body, bookedBy });
    created(res, result, 'Appointment booked successfully');
  } catch (err) {
    if (err instanceof Error && err.message === 'SLOT_TAKEN') {
      badRequest(res, 'The selected time slot is no longer available. Please choose another.');
      return;
    }
    if (err instanceof Error && err.message === 'STUDENT_SLOT_TAKEN') {
      badRequest(res, 'The selected student is not available at this time. Please choose another slot.');
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_TYPE') {
      badRequest(res, 'Invalid appointment type.');
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_SUPERVISION') {
      badRequest(res, 'The selected student is not supervised by the selected doctor.');
      return;
    }
    serverError(res);
  }
}

export async function updateStatus(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid appointment ID'); return; }
    await updateAppointmentStatusService(id, req.body.status);
    success(res, null, 'Status updated');
  } catch {
    serverError(res);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid appointment ID'); return; }
    await updateAppointmentService(id, req.body);
    success(res, null, 'Appointment updated');
  } catch {
    serverError(res);
  }
}

export async function availableDays(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = parseInt(String(req.query['doctor_id'] ?? ''), 10);
    const year     = parseInt(String(req.query['year']      ?? ''), 10);
    const month    = parseInt(String(req.query['month']     ?? ''), 10);

    if (isNaN(doctorId) || isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      badRequest(res, 'doctor_id, year, and month (1–12) are required');
      return;
    }

    const result = await getAvailableDaysService(doctorId, year, month);
    success(res, result);
  } catch {
    serverError(res);
  }
}

export async function markArrival(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid appointment ID'); return; }

    const { arrival_status } = req.body as { arrival_status: 'On Time' | 'Late' | 'No Show' };

    const result = await markArrivalService(id, arrival_status);

    if (result.alreadySet) {
      conflict(res, 'Arrival is already recorded for this appointment. Use DELETE /arrival to undo first.');
      return;
    }

    if (result.row === null) {
      notFound(res, 'Appointment not found');
      return;
    }

    success(res, result.row, 'Arrival recorded');
  } catch {
    serverError(res);
  }
}

export async function clearArrival(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid appointment ID'); return; }

    const isAdmin = req.user?.role === 'Admin';
    const cleared = await clearArrivalService(id, isAdmin);

    if (!cleared) {
      // Row not found, already cleared, or undo window expired for Receptionist.
      notFound(res, 'Arrival record not found or undo window has expired');
      return;
    }

    success(res, null, 'Arrival record cleared');
  } catch {
    serverError(res);
  }
}

export async function availableSlots(req: Request, res: Response): Promise<void> {
  try {
    const doctorId  = parseInt(String(req.query['doctor_id']  ?? ''), 10);
    const date      = String(req.query['date'] ?? '');
    const typeId    = parseInt(String(req.query['type_id']    ?? ''), 10);
    const studentId = req.query['student_id']
      ? parseInt(String(req.query['student_id']), 10)
      : undefined;

    if (isNaN(doctorId) || !date || isNaN(typeId)) {
      badRequest(res, 'doctor_id, date (YYYY-MM-DD), and type_id are required');
      return;
    }

    const slots = await getAvailableSlotsService(doctorId, date, typeId, studentId);
    success(res, { slots });
  } catch {
    serverError(res);
  }
}
