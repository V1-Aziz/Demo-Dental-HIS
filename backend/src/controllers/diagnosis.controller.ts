import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, created, serverError, badRequest } from '../utils/response.util';
import {
  listStudentSubmissionsService,
  listStudentNotesService,
  submitDiagnosisService,
  reviewDiagnosisService,
} from '../services/diagnosis.service';

export async function studentSubmissions(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const doctorEmployeeId = req.user?.employeeId;
    if (!doctorEmployeeId) { badRequest(res, 'Employee ID required'); return; }
    const result = await listStudentSubmissionsService(doctorEmployeeId, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function myNotes(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const studentAcademicId = req.user?.academicId;
    if (!studentAcademicId) { badRequest(res, 'Academic ID required'); return; }
    const patientId = req.query['patientId'] ? parseInt(String(req.query['patientId']), 10) : undefined;
    const result = await listStudentNotesService(studentAcademicId, limit, offset, patientId);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function submit(req: Request, res: Response): Promise<void> {
  try {
    const academicId = req.user?.academicId;
    if (!academicId) { badRequest(res, 'Academic ID required'); return; }
    const { patientId, doctorId, ...diagData } = req.body;
    if (doctorId) diagData.doctorId = doctorId;
    const result = await submitDiagnosisService(academicId, patientId, diagData);
    created(res, result, 'Diagnosis submitted for review');
  } catch (err: any) {
    if (err?.message?.includes('No supervisor') || err?.message?.includes('No medical record')) {
      badRequest(res, err.message);
    } else {
      serverError(res);
    }
  }
}

export async function review(req: Request, res: Response): Promise<void> {
  try {
    const diagnosisId = parseInt(req.params['id'], 10);
    if (isNaN(diagnosisId)) { badRequest(res, 'Invalid diagnosis ID'); return; }
    const { status, feedback } = req.body;
    await reviewDiagnosisService(diagnosisId, status, feedback);
    success(res, null, `Diagnosis ${status.toLowerCase()}`);
  } catch {
    serverError(res);
  }
}
