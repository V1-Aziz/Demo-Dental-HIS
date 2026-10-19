// HTTP handlers for the Radiologist portal endpoints.
import { Request, Response } from 'express';
import {
  getRadiologistDashboardService,
  listRadiologistPatientsService,
  getRadiologistPatientService,
  listTodaysAppointmentsForPatientService,
  RadiologistError,
} from '../services/radiologist.service';
import { success, badRequest, forbidden, notFound, serverError } from '../utils/response.util';

function mapError(res: Response, err: unknown): void {
  if (err instanceof RadiologistError) {
    switch (err.statusCode) {
      case 400: badRequest(res, err.message); return;
      case 403: forbidden(res, err.message); return;
      case 404: notFound(res, err.message); return;
      case 503: res.status(503).json({ success: false, error: err.message }); return;
    }
  }
  console.error('[radiologist] service error:', err);
  serverError(res);
}

// GET /radiologist/dashboard
export async function dashboard(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) { forbidden(res); return; }
  try {
    const data = await getRadiologistDashboardService(user.userId);
    success(res, data);
  } catch (err) {
    mapError(res, err);
  }
}

// GET /radiologist/patients
export async function listPatients(_req: Request, res: Response): Promise<void> {
  try {
    const patients = await listRadiologistPatientsService();
    success(res, patients);
  } catch (err) {
    mapError(res, err);
  }
}

// GET /radiologist/patients/:id
export async function getPatient(req: Request, res: Response): Promise<void> {
  const patientId = parseInt(req.params['id'], 10);
  if (Number.isNaN(patientId) || patientId <= 0) {
    badRequest(res, 'Invalid patient ID');
    return;
  }
  try {
    const patient = await getRadiologistPatientService(patientId);
    success(res, patient);
  } catch (err) {
    mapError(res, err);
  }
}

// GET /radiologist/patients/:id/appointments-today
export async function listTodaysAppointments(req: Request, res: Response): Promise<void> {
  const patientId = parseInt(req.params['id'], 10);
  if (Number.isNaN(patientId) || patientId <= 0) {
    badRequest(res, 'Invalid patient ID');
    return;
  }
  try {
    const appts = await listTodaysAppointmentsForPatientService(patientId);
    success(res, appts);
  } catch (err) {
    mapError(res, err);
  }
}
