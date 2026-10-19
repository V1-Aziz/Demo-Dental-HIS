// Notification endpoints — every route requires auth; all 7 roles are allowed
// because notifications are per-user (RBAC enforcement is userId from JWT).
import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as notificationController from '../controllers/notification.controller';

const ALL_ROLES = [
  'Admin', 'Doctor', 'Student', 'Receptionist',
  'LabTechnician', 'DentalAssistant', 'InventoryManager',
] as const;

const router = Router();

// Note: /mark-all-read must be declared before /:id/read so Express does not
// try to parse "mark-all-read" as an :id param.
router.get('/',                    auth, authorize(...ALL_ROLES), notificationController.list);
router.get('/unread-count',        auth, authorize(...ALL_ROLES), notificationController.unreadCount);
router.patch('/mark-all-read',     auth, authorize(...ALL_ROLES), notificationController.markAllRead);
router.patch('/:id/read',          auth, authorize(...ALL_ROLES), notificationController.markRead);

export default router;
