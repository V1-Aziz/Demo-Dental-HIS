import { Request, Response } from 'express';
import { success, created, serverError, notFound, badRequest } from '../utils/response.util';
import {
  getPatientRecordService,
  updateRecordService,
  createDiagnosisService,
  createTreatmentService,
  createProcedureNoteByStudentService,
} from '../services/record.service';

export async function getByPatient(req: Request, res: Response): Promise<void> {
  try {
    const patientId = parseInt(req.params['patientId'], 10);
    if (isNaN(patientId)) { notFound(res, 'Invalid patient ID'); return; }
    const record = await getPatientRecordService(patientId);
    if (!record) { notFound(res, 'Medical record not found for this patient'); return; }
    success(res, record);
  } catch {
    serverError(res);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const recordId = parseInt(req.params['id'], 10);
    if (isNaN(recordId)) { notFound(res, 'Invalid record ID'); return; }
    await updateRecordService(recordId, req.body);
    success(res, null, 'Medical record updated');
  } catch {
    serverError(res);
  }
}

export async function addDiagnosis(req: Request, res: Response): Promise<void> {
  try {
    const recordId = parseInt(req.params['id'], 10);
    if (isNaN(recordId)) { notFound(res, 'Invalid record ID'); return; }
    const userId = req.user!.userId;
    const result = await createDiagnosisService(userId, recordId, req.body);
    created(res, result, 'Diagnosis added');
  } catch (err: any) {
    if (err?.message?.includes('Employee record not found')) {
      badRequest(res, err.message);
    } else {
      serverError(res);
    }
  }
}

export async function addProcedureNote(req: Request, res: Response): Promise<void> {
  try {
    const recordId  = parseInt(req.params['id'], 10);
    if (isNaN(recordId)) { notFound(res, 'Invalid record ID'); return; }
    const academicId = req.user!.academicId;
    if (!academicId) { badRequest(res, 'Student academic ID not found in token'); return; }
    const result = await createProcedureNoteByStudentService(academicId, recordId, req.body);
    created(res, result, 'Procedure note added');
  } catch {
    serverError(res);
  }
}

export async function addTreatment(req: Request, res: Response): Promise<void> {
  try {
    const recordId = parseInt(req.params['id'], 10);
    if (isNaN(recordId)) { notFound(res, 'Invalid record ID'); return; }
    const userId = req.user!.userId;
    const result = await createTreatmentService(userId, recordId, req.body);
    created(res, result, 'Treatment added');
  } catch (err: any) {
    if (err?.message?.includes('Employee record not found')) {
      badRequest(res, err.message);
    } else {
      serverError(res);
    }
  }
}
