import { Router } from 'express';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { guardClinicalPost } from '../middleware/appointment-active.middleware';
import * as controller from '../controllers/dental-chart.controller';

const router = Router();

// Get all tooth notes for a medical record
router.get(
  '/record/:recordId',
  auth,
  authorize('Admin', 'Doctor', 'Student', 'DentalAssistant'),
  controller.getByRecord,
);

// Add a tooth note (immutability guard enforced)
router.post(
  '/',
  auth,
  authorize('Doctor', 'Student'),
  guardClinicalPost(),
  controller.addNote,
);

// Delete a tooth note
router.delete(
  '/:noteId',
  auth,
  authorize('Doctor', 'Admin'),
  controller.deleteNote,
);

export default router;
