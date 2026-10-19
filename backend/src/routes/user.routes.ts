import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as userController from '../controllers/user.controller';

const router = Router();

router.get('/',               auth, authorize('Admin'),                     userController.list);
router.get('/roles',          auth, authorize('Admin'),                     userController.listRoles);
router.get('/employees',      auth, authorize('Admin', 'InventoryManager'), userController.listEmployees);
router.get('/:id/contacts',   auth, authorize('Admin'),                     userController.getUserContacts);
router.patch('/:id',          auth, authorize('Admin'),                     userController.updateFull);

export default router;
