// Screening module routes.
// Layered middleware order: verifyToken (auth) → authorize (RBAC) → multer →
// audit → controller.
// Upload is Radiologist-only.
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { audit } from '../middleware/audit.middleware';
import { screeningUpload } from '../middleware/upload.middleware';
import * as screeningController from '../controllers/screening.controller';

const router = Router();

// Wrap multer so its size/count errors become clean HTTP codes (413/415) rather
// than leaking to the global error handler as 500s.
function handleMulterErrors(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ success: false, error: 'One or more files exceed the 10 MB size limit' });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ success: false, error: 'A maximum of 10 images can be uploaded per request' });
      return;
    }
    res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    return;
  }
  if (err) { next(err); return; }
  next();
}

// POST /screening/patient/:patientId — Radiologist-only upload
router.post(
  '/patient/:patientId',
  auth,
  authorize('Radiologist'),
  (req, res, next) => screeningUpload.array('images', 10)(req, res, (err) => handleMulterErrors(err, req, res, next)),
  audit({
    eventType:        'Screening_Upload',
    eventDescription: 'Screening images uploaded',
    includePatientId: true,
    getDetails:       (req) => `Uploaded screenings for patient #${req.params['patientId']}`,
  }),
  screeningController.upload,
);

// GET /screening/patient/:patientId/todays-appointment — DA upload-gate probe (legacy)
router.get(
  '/patient/:patientId/todays-appointment',
  auth,
  authorize('DentalAssistant'),
  screeningController.todaysAppointment,
);

// GET /screening/patient/:patientId/todays-appointments — DA modal picker (legacy)
router.get(
  '/patient/:patientId/todays-appointments',
  auth,
  authorize('DentalAssistant'),
  screeningController.todaysAppointmentsList,
);

// GET /screening/record/:recordId — list screenings
router.get(
  '/record/:recordId',
  auth,
  authorize('Admin', 'Doctor', 'Student', 'DentalAssistant', 'Radiologist'),
  screeningController.listByRecord,
);

// GET /screening/file/:imageId — serve the image file (authenticated)
router.get(
  '/file/:imageId',
  auth,
  authorize('Admin', 'Doctor', 'Student', 'DentalAssistant', 'Radiologist'),
  screeningController.serveFile,
);

// DELETE /screening/:imageId — Admin (any) or Radiologist (own, same-day)
router.delete(
  '/:imageId',
  auth,
  authorize('Admin', 'Radiologist'),
  audit({
    eventType:        'Screening_Delete',
    eventDescription: 'Screening image soft-deleted',
    getDetails:       (req) => `Screening #${req.params['imageId']} soft-deleted`,
  }),
  screeningController.softDelete,
);

export default router;
