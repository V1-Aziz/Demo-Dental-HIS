// Routes for the System_Settings module.
// GET list + single read: Admin only (list), Admin/Doctor/Student (single key).
// PUT update: Admin only. All mutations are audit-logged.
import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as systemSettingsController from '../controllers/system-settings.controller';

const updateSchema = z.object({
  value: z.string().min(1).max(500),
});

const router = Router();

router.get(
  '/',
  auth,
  authorize('Admin'),
  systemSettingsController.listSettings,
);

router.get(
  '/:key',
  auth,
  authorize('Admin', 'Doctor', 'Student'),
  systemSettingsController.getSetting,
);

router.put(
  '/:key',
  auth,
  authorize('Admin'),
  validate(updateSchema),
  audit({
    eventType:        'System_Settings_Update',
    eventDescription: 'System setting updated',
    getDetails:       (req) => `Setting "${req.params['key']}" updated to "${(req.body as any).value ?? ''}"`,
  }),
  systemSettingsController.updateSetting,
);

export default router;
