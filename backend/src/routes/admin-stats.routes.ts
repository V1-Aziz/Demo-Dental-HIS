// Admin stats routes — all endpoints require Admin role.
import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { sessionActivityMiddleware } from '../middleware/session-activity.middleware';
import { getActiveUsers } from '../controllers/admin-stats.controller';
import { Role } from '../enums/roles.enum';

const router = Router();

router.get(
  '/active-users',
  auth,
  sessionActivityMiddleware,
  authorize(Role.Admin),
  getActiveUsers,
);

export default router;
