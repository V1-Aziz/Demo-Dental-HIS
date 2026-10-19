// Screening-requests module routes.
// Allows doctors/students to request screenings and radiologists to view theirs.
import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import { createScreeningRequestSchema } from '../validators/screening-requests.validator';
import * as controller from '../controllers/screening-requests.controller';

const router = Router();

// GET /screening-requests/mine — Radiologist: list my pending requests
router.get(
  '/mine',
  auth,
  authorize('Radiologist'),
  controller.listMine,
);

// GET /screening-requests/record/:recordId — read-only for all clinical roles
router.get(
  '/record/:recordId',
  auth,
  authorize('Admin', 'Doctor', 'Student', 'Radiologist'),
  controller.listByRecord,
);

// POST /screening-requests — Doctor/Student creates and auto-routes a request
router.post(
  '/',
  auth,
  authorize('Doctor', 'Student'),
  validate(createScreeningRequestSchema),
  audit({
    eventType:        'Screening_Request_Created',
    eventDescription: 'Screening request created',
    getDetails:       (req) => `Request for patient #${(req.body as any).patient_id}`,
  }),
  controller.create,
);

// PATCH /screening-requests/:id/cancel — Doctor/Student cancels own request
router.patch(
  '/:id/cancel',
  auth,
  authorize('Doctor', 'Student'),
  audit({
    eventType:        'Screening_Request_Cancelled',
    eventDescription: 'Screening request cancelled',
    getDetails:       (req) => `Request #${req.params['id']} cancelled`,
  }),
  controller.cancel,
);

export default router;
