import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as diagnosisController from '../controllers/diagnosis.controller';

const submitSchema = z.object({
  patientId:            z.number().int().positive(),
  appointmentId:        z.number().int().positive().optional(),
  toothNumber:          z.string().max(10).optional(),
  diagnosisType:        z.string().min(1).max(100),
  clinicalFindings:     z.string().min(1),
  radiographicFindings: z.string().min(1),
  progressNote:         z.string().min(1),
});

const reviewSchema = z.object({
  status:   z.enum(['Approved', 'Rejected']),
  feedback: z.string().min(1),
});

const router = Router();

router.get('/student-submissions', auth, authorize('Doctor'), diagnosisController.studentSubmissions);
router.get('/my-notes', auth, authorize('Student'), diagnosisController.myNotes);
router.post('/submit', auth, authorize('Student', 'Doctor'), validate(submitSchema), audit({ eventType: 'Diagnosis_Create', eventDescription: 'Diagnosis submitted', includePatientId: true, getDetails: (req) => `Diagnosis for patient #${(req.body as any).patientId ?? ''}: ${(req.body as any).diagnosisType ?? ''}` }), diagnosisController.submit);
router.patch('/:id/review', auth, authorize('Doctor', 'Admin'), validate(reviewSchema), audit({ eventType: 'Diagnosis_Update', eventDescription: 'Student diagnosis reviewed',           getDetails: (req) => `Diagnosis #${req.params['id']} ${(req.body as any).status ?? ''}` }), diagnosisController.review);

export default router;
