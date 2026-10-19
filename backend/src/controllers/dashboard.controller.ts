import { Request, Response } from 'express';
import { success, serverError } from '../utils/response.util';
import { receptionistStatsService, inventoryDashboardStatsService, adminDashboardStatsService, systemPerformanceService } from '../services/dashboard.service';

export async function receptionistStats(_req: Request, res: Response): Promise<void> {
  try {
    const data = await receptionistStatsService();
    success(res, data);
  } catch {
    serverError(res);
  }
}

export async function inventoryDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    const data = await inventoryDashboardStatsService();
    success(res, data);
  } catch {
    serverError(res);
  }
}

export async function adminDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    const data = await adminDashboardStatsService();
    success(res, data);
  } catch {
    serverError(res);
  }
}

export async function systemPerformance(_req: Request, res: Response): Promise<void> {
  try {
    const data = await systemPerformanceService();
    success(res, data);
  } catch {
    serverError(res);
  }
}
