import { Router } from 'express';
import { auth } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { exportRequestSchema } from '../../validators/reports-export.validator';
import { exportReportController } from '../../controllers/reports/reports-export.controller';

const router = Router();

router.post('/export', auth, authorize('Admin'), validate(exportRequestSchema), exportReportController);

export default router;
