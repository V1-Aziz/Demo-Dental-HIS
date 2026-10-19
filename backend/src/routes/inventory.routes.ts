// Inventory routes — maps HTTP methods and paths to controller handlers.
// Role-based access: InventoryManager/Admin manage items and review requests;
// DentalAssistant/LabTechnician can submit new requests.
import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as inventoryController from '../controllers/inventory.controller';

const router = Router();

router.get(
  '/requests/my',
  auth,
  authorize('Admin', 'InventoryManager', 'DentalAssistant', 'LabTechnician'),
  inventoryController.listMyRequests,
);

router.get(
  '/requests',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.listRequests,
);

router.post(
  '/requests',
  auth,
  authorize('DentalAssistant', 'LabTechnician'),
  inventoryController.createRequest,
);

router.patch(
  '/requests/:id',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.updateRequestStatus,
);

router.get(
  '/removed-items',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.listRemovedItems,
);

router.get(
  '/items',
  auth,
  authorize('Admin', 'InventoryManager', 'DentalAssistant', 'LabTechnician'),
  inventoryController.listItems,
);

router.post(
  '/items',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.registerItem,
);

router.patch(
  '/items/:id',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.updateItem,
);

router.delete(
  '/items/:id',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.deleteItem,
);

router.post(
  '/items/:id/deposit',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.depositItem,
);

router.post(
  '/items/:id/withdraw',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.withdrawItem,
);

router.get(
  '/items/:id/batches',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.listItemBatches,
);

router.get(
  '/latest-activity',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.listLatestActivity,
);

router.get(
  '/activity-history',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.listActivityHistory,
);

router.get(
  '/transactions',
  auth,
  authorize('Admin', 'InventoryManager'),
  inventoryController.listTransactions,
);

export default router;
