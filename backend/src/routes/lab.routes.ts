import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import * as labController from '../controllers/lab.controller';


const createLabRequestSchema = z.object({
  patientId:            z.number().int().positive(),
  requestNote:          z.string().min(1).max(500),
  supervisorEmployeeId: z.number().int().positive().optional(),
});

const router = Router();

router.get(
  '/',
  auth,
  authorize('Doctor', 'Student', 'LabTechnician'),
  labController.list,
);

router.post(
  '/',
  auth,
  authorize('Student', 'Doctor'),
  validate(createLabRequestSchema),
  labController.create,
);

router.get(
  '/:id',
  auth,
  authorize('Doctor', 'Student', 'LabTechnician'),
  labController.getById,
);

const updateStatusSchema = z.object({
  status: z.enum(['Pending', 'Approved', 'Rejected', 'In Progress', 'Delivered']),
});

router.patch(
  '/:id/claim',
  auth,
  authorize('LabTechnician'),
  labController.claimRequest,
);

router.patch(
  '/:id/status',
  auth,
  authorize('LabTechnician'),
  validate(updateStatusSchema),
  labController.updateStatus,
);

const reviewSchema = z.object({
  status:             z.enum(['Approved', 'Rejected']),
  supervisorFeedback: z.string().max(500).optional(),
});

// Doctor-only: approve or reject a student-submitted lab request
router.patch(
  '/:id/review',
  auth,
  authorize('Doctor'),
  validate(reviewSchema),
  labController.review,
);

const createResponseSchema = z.object({
  responseNote: z.string().min(1).max(500),
});

router.post(
  '/:id/response',
  auth,
  authorize('LabTechnician'),
  validate(createResponseSchema),
  labController.createResponse,
);

export default router;
