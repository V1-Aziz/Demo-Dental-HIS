import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as pendingCtrl from '../controllers/system-settings/pending-registration.controller';
import * as lookupCtrl  from '../controllers/system-settings/system-lookup.controller';
import {
  approveRegistrationSchema,
  rejectRegistrationSchema,
} from '../validators/pending-registration.validator';
import {
  createLookupValueSchema,
  updateLookupValueSchema,
  reorderLookupValuesSchema,
} from '../validators/system-lookup.validator';

const router = Router();

const adminOnly = [auth, authorize('Admin')];

// ─── Pending Registrations ────────────────────────────────────────────────────

router.get('/registrations/count', ...adminOnly, pendingCtrl.getPendingCount);
router.get('/registrations',       ...adminOnly, pendingCtrl.listRegistrations);
router.get('/registrations/:id',   ...adminOnly, pendingCtrl.getRegistrationById);

router.post(
  '/registrations/:id/approve',
  ...adminOnly,
  validate(approveRegistrationSchema),
  audit({ eventType: 'REGISTRATION_APPROVED', eventDescription: 'Admin approved pending registration' }),
  pendingCtrl.approveRegistration,
);

router.post(
  '/registrations/:id/reject',
  ...adminOnly,
  validate(rejectRegistrationSchema),
  audit({ eventType: 'REGISTRATION_REJECTED', eventDescription: 'Admin rejected pending registration' }),
  pendingCtrl.rejectRegistration,
);

// ─── Lookup Categories & Values ───────────────────────────────────────────────

router.get('/lookups/categories', ...adminOnly, lookupCtrl.listCategories);

router.get('/lookups/:categoryKey', ...adminOnly, lookupCtrl.listValues);

router.post(
  '/lookups/:categoryKey',
  ...adminOnly,
  validate(createLookupValueSchema),
  audit({ eventType: 'LOOKUP_VALUE_ADDED', eventDescription: 'Lookup value added' }),
  lookupCtrl.addValue,
);

router.patch(
  '/lookups/:categoryKey/:valueId',
  ...adminOnly,
  validate(updateLookupValueSchema),
  audit({ eventType: 'LOOKUP_VALUE_UPDATED', eventDescription: 'Lookup value updated' }),
  lookupCtrl.updateValue,
);

router.delete(
  '/lookups/:categoryKey/:valueId',
  ...adminOnly,
  audit({ eventType: 'LOOKUP_VALUE_DELETED', eventDescription: 'Lookup value deleted' }),
  lookupCtrl.deleteValue,
);

router.put(
  '/lookups/:categoryKey/order',
  ...adminOnly,
  validate(reorderLookupValuesSchema),
  lookupCtrl.reorderValues,
);

export default router;
