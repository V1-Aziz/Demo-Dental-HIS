import { Request, Response } from 'express';
import {
  getLowStockService,
  getConsumptionService,
  getCategoriesService,
} from '../../services/reports/inventory-reports.service';
import { success, badRequest, serverError } from '../../utils/response.util';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export async function getLowStock(req: Request, res: Response): Promise<void> {
  try {
    const categoryRaw = req.query['category'];
    const category =
      categoryRaw !== undefined && categoryRaw !== '' && categoryRaw !== 'null'
        ? String(categoryRaw)
        : null;

    const data = await getLowStockService(category);
    success(res, data);
  } catch (err) {
    console.error('getLowStock error:', err);
    serverError(res);
  }
}

export async function getConsumption(req: Request, res: Response): Promise<void> {
  try {
    const startDate = String(req.query['startDate'] || '');
    const endDate = String(req.query['endDate'] || '');
    const categoryRaw = req.query['category'];

    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      badRequest(res, 'startDate and endDate are required in YYYY-MM-DD format');
      return;
    }

    const category =
      categoryRaw !== undefined && categoryRaw !== '' && categoryRaw !== 'null'
        ? String(categoryRaw)
        : null;

    const data = await getConsumptionService(startDate, endDate, category);
    success(res, data);
  } catch (err) {
    console.error('getConsumption error:', err);
    serverError(res);
  }
}

export async function getCategories(_req: Request, res: Response): Promise<void> {
  try {
    const data = await getCategoriesService();
    success(res, data);
  } catch (err) {
    console.error('getCategories error:', err);
    serverError(res);
  }
}
