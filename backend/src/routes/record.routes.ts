import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as recordController from '../controllers/record.controller';

const procedureNoteSchema = z.object({
  diagnosisType:        z.string().min(1).max(100),
  clinicalFindings:     z.string().min(1),
  radiographicFindings: z.string().min(1),
  progressNote:         z.string().min(1),
  supervisorEmployeeId: z.number().int().positive(),
});

const updateRecordSchema = z.object({
  chiefComplaint:  z.string().max(5000),
  chronicDiseases: z.string().max(100),
});

const diagnosisSchema = z.object({
  diagnosisType:        z.string().min(1).max(100),
  clinicalFindings:     z.string().min(1),
  radiographicFindings: z.string().min(1),
  progressNote:         z.string().min(1),
});

const treatmentSchema = z.object({
  treatmentType: z.string().min(1).max(100),
  treatmentNote: z.string().min(1),
  medicineName:  z.string().min(1).max(255),
  dosage:        z.string().min(1).max(100),
  duration:      z.string().min(1).max(100),
  cost:          z.number().nonnegative(),
});

const router = Router();

router.get(
  '/patient/:patientId',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  recordController.getByPatient,
);

router.patch(
  '/:id',
  auth,
  authorize('Admin', 'Doctor'),
  validate(updateRecordSchema),
  audit({ eventType: 'Record_Update', eventDescription: 'Clinical record updated', getDetails: (req) => `Clinical record #${req.params['id']} updated` }),
  recordController.update,
);

router.post(
  '/:id/procedure-notes',
  auth,
  authorize('Student'),
  validate(procedureNoteSchema),
  recordController.addProcedureNote,
);

router.post(
  '/:id/diagnoses',
  auth,
  authorize('Admin', 'Doctor'),
  validate(diagnosisSchema),
  audit({ eventType: 'Record_Update',  eventDescription: 'Diagnosis added to clinical record', getDetails: (req) => `Diagnosis added to record #${req.params['id']}: ${(req.body as any).diagnosisType ?? ''}` }),
  recordController.addDiagnosis,
);

router.post(
  '/:id/treatments',
  auth,
  authorize('Admin', 'Doctor', 'Student'),
  validate(treatmentSchema),
  audit({ eventType: 'Record_Update',  eventDescription: 'Treatment added to clinical record', getDetails: (req) => `Treatment added to record #${req.params['id']}: ${(req.body as any).treatmentType ?? ''}` }),
  recordController.addTreatment,
);

export default router;
