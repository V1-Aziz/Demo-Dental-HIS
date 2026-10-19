import { Router } from 'express';
import { z } from 'zod';
import { Request, Response } from 'express';
import sql from 'mssql';
import { auth } from '../middleware/auth.middleware';
import { authorize } from '../middleware/role.middleware';
import { validate } from '../middleware/validate.middleware';
import { getPool } from '../config/db.config';
import { created, badRequest, serverError } from '../utils/response.util';

// ── Zod schema ──────────────────────────────────────────────────────────────

const procedureSchema = z.object({
  diagnosis:            z.string().max(100).default(''),
  treatment:            z.string().max(100).default(''),
  clinicalFindings:     z.string().max(5000).default(''),
  radiographicFindings: z.string().max(5000).default(''),
});

const toothSchema = z.object({
  toothNumber: z.number().int().min(11).max(48),
  procedures:  z.array(procedureSchema).min(1),
});

const visitSchema = z.object({
  appointmentId:   z.number().int().positive(),
  chiefComplaint:  z.string().min(3).max(4000),
  painScore:       z.number().int().min(0).max(10),
  chronicDiseases: z.string().max(500).default(''),
  allergies:       z.string().max(500).default(''),
  teeth:           z.array(toothSchema).min(1),
  progressNote:    z.string().max(5000).default(''),
  submittedAt:     z.string().optional(),
});

// ── Router ──────────────────────────────────────────────────────────────────

const router = Router();

