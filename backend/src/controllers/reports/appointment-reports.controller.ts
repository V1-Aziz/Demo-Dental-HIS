import { Request, Response } from 'express';
import {
  getAttendanceStatsService,
  getClinicOccupancyService,
  getClinicsService,
} from '../../services/reports/appointment-reports.service';
import { success, badRequest, serverError } from '../../utils/response.util';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export async function getAttendanceStats(req: Request, res: Response): Promise<void> {
  try {
    const startDate = String(req.query['startDate'] || '');
    const endDate = String(req.query['endDate'] || '');
    const clinicIdRaw = req.query['clinicId'];

    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      badRequest(res, 'startDate and endDate are required in YYYY-MM-DD format');
      return;
    }

    let clinicId: number | null = null;
    if (clinicIdRaw !== undefined && clinicIdRaw !== '' && clinicIdRaw !== 'null') {
      const parsed = Number(clinicIdRaw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        badRequest(res, 'clinicId must be a positive integer');
        return;
      }
      clinicId = parsed;
    }

    const data = await getAttendanceStatsService(startDate, endDate, clinicId);
    success(res, data);
  } catch (err) {
    console.error('getAttendanceStats error:', err);
    serverError(res);
  }
}

export async function getClinicOccupancy(req: Request, res: Response): Promise<void> {
  try {
    const startDate = String(req.query['startDate'] || '');
    const endDate = String(req.query['endDate'] || '');

    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      badRequest(res, 'startDate and endDate are required in YYYY-MM-DD format');
      return;
    }

    const data = await getClinicOccupancyService(startDate, endDate);
    success(res, data);
  } catch (err) {
    console.error('getClinicOccupancy error:', err);
    serverError(res);
  }
}

export async function getClinics(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getClinicsService();
    success(res, data);
  } catch (err) {
    console.error('getClinics error:', err);
    serverError(res);
  }
}
