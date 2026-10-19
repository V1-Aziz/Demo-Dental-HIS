import { Request, Response } from 'express';
import * as service from '../services/patient-file.service';
import { success, notFound, serverError } from '../utils/response.util';

export async function getVisitTimeline(req: Request, res: Response): Promise<void> {
  try {
    const patientId = parseInt(req.params['id'], 10);
    const data = await service.getVisitTimeline(patientId);
    success(res, data);
  } catch (err) {
    console.error('[patient-file] getVisitTimeline error:', err);
    serverError(res);
  }
}

export async function getVisitContent(req: Request, res: Response): Promise<void> {
  try {
    const patientId     = parseInt(req.params['id'],            10);
    const appointmentId = parseInt(req.params['appointmentId'], 10);
    const data = await service.getVisitContent(patientId, appointmentId);
    if (!data) { notFound(res, 'Visit not found'); return; }
    success(res, data);
  } catch (err) {
    console.error('[patient-file] getVisitContent error:', err);
    serverError(res);
  }
}

export async function getTodaysAppointments(req: Request, res: Response): Promise<void> {
  try {
    const patientId  = parseInt(req.params['id'], 10);
    const userId     = req.user!.userId;
    const userRole   = req.user!.role;
    const academicId = req.user!.academicId;
    const data = await service.getTodaysAppointments(patientId, userId, userRole, academicId);
    success(res, data);
  } catch (err) {
    console.error('[patient-file] getTodaysAppointments error:', err);
    serverError(res);
  }
}

export async function getToothHistory(req: Request, res: Response): Promise<void> {
  try {
    const patientId   = parseInt(req.params['id'], 10);
    const toothNumber = req.params['toothNumber'];
    const data = await service.getToothHistory(patientId, toothNumber);
    success(res, data);
  } catch (err) {
    console.error('[patient-file] getToothHistory error:', err);
    serverError(res);
  }
}

export async function getLabRequestDetail(req: Request, res: Response): Promise<void> {
  try {
    const labRequestId = parseInt(req.params['labRequestId'], 10);
    const data = await service.getLabRequestDetail(labRequestId);
    if (!data) { notFound(res, 'Lab request not found'); return; }
    success(res, data);
  } catch (err) {
    console.error('[patient-file] getLabRequestDetail error:', err);
    serverError(res);
  }
}