router.post(
  '/',
  auth,
  authorize('Doctor', 'Student'),
  validate(visitSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { appointmentId, chiefComplaint, painScore, chronicDiseases, allergies, teeth, progressNote } = req.body as z.infer<typeof visitSchema>;
      const user      = req.user!;
      const isStudent = user.role === 'Student';

      const pool = await getPool();

      // ── 1. Resolve record_id from appointment ────────────────────────────
      const apptResult = await pool.request()
        .input('apptId', sql.Int, appointmentId)
        .query<{ record_id: number; patient_id: number }>(
          `SELECT TOP 1 mr.record_id, a.patient_id
             FROM Appointments a
             JOIN Medical_Records mr
               ON mr.patient_id = a.patient_id AND mr.deleted_at IS NULL
            WHERE a.appointment_id = @apptId
            ORDER BY mr.record_id`,
        );

      if (!apptResult.recordset.length) {
        badRequest(res, 'No medical record found for this appointment');
        return;
      }
      const { record_id: recordId } = apptResult.recordset[0];

      // ── 2. Persist patient intake to Medical_Records ──────────────────────
      await pool.request()
        .input('recordId',        sql.Int,             recordId)
        .input('chiefComplaint',  sql.NVarChar(sql.MAX), chiefComplaint)
        .input('painScore',       sql.TinyInt,           painScore)
        .input('chronicDiseases', sql.VarChar(500),       chronicDiseases || null)
        .input('allergies',       sql.VarChar(500),       allergies       || null)
        .query(
          `UPDATE Medical_Records
           SET chief_complaint  = @chiefComplaint,
               pain_score       = @painScore,
               chronic_diseases = @chronicDiseases,
               allergies        = @allergies
           WHERE record_id = @recordId AND deleted_at IS NULL`,
        );

      // ── 3. Resolve authorship fields ─────────────────────────────────────
      const authoredByStudent = isStudent ? (user.academicId  ?? null) : null;
      const authoredByDoctor  = isStudent ? null               : (user.employeeId ?? null);
      const diagStatus        = isStudent ? 'Submitted'        : 'Approved';
      const txStatus          = isStudent ? 'Submitted'        : 'Approved';

      // For student diagnoses the supervisor is set as reviewed_by so the doctor
      // can find the submission in their review queue.
      let supervisorId: number | null = null;
      if (isStudent && authoredByStudent) {
        const supResult = await pool.request()
          .input('academicId', sql.Int, authoredByStudent)
          .query<{ employee_id: number }>(
            `SELECT employee_id FROM Student WHERE academic_id = @academicId`,
          );
        supervisorId = supResult.recordset[0]?.employee_id ?? null;
      }

      // ── 4. Insert one Diagnosis / Treatment row per filled procedure ──────
      let diagnosesInserted  = 0;
      let treatmentsInserted = 0;
      // Track the dominant diagnosis per tooth for Dental_Chart update
      const toothDxMap = new Map<number, string>();

      for (const tooth of teeth) {
        const toothNumber = String(tooth.toothNumber);

        for (const proc of tooth.procedures) {
          const hasDx = proc.diagnosis.trim().length > 0;
          const hasTx = proc.treatment.trim().length > 0;

          // ── Diagnosis ──────────────────────────────────────────────────
          if (hasDx) {
            const diagReq = pool.request()
              .input('recordId',             sql.Int,               recordId)
              .input('authoredByStudent',    sql.Int,               authoredByStudent)
              .input('authoredByDoctor',     sql.Int,               authoredByDoctor)
              .input('supervisorId',         sql.Int,               supervisorId)
              .input('toothNumber',          sql.VarChar(10),       toothNumber)
              .input('diagnosisType',        sql.VarChar(100),      proc.diagnosis)
              .input('clinicalFindings',     sql.NVarChar(sql.MAX), proc.clinicalFindings)
              .input('radiographicFindings', sql.NVarChar(sql.MAX), proc.radiographicFindings)
              .input('progressNote',         sql.NVarChar(sql.MAX), progressNote)
              .input('status',               sql.VarChar(20),       diagStatus)
              .input('appointmentId',        sql.Int,               appointmentId);

            if (isStudent) {
              await diagReq.query(
                `INSERT INTO Diagnosis
                   (record_id, authored_by_student, reviewed_by, tooth_number,
                    diagnosis_type, clinical_findings, radiographic_findings, progress_note,
                    status, submitted_at, appointment_id)
                 VALUES
                   (@recordId, @authoredByStudent, @supervisorId, @toothNumber,
                    @diagnosisType, @clinicalFindings, @radiographicFindings, @progressNote,
                    @status, GETUTCDATE(), @appointmentId)`,
              );
            } else {
              await diagReq.query(
                `INSERT INTO Diagnosis
                   (record_id, authored_by_doctor, reviewed_by, tooth_number,
                    diagnosis_type, clinical_findings, radiographic_findings, progress_note,
                    status, submitted_at, reviewed_at, appointment_id)
                 VALUES
                   (@recordId, @authoredByDoctor, @authoredByDoctor, @toothNumber,
                    @diagnosisType, @clinicalFindings, @radiographicFindings, @progressNote,
                    @status, GETUTCDATE(), GETUTCDATE(), @appointmentId)`,
              );
            }
            diagnosesInserted++;
            // Track the first meaningful diagnosis per tooth for the dental chart
            if (!toothDxMap.has(tooth.toothNumber) && proc.diagnosis.toLowerCase() !== 'healthy') {
              toothDxMap.set(tooth.toothNumber, proc.diagnosis);
            }
          }

          // ── Treatment ──────────────────────────────────────────────────
          if (hasTx) {
            const approvedByDoctor = isStudent ? null : (user.employeeId ?? null);
            const treatmentNote    = proc.clinicalFindings.trim() || proc.treatment;

            await pool.request()
              .input('recordId',          sql.Int,               recordId)
              .input('authoredByStudent', sql.Int,               authoredByStudent)
              .input('authoredByDoctor',  sql.Int,               authoredByDoctor)
              .input('approvedByDoctor',  sql.Int,               approvedByDoctor)
              .input('treatmentType',     sql.VarChar(100),      proc.treatment)
              .input('treatmentNote',     sql.NVarChar(sql.MAX), treatmentNote)
              .input('status',            sql.VarChar(20),       txStatus)
              .input('appointmentId',     sql.Int,               appointmentId)
              .query(
                `INSERT INTO Treatment
                   (record_id, authored_by_student, authored_by_doctor, approved_by_doctor,
                    treatment_type, treatment_note, status, submitted_at,
                    ${!isStudent ? 'reviewed_at,' : ''}
                    appointment_id)
                 VALUES
                   (@recordId, @authoredByStudent, @authoredByDoctor, @approvedByDoctor,
                    @treatmentType, @treatmentNote, @status, GETUTCDATE(),
                    ${!isStudent ? 'GETUTCDATE(),' : ''}
                    @appointmentId)`,
              );
            treatmentsInserted++;
          }
        }
      }

      // ── 5. Write one Dental_Chart note per tooth that has a diagnosis ────
      for (const [toothNum, diagnosisType] of toothDxMap) {
        await pool.request()
          .input('recordId',          sql.Int,               recordId)
          .input('toothNumber',       sql.VarChar(10),       String(toothNum))
          .input('toothNote',         sql.NVarChar(sql.MAX), diagnosisType)
          .input('authoredByStudent', sql.Int,               authoredByStudent)
          .input('authoredByDoctor',  sql.Int,               authoredByDoctor)
          .input('appointmentId',     sql.Int,               appointmentId)
          .query(`
            INSERT INTO Dental_Chart
              (record_id, tooth_number, tooth_note, authored_by_student, authored_by_doctor, appointment_id)
            VALUES
              (@recordId, @toothNumber, @toothNote, @authoredByStudent, @authoredByDoctor, @appointmentId)
          `);
      }

      created(res, {
        diagnosesInserted,
        treatmentsInserted,
        dentalChartUpdated: toothDxMap.size,
        recordId,
      }, `Visit recorded: ${diagnosesInserted} diagnoses, ${treatmentsInserted} treatments`);

    } catch (err) {
      console.error('[visits] submit error:', err);
      serverError(res);
    }
  },
);

export default router;
