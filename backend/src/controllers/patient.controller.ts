import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, created, serverError, notFound } from '../utils/response.util';
import {
  listPatientsService,
  searchPatientsService,
  listPatientsByStudentService,
  getPatientByIdService,
  createPatientService,
  updatePatientPhoneService,
} from '../services/patient.service';

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const q      = String(req.query['q'] ?? '').trim();
    const limit  = Math.min(parseInt(String(req.query['limit'] ?? '50'), 10) || 50, 100);
    const offset = 0;
    const rows   = await searchPatientsService(q, limit, offset);
    success(res, rows);
  } catch {
    serverError(res);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query['search'] ?? '');
    const result = await listPatientsService(search, limit, offset);
    success(res, { ...result, page, limit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[patient.list] Error:', msg);
    res.status(500).json({ success: false, error: 'Internal server error', debug: msg });
  }
}

export async function listMine(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query['search'] ?? '');
    const academicId = req.user?.academicId;
    if (!academicId) { success(res, { rows: [], total: 0, page, limit }); return; }
    const result = await listPatientsByStudentService(academicId, search, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const patientId = parseInt(req.params['id'], 10);
    if (isNaN(patientId)) {
      notFound(res, 'Invalid patient ID');
      return;
    }
    const patient = await getPatientByIdService(patientId);
    if (!patient) {
      notFound(res, 'Patient not found');
      return;
    }
    success(res, patient);
  } catch {
    serverError(res);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await createPatientService(req.body);
    created(res, result, 'Patient registered successfully');
  } catch (err) {
    console.error('[patient.create]', err instanceof Error ? err.message : err);
    serverError(res);
  }
}

export async function updatePhone(req: Request, res: Response): Promise<void> {
  try {
    const patientId = parseInt(req.params['id'], 10);
    if (isNaN(patientId)) { notFound(res, 'Invalid patient ID'); return; }
    await updatePatientPhoneService(patientId, req.body.phoneNumber);
    success(res, null, 'Phone number updated');
  } catch {
    serverError(res);
  }
}
