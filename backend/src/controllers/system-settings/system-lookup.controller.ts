import { Request, Response } from 'express';
import {
  success,
  created,
  badRequest,
  notFound,
  conflict,
  forbidden,
  serverError,
} from '../../utils/response.util';
import * as svc from '../../services/system-settings/system-lookup.service';

export async function listCategories(_req: Request, res: Response): Promise<void> {
  try {
    const categories = await svc.listCategories();
    success(res, categories);
  } catch {
    serverError(res);
  }
}

export async function listValues(req: Request, res: Response): Promise<void> {
  try {
    const categoryKey = req.params['categoryKey'];
    const meta = svc.getCategoryMeta(categoryKey);
    if (!meta) { notFound(res, 'Category not found'); return; }

    const result = await svc.listCategoryValues(categoryKey);
    success(res, result);
  } catch {
    serverError(res);
  }
}

export async function addValue(req: Request, res: Response): Promise<void> {
  try {
    const categoryKey = req.params['categoryKey'];
    const createdBy   = req.user!.userId;
    const value = await svc.addValue(categoryKey, req.body, createdBy);
    created(res, value, 'Value added');
  } catch (err: any) {
    if (err?.code === 'NOT_FOUND')          { notFound(res, err.message);  return; }
    if (err?.code === 'READ_ONLY')          { forbidden(res, err.message); return; }
    if (err?.code === 'METHOD_NOT_ALLOWED') { res.status(405).json({ success: false, error: err.message }); return; }
    if (err?.message?.includes('UQ_SysLookup')) { conflict(res, 'A value with this label already exists'); return; }
    serverError(res);
  }
}

export async function updateValue(req: Request, res: Response): Promise<void> {
  try {
    const categoryKey = req.params['categoryKey'];
    const valueId     = parseInt(req.params['valueId'], 10);
    const updatedBy   = req.user!.userId;

    if (isNaN(valueId)) { badRequest(res, 'Invalid value ID'); return; }

    const result = await svc.updateValue(categoryKey, valueId, req.body, updatedBy);
    success(res, result, 'Value updated');
  } catch (err: any) {
    if (err?.code === 'NOT_FOUND') { notFound(res, err.message);  return; }
    if (err?.code === 'READ_ONLY') { forbidden(res, err.message); return; }
    serverError(res);
  }
}

export async function deleteValue(req: Request, res: Response): Promise<void> {
  try {
    const categoryKey = req.params['categoryKey'];
    const valueId     = parseInt(req.params['valueId'], 10);

    if (isNaN(valueId)) { badRequest(res, 'Invalid value ID'); return; }

    await svc.deleteValue(categoryKey, valueId);
    success(res, null, 'Value deleted');
  } catch (err: any) {
    if (err?.code === 'NOT_FOUND') { notFound(res, err.message);  return; }
    if (err?.code === 'READ_ONLY') { forbidden(res, err.message); return; }
    if (err?.code === 'METHOD_NOT_ALLOWED') { res.status(405).json({ success: false, error: err.message }); return; }
    if (err?.message?.includes('FK_') || err?.message?.includes('REFERENCE')) {
      conflict(res, 'IN_USE: This value is referenced by existing records. Deactivate it instead.');
      return;
    }
    serverError(res);
  }
}

export async function reorderValues(req: Request, res: Response): Promise<void> {
  try {
    const categoryKey = req.params['categoryKey'];
    const updatedBy   = req.user!.userId;
    const { orderedIds } = req.body as { orderedIds: number[] };

    await svc.reorderValues(categoryKey, orderedIds, updatedBy);
    success(res, null, 'Order saved');
  } catch (err: any) {
    if (err?.code === 'NOT_FOUND') { notFound(res, err.message);  return; }
    if (err?.code === 'READ_ONLY') { forbidden(res, err.message); return; }
    serverError(res);
  }
}

export async function getPublicValues(req: Request, res: Response): Promise<void> {
  try {
    const categoryKey = req.params['categoryKey'];
    const values = await svc.getPublicValues(categoryKey);
    if (values === null) { notFound(res, 'Category not found or not publicly accessible'); return; }
    success(res, values);
  } catch {
    serverError(res);
  }
}
