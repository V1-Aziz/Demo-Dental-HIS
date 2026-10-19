// Radiologist portal routes — dashboard, patient list, per-patient detail.
// All routes require Radiologist role.
import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import * as radiologistController from '../controllers/radiologist.controller';

const router = Router();

// GET /radiologist/dashboard — cards + top-5 pending
router.get(
  '/dashboard',
  auth,
  authorize('Radiologist'),
  radiologistController.dashboard,
);

// GET /radiologist/patients — same-day-appointment patients (no DOB)
router.get(
  '/patients',
  auth,
  authorize('Radiologist'),
  radiologistController.listPatients,
);

// GET /radiologist/patients/:id — minimal patient detail (no DOB)
router.get(
  '/patients/:id',
  auth,
  authorize('Radiologist'),
  radiologistController.getPatient,
);

// GET /radiologist/patients/:id/appointments-today — for upload modal selector
router.get(
  '/patients/:id/appointments-today',
  auth,
  authorize('Radiologist'),
  radiologistController.listTodaysAppointments,
);

export default router;
