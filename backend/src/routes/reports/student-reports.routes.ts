import { Router } from 'express';
import { auth } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  getProcedureLog,
  getEvaluationSummary,
  getSupervisors,
} from '../../controllers/reports/student-reports.controller';

const router = Router();

router.get('/students/procedure-log', auth, authorize('Admin'), getProcedureLog);
router.get('/students/evaluation-summary', auth, authorize('Admin'), getEvaluationSummary);
router.get('/students/supervisors', auth, authorize('Admin'), getSupervisors);

export default router;
