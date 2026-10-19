import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as controller from '../controllers/patient-file.controller';

const router = Router();

const ALL_VIEWERS = ['Admin', 'Doctor', 'Student', 'DentalAssistant'];
const CLINICIANS  = ['Doctor', 'Student'];

// Grouped visit timeline for the accordion
router.get(
  '/:id/visits',
  auth,
  authorize(...ALL_VIEWERS),
  controller.getVisitTimeline,
);

// All clinical entries for one visit
router.get(
  '/:id/visits/:appointmentId/content',
  auth,
  authorize(...ALL_VIEWERS),
  controller.getVisitContent,
);

// Today's active appointments (write surface) — returns an array for multi-visit support
router.get(
  '/:id/visits/today',
  auth,
  authorize(...CLINICIANS),
  controller.getTodaysAppointments,
);

// Full tooth annotation history
router.get(
  '/:id/teeth/:toothNumber/history',
  auth,
  authorize(...ALL_VIEWERS),
  controller.getToothHistory,
);

// Full lab request detail
router.get(
  '/:id/lab-requests/:labRequestId',
  auth,
  authorize(...ALL_VIEWERS),
  controller.getLabRequestDetail,
);

export default router;
