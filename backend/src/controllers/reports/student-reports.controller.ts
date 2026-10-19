import { Request, Response } from 'express';
import {
  getStudentProcedureLogService,
  getSupervisorEvaluationService,
  getSupervisorsService,
} from '../../services/reports/student-reports.service';
import { success, badRequest, serverError } from '../../utils/response.util';

function parseSupervisorId(raw: unknown): { value: number | null; error?: string } {
  if (raw === undefined || raw === '' || raw === 'null') return { value: null };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { value: null, error: 'supervisorId must be a positive integer' };
  }
  return { value: parsed };
}

export async function getProcedureLog(req: Request, res: Response): Promise<void> {
  try {
    const { value, error } = parseSupervisorId(req.query['supervisorId']);
    if (error) {
      badRequest(res, error);
      return;
    }

    const data = await getStudentProcedureLogService(value);
    success(res, data);
  } catch (err) {
    console.error('getProcedureLog error:', err);
    serverError(res);
  }
}

export async function getEvaluationSummary(req: Request, res: Response): Promise<void> {
  try {
    const { value, error } = parseSupervisorId(req.query['supervisorId']);
    if (error) {
      badRequest(res, error);
      return;
    }

    const data = await getSupervisorEvaluationService(value);
    success(res, data);
  } catch (err) {
    console.error('getEvaluationSummary error:', err);
    serverError(res);
  }
}

export async function getSupervisors(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getSupervisorsService();
    success(res, data);
  } catch (err) {
    console.error('getSupervisors error:', err);
    serverError(res);
  }
}
