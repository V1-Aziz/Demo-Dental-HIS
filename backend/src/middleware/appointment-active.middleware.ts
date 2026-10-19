import { Request, Response, NextFunction } from 'express';
import sql from 'mssql';
import { getPool } from '../config/db.config';
import { forbidden, notFound, serverError } from '../utils/response.util';

// Enforces clinical record immutability: clinical writes are only allowed on
// today's active appointment. Past visits are read-only (PAST_VISIT_IMMUTABLE).
// Canceled/No-Show appointments block writes (INACTIVE_APPOINTMENT).
//
// POST:   appointment_id must be in req.body
// PATCH/DELETE: appointment_id is looked up from the target row
//
// Exempt routes (academic review + resubmit) call next() immediately and are
// handled by exempting them at the route level rather than skipping this middleware.

interface AppointmentRow {
  appointment_start_time: Date;
  status: string;
}

async function loadAppointmentById(appointmentId: number): Promise<AppointmentRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, appointmentId)
    .query<AppointmentRow>(
      `SELECT appointment_start_time, status
         FROM Appointments
        WHERE appointment_id = @id`,
    );
  return result.recordset[0] ?? null;
}

// Resolves appointment_id for PATCH/DELETE from the clinical table row.
// tableName and pkColumn must come from trusted internal constants, never user input.
async function resolveAppointmentIdFromRow(
  tableName: string,
  pkColumn: string,
  rowId: number,
): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('rowId', sql.Int, rowId)
    .query<{ appointment_id: number | null }>(
      `SELECT appointment_id FROM ${tableName} WHERE ${pkColumn} = @rowId`,
    );
  const row = result.recordset[0];
  return row ? row.appointment_id : null;
}

function guardRow(appt: AppointmentRow, res: Response): boolean {
  const today = new Date();
  const apptDate = new Date(appt.appointment_start_time);
  const isToday =
    apptDate.getFullYear() === today.getFullYear() &&
    apptDate.getMonth() === today.getMonth() &&
    apptDate.getDate() === today.getDate();

  if (!isToday) {
    forbidden(res, 'PAST_VISIT_IMMUTABLE');
    return false;
  }

  if (appt.status === 'Canceled' || appt.status === 'No Show') {
    forbidden(res, 'INACTIVE_APPOINTMENT');
    return false;
  }

  return true;
}

// Factory: returns middleware for POST (reads appointment_id from body)
export function guardClinicalPost() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appointmentId = Number(req.body?.appointment_id);
      if (!appointmentId) {
        next(); // no appointment_id on body — let validation catch it
        return;
      }

      const appt = await loadAppointmentById(appointmentId);
      if (!appt) { notFound(res, 'Appointment not found'); return; }
      if (!guardRow(appt, res)) return;
      next();
    } catch {
      serverError(res);
    }
  };
}

// Factory: returns middleware for PATCH/DELETE (resolves appointment_id from DB row)
export function guardClinicalMutation(tableName: string, pkParam: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rowId = Number(req.params[pkParam]);
      if (!rowId) { next(); return; }

      const appointmentId = await resolveAppointmentIdFromRow(tableName, pkParam, rowId);
      if (appointmentId === null) {
        // Row has no appointment_id (legacy row) — allow through; backend still validates
        next();
        return;
      }

      const appt = await loadAppointmentById(appointmentId);
      if (!appt) { notFound(res, 'Appointment not found'); return; }
      if (!guardRow(appt, res)) return;
      next();
    } catch {
      serverError(res);
    }
  };
}
