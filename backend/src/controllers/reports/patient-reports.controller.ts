import { Request, Response } from 'express';
import { getNewRegistrationsService, getDemographicsService } from '../../services/reports/patient-reports.service';
import { success, badRequest, serverError } from '../../utils/response.util';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export async function getNewRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const startDate = String(req.query['startDate'] || '');
    const endDate = String(req.query['endDate'] || '');

    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      badRequest(res, 'startDate and endDate are required in YYYY-MM-DD format');
      return;
    }

    const data = await getNewRegistrationsService(startDate, endDate);
    success(res, data);
  } catch (err) {
    console.error('getNewRegistrations error:', err);
    serverError(res);
  }
}

export async function getDemographics(req: Request, res: Response): Promise<void> {
  try {
    const data = await getDemographicsService();
    success(res, data);
  } catch (err) {
    console.error('getDemographics error:', err);
    serverError(res);
  }
}
