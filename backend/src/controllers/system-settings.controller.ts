// Controller for System_Settings endpoints.
// Translates HTTP request/response; delegates all logic to system-settings.service.ts.
import { Request, Response } from 'express';
import { success, notFound, badRequest, serverError } from '../utils/response.util';
import {
  listAllSettingsService,
  getSettingService,
  updateSettingService,
} from '../services/system-settings.service';

export async function listSettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await listAllSettingsService();
    success(res, settings);
  } catch {
    serverError(res);
  }
}

export async function getSetting(req: Request, res: Response): Promise<void> {
  try {
    const key     = req.params['key'];
    const setting = await getSettingService(key);
    if (!setting) { notFound(res, 'Setting not found'); return; }
    success(res, setting);
  } catch {
    serverError(res);
  }
}

export async function updateSetting(req: Request, res: Response): Promise<void> {
  try {
    const key       = req.params['key'];
    const { value } = req.body as { value: string };
    const updatedBy = req.user!.userId;

    const updated = await updateSettingService(key, value, updatedBy);
    success(res, updated, 'Setting updated');
  } catch (err: any) {
    if (err?.message === 'SETTING_NOT_FOUND') { notFound(res, 'Setting not found'); return; }
    if (err?.message?.startsWith('INVALID_VALUE')) { badRequest(res, err.message.replace('INVALID_VALUE: ', '')); return; }
    serverError(res);
  }
}
