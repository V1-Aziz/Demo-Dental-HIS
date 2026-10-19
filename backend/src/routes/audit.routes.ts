import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as auditController from '../controllers/audit.controller';

const router = Router();

router.get('/', auth, authorize('Admin'), auditController.list);

export default router;
