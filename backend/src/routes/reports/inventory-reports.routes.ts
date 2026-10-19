import { Router } from 'express';
import { auth } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  getLowStock,
  getConsumption,
  getCategories,
} from '../../controllers/reports/inventory-reports.controller';

const router = Router();

router.get('/inventory/low-stock', auth, authorize('Admin'), getLowStock);
router.get('/inventory/consumption', auth, authorize('Admin'), getConsumption);
router.get('/inventory/categories', auth, authorize('Admin'), getCategories);

export default router;
