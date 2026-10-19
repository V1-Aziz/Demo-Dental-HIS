import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import * as academicController from '../controllers/academic.controller';
import * as studentAssignmentController from '../controllers/student-assignment.controller';

const reviewSchema = z.object({
  action:   z.enum(['approve', 'request_revision', 'reject']),
  feedback: z.string().max(2000).optional(),
});

const resubmitDiagnosisSchema = z.object({
  diagnosis_type:        z.string().min(1).max(100).optional(),
  clinical_findings:     z.string().min(1).optional(),
  radiographic_findings: z.string().min(1).optional(),
  progress_note:         z.string().min(1).optional(),
}).refine(
  data => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided for resubmission' },
);

const resubmitTreatmentSchema = z.object({
  treatment_type: z.string().min(1).max(100).optional(),
  treatment_note: z.string().min(1).optional(),
}).refine(
  data => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided for resubmission' },
);

// Combined resubmit schema — accepts fields from either type
const resubmitSchema = z.object({
  diagnosis_type:        z.string().min(1).max(100).optional(),
  clinical_findings:     z.string().min(1).optional(),
  radiographic_findings: z.string().min(1).optional(),
  progress_note:         z.string().min(1).optional(),
  treatment_type:        z.string().min(1).max(100).optional(),
  treatment_note:        z.string().min(1).optional(),
}).refine(
  data => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided for resubmission' },
);

const gradeSchema = z.object({
  submissionType: z.enum(['Diagnosis', 'Treatment']),
  submissionId:   z.number().int().positive(),
  studentId:      z.number().int().positive(),
  grade:          z.number().int().min(0).max(10),
  feedbackNote:   z.string().max(500).optional(),
});

const router = Router();

// ─── Doctor ───────────────────────────────────────────────────────────────────
router.get('/pending-reviews',
  auth, authorize('Doctor'),
  academicController.pendingReviews,
);

router.get('/review-queue-stats',
  auth, authorize('Doctor'),
  academicController.reviewQueueStats,
);

router.get('/review/:type/:id',
  auth, authorize('Doctor'),
  academicController.getReviewDetail,
);

router.patch('/review/:type/:id',
  auth, authorize('Doctor'),
  validate(reviewSchema),
  audit({
    eventType:        'Academic_Review',
    eventDescription: 'Doctor reviewed student submission',
    getDetails: req => `${req.params['type']} #${req.params['id']}: ${(req.body as any).action ?? ''}`,
  }),
  academicController.reviewSubmission,
);

// ─── Student ──────────────────────────────────────────────────────────────────
router.get('/my-submissions',
  auth, authorize('Student'),
  academicController.mySubmissions,
);

router.patch('/resubmit/:type/:id',
  auth, authorize('Student'),
  validate(resubmitSchema),
  audit({
    eventType:        'Academic_Resubmit',
    eventDescription: 'Student resubmitted a note after revision request',
    getDetails: req => `${req.params['type']} #${req.params['id']} resubmitted`,
  }),
  academicController.resubmitNote,
);

router.delete('/submission/:type/:id',
  auth, authorize('Student'),
  audit({
    eventType:        'Academic_Withdraw',
    eventDescription: 'Student withdrew a pending submission',
    getDetails: req => `${req.params['type']} #${req.params['id']} withdrawn`,
  }),
  academicController.withdrawNote,
);

router.get('/grades/my',
  auth, authorize('Student'),
  academicController.getMyGrades,
);

// ─── Doctor: grades ───────────────────────────────────────────────────────────
router.post('/grades',
  auth, authorize('Doctor'),
  validate(gradeSchema),
  academicController.submitGrade,
);

router.get('/grades/summary',
  auth, authorize('Doctor'),
  academicController.getGradeSummary,
);

router.get('/grades/student/:studentId',
  auth, authorize('Doctor'),
  academicController.getStudentGrades,
);

// ─── Student: temporal file access ───────────────────────────────────────────

const assignmentSchema = z.object({
  patientId: z.coerce.number().int().positive(),
});

// Returns the student's current access level (write/read) for a patient file.
// Called by the frontend on every chart load.
router.get('/file-access/:patientId',
  auth, authorize('Student'),
  studentAssignmentController.getFileAccess,
);

// Creates a 24-hour write assignment. Returns existing (200) or new (201).
router.post('/assignments',
  auth, authorize('Student'),
  validate(assignmentSchema),
  studentAssignmentController.createAssignment,
);

// Returns all assignments for the authenticated student, newest first.
router.get('/assignments',
  auth, authorize('Student'),
  studentAssignmentController.getMyAssignments,
);

export default router;
