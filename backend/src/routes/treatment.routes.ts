import { Router } from 'express';
import { z } from 'zod';
import { Request, Response } from 'express';
import sql from 'mssql';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { audit } from '../middleware/audit.middleware';
import { guardClinicalPost } from '../middleware/appointment-active.middleware';
import { getPool } from '../config/db.config';
import { created, badRequest, serverError } from '../utils/response.util';

const submitSchema = z.object({
  patientId:     z.number().int().positive(),
  appointmentId: z.number().int().positive().optional(),
  treatmentType: z.string().min(1).max(100),
  treatmentNote: z.string().min(1),
});

const router = Router();

router.post(
  '/submit',
  auth,
  authorize('Student', 'Doctor'),
  validate(submitSchema),
  guardClinicalPost(),
  audit({
    eventType:        'Treatment_Create',
    eventDescription: 'Treatment submitted',
    getDetails: req => `Treatment for patient #${(req.body as any).patientId ?? ''}: ${(req.body as any).treatmentType ?? ''}`,
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { patientId, appointmentId, treatmentType, treatmentNote } = req.body as {
        patientId:      number;
        appointmentId?: number;
        treatmentType:  string;
        treatmentNote:  string;
      };

      const user = req.user!;
      const isStudent = user.role === 'Student';
      const authoredByStudent = isStudent ? (user.academicId ?? null) : null;
      const authoredByDoctor  = !isStudent ? (user.employeeId ?? null) : null;
      // Doctor-authored treatments are approved on insert; student submissions start as 'Submitted'
      const status           = isStudent ? 'Submitted' : 'Approved';
      const approvedByDoctor = isStudent ? null        : (user.employeeId ?? null);

      const pool = await getPool();

      const recResult = await pool.request()
        .input('patientId', sql.Int, patientId)
        .query<{ record_id: number }>(
          `SELECT TOP 1 record_id FROM Medical_Records WHERE patient_id = @patientId AND deleted_at IS NULL ORDER BY record_id`,
        );
      const recordId = recResult.recordset[0]?.record_id;
      if (!recordId) { badRequest(res, 'No medical record found for this patient'); return; }

      const insertResult = await pool.request()
        .input('recordId',          sql.Int,               recordId)
        .input('authoredByStudent', sql.Int,               authoredByStudent)
        .input('authoredByDoctor',  sql.Int,               authoredByDoctor)
        .input('approvedByDoctor',  sql.Int,               approvedByDoctor)
        .input('status',            sql.VarChar(20),       status)
        .input('treatmentType',     sql.VarChar(100),      treatmentType)
        .input('treatmentNote',     sql.NVarChar(sql.MAX), treatmentNote)
        .input('appointmentId',     sql.Int,               appointmentId ?? null)
        .query<{ treatment_id: number }>(`
          INSERT INTO Treatment
            (record_id, authored_by_student, authored_by_doctor, approved_by_doctor,
             treatment_type, treatment_note, status, submitted_at, reviewed_at, appointment_id)
          OUTPUT INSERTED.treatment_id
          VALUES
            (@recordId, @authoredByStudent, @authoredByDoctor, @approvedByDoctor,
             @treatmentType, @treatmentNote, @status, GETUTCDATE(),
             CASE WHEN @status = 'Approved' THEN GETUTCDATE() ELSE NULL END,
             @appointmentId)
        `);

      created(res, insertResult.recordset[0], isStudent ? 'Treatment submitted for review' : 'Treatment recorded');
    } catch (err) {
      console.error('[treatment] submit error:', err);
      serverError(res);
    }
  },
);

export default router;
