import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as appointmentController from '../controllers/appointment.controller';

const isoDateTime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
  'Use ISO datetime format (YYYY-MM-DDTHH:mm…)',
);

// POST /appointments — end_time is computed server-side from the appointment type
const createSchema = z.object({
  patientId:            z.number().int().positive(),
  doctorId:             z.number().int().positive(),
  clinicId:             z.number().int().positive().optional(),
  academicId:           z.number().int().positive().nullable().optional(),
  appointmentTypeId:    z.number().int().positive(),
  appointmentStartTime: isoDateTime,
});

const updateSchema = z.object({
  doctorId:             z.number().int().positive(),
  clinicId:             z.number().int().positive().optional(),
  academicId:           z.number().int().positive().nullable().optional(),
  appointmentTypeId:    z.number().int().positive(),
  appointmentStartTime: isoDateTime,
  appointmentEndTime:   isoDateTime,
});

const statusSchema = z.object({
  status: z.enum(['Scheduled', 'Checked-In', 'In Progress', 'Completed', 'Canceled', 'No Show']),
});

const arrivalSchema = z.object({
  arrival_status: z.enum(['On Time', 'Late', 'No Show']),
});

const router = Router();

// Static routes first (must come before /:id)
router.get(
  '/today',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  appointmentController.today,
);

router.get(
  '/types',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  appointmentController.types,
);

router.get(
  '/doctors',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  appointmentController.doctors,
);

router.get(
  '/students',
  auth,
  authorize('Admin', 'Receptionist'),
  appointmentController.students,
);

router.get(
  '/available-days',
  auth,
  authorize('Receptionist', 'Admin'),
  appointmentController.availableDays,
);

router.get(
  '/available-slots',
  auth,
  authorize('Receptionist', 'Admin'),
  appointmentController.availableSlots,
);

router.get(
  '/',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  appointmentController.list,
);

router.post(
  '/',
  auth,
  authorize('Admin', 'Receptionist'),
  validate(createSchema),
  audit({
    eventType: 'Appointment_Create',
    eventDescription: 'Appointment scheduled',
    includePatientId: true,
    getDetails: (req) => `Appointment scheduled for patient #${(req.body as any).patientId ?? ''}`,
  }),
  appointmentController.create,
);

// Parameterized routes
router.get(
  '/:id',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'),
  appointmentController.getById,
);

router.put(
  '/:id',
  auth,
  authorize('Admin', 'Receptionist'),
  validate(updateSchema),
  audit({
    eventType: 'Appointment_Update',
    eventDescription: 'Appointment details updated',
    includePatientId: true,
    getDetails: (req) => `Appointment #${req.params['id']} details updated`,
  }),
  appointmentController.update,
);

router.patch(
  '/:id/status',
  auth,
  authorize('Admin', 'Doctor', 'Receptionist'),
  validate(statusSchema),
  audit({
    eventType: 'Appointment_Update',
    eventDescription: 'Appointment status updated',
    getDetails: (req) => `Appointment #${req.params['id']} status set to ${(req.body as any).status ?? ''}`,
  }),
  appointmentController.updateStatus,
);

router.patch(
  '/:id/arrival',
  auth,
  authorize('Admin', 'Receptionist'),
  validate(arrivalSchema),
  audit({
    eventType: 'APPT_ARRIVAL_MARKED',
    eventDescription: 'Patient arrival status recorded',
    getDetails: (req) =>
      `Appointment #${req.params['id']} arrival set to ${(req.body as any).arrival_status ?? ''}`,
  }),
  appointmentController.markArrival,
);

router.delete(
  '/:id/arrival',
  auth,
  authorize('Admin', 'Receptionist'),
  audit({
    eventType: 'APPT_ARRIVAL_CLEARED',
    eventDescription: 'Patient arrival record cleared',
    getDetails: (req) => `Appointment #${req.params['id']} arrival cleared`,
  }),
  appointmentController.clearArrival,
);

export default router;
