import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as patientController from '../controllers/patient.controller';

const createPatientSchema = z.object({
  fileNumber: z.number().int().positive(),
  nationalId: z.number().int().positive(),
  firstName:  z.string().min(1).max(100),
  middleName: z.string().min(1).max(100),
  lastName:   z.string().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  gender:     z.enum(['Male', 'Female']),
  phoneNumber: z.string().max(20).optional(),
  email:       z.string().email().max(255).optional(),
});

const router = Router();

router.get(
  '/search',
  auth,
  authorize('Admin', 'Receptionist'),
  patientController.search,
);

router.post(
  '/',
  auth,
  authorize('Admin', 'Receptionist'),
  validate(createPatientSchema),
  audit({ eventType: 'Patient_Create', eventDescription: 'New patient registered', getDetails: (req) => `New patient registered: ${(req.body as any).firstName ?? ''} ${(req.body as any).lastName ?? ''} (File #${(req.body as any).fileNumber ?? ''})` }),
  patientController.create,
);

router.get(
  '/',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant'),
  patientController.list,
);

router.get('/my', auth, authorize('Student'), patientController.listMine);

router.get(
  '/:id',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  patientController.getById,
);

router.patch(
  '/:id/phone',
  auth,
  authorize('Admin', 'Receptionist'),
  validate(z.object({ phoneNumber: z.string().max(20) })),
  audit({ eventType: 'Patient_Update', eventDescription: 'Patient phone number updated', getDetails: (req) => `Patient #${req.params['id']} phone number updated` }),
  patientController.updatePhone,
);

export default router;
