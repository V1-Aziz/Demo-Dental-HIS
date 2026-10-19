import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as dashController from '../controllers/dashboard.controller';

const router = Router();

router.get('/receptionist', auth, authorize('Receptionist', 'Admin'), dashController.receptionistStats);
router.get('/inventory', auth, authorize('InventoryManager', 'Admin'), dashController.inventoryDashboardStats);
router.get('/admin', auth, authorize('Admin'), dashController.adminDashboardStats);
router.get('/system-performance', auth, authorize('Admin'), dashController.systemPerformance);

export default router;
