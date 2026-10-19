import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface DiagnosisInput {
  recordId:             number;
  authoredByDoctor:     number;   // employee_id — doctor is also the reviewer
  diagnosisType:        string;
  clinicalFindings:     string;
  radiographicFindings: string;
  progressNote:         string;
}

export interface TreatmentInput {
  recordId:          number;
  authoredByDoctor:  number;      // employee_id — doctor is also the approver
  treatmentType:     string;
  treatmentNote:     string;
  medicineName:      string;
  dosage:            string;
  duration:          string;
  cost:              number;
}

export interface StudentProcedureNoteInput {
  recordId:             number;
  academicId:           number;   // authored_by_student
  supervisorEmployeeId: number;   // reviewed_by (FK to Employee)
  diagnosisType:        string;
  clinicalFindings:     string;
  radiographicFindings: string;
  progressNote:         string;
}

export async function getEmployeeIdByUserId(userId: number): Promise<number | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query<{ employee_id: number }>(
      `SELECT employee_id FROM Employee WHERE user_id = @userId AND deleted_at IS NULL`,
    );
  return result.recordset.length ? result.recordset[0].employee_id : null;
}

export async function getPatientRecord(patientId: number): Promise<unknown | null> {
  const pool = await getPool();

  const recResult = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query(
      `SELECT TOP 1 record_id, patient_id, chief_complaint, chronic_diseases
       FROM Medical_Records
       WHERE patient_id = @patientId AND deleted_at IS NULL
       ORDER BY record_id`,
    );

  if (!recResult.recordset.length) return null;
  const record = recResult.recordset[0] as {
    record_id: number;
    patient_id: number;
    chief_complaint: string | null;
    chronic_diseases: string | null;
  };

  const [diagRows, treatRows] = await Promise.all([
    pool
      .request()
      .input('recordId', sql.Int, record.record_id)
      .query(
        `SELECT d.diagnosis_id, d.diagnosis_type, d.clinical_findings,
                d.radiographic_findings, d.progress_note,
                e.first_name + ' ' + e.last_name AS authored_by_name
         FROM Diagnosis d
         LEFT JOIN Employee e ON e.employee_id = d.authored_by_doctor
         WHERE d.record_id = @recordId AND d.deleted_at IS NULL
         ORDER BY d.diagnosis_id DESC`,
      ),
    pool
      .request()
      .input('recordId', sql.Int, record.record_id)
      .query(
        `SELECT t.treatment_id, t.treatment_type, t.treatment_note, t.doctor_feedback,
                e.first_name + ' ' + e.last_name AS authored_by_name,
                p.medicine_name, p.dosage, p.duration, p.cost
         FROM Treatment t
         LEFT JOIN Employee e ON e.employee_id = t.authored_by_doctor
         LEFT JOIN Prescriptions p ON p.prescription_id = t.prescription_id
         WHERE t.record_id = @recordId AND t.deleted_at IS NULL
         ORDER BY t.treatment_id DESC`,
      ),
  ]);

  return {
    ...record,
    diagnoses:  diagRows.recordset,
    treatments: treatRows.recordset,
  };
}

export async function updateRecord(
  recordId: number,
  data: { chiefComplaint: string; chronicDiseases: string },
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('recordId',        sql.Int,          recordId)
    .input('chiefComplaint',  sql.NVarChar(sql.MAX), data.chiefComplaint)
    .input('chronicDiseases', sql.VarChar(100),      data.chronicDiseases)
    .query(
      `UPDATE Medical_Records
       SET chief_complaint  = @chiefComplaint,
           chronic_diseases = @chronicDiseases
       WHERE record_id = @recordId AND deleted_at IS NULL`,
    );
}

// Doctor-authored diagnoses skip the approval workflow (status = 'Approved'
// on insert). Contrast with `submitStudentDiagnosis` which inserts as
// 'Submitted' and waits for the supervising doctor to review. `reviewed_by`
// is set to the doctor themselves so list queries that filter on it still work.
export async function createDiagnosis(data: DiagnosisInput): Promise<{ diagnosis_id: number }> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',             sql.Int,          data.recordId)
    .input('authoredByDoctor',     sql.Int,          data.authoredByDoctor)
    .input('reviewedBy',           sql.Int,          data.authoredByDoctor) // doctor reviews own entries
    .input('diagnosisType',        sql.VarChar(100), data.diagnosisType)
    .input('clinicalFindings',     sql.NVarChar(sql.MAX), data.clinicalFindings)
    .input('radiographicFindings', sql.NVarChar(sql.MAX), data.radiographicFindings)
    .input('progressNote',         sql.NVarChar(sql.MAX), data.progressNote)
    .query<{ diagnosis_id: number }>(
      `INSERT INTO Diagnosis
         (record_id, authored_by_doctor, reviewed_by,
          diagnosis_type, clinical_findings, radiographic_findings, progress_note, status)
       OUTPUT INSERTED.diagnosis_id
       VALUES (@recordId, @authoredByDoctor, @reviewedBy,
               @diagnosisType, @clinicalFindings, @radiographicFindings, @progressNote, 'Approved')`,
    );
  return result.recordset[0];
}

export async function createProcedureNoteByStudent(data: StudentProcedureNoteInput): Promise<{ diagnosis_id: number }> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',             sql.Int,          data.recordId)
    .input('academicId',           sql.Int,          data.academicId)
    .input('supervisorEmployeeId', sql.Int,          data.supervisorEmployeeId)
    .input('diagnosisType',        sql.VarChar(100), data.diagnosisType)
    .input('clinicalFindings',     sql.NVarChar(sql.MAX), data.clinicalFindings)
    .input('radiographicFindings', sql.NVarChar(sql.MAX), data.radiographicFindings)
    .input('progressNote',         sql.NVarChar(sql.MAX), data.progressNote)
    .query<{ diagnosis_id: number }>(
      `INSERT INTO Diagnosis
         (record_id, authored_by_student, reviewed_by,
          diagnosis_type, clinical_findings, radiographic_findings, progress_note)
       OUTPUT INSERTED.diagnosis_id
       VALUES (@recordId, @academicId, @supervisorEmployeeId,
               @diagnosisType, @clinicalFindings, @radiographicFindings, @progressNote)`,
    );
  return result.recordset[0];
}

// Treatment has a FK to Prescription, so we must insert the prescription
// first, capture its id, then insert the treatment referencing it. Both
// writes share a transaction so a failed treatment insert doesn't leave an
// orphaned prescription in the DB.
export async function createTreatmentWithPrescription(data: TreatmentInput): Promise<{ treatment_id: number }> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // 1. Create prescription
    const prescResult = await new sql.Request(transaction)
      .input('recordId',     sql.Int,           data.recordId)
      .input('medicineName', sql.VarChar(255),   data.medicineName)
      .input('dosage',       sql.VarChar(100),   data.dosage)
      .input('duration',     sql.VarChar(100),   data.duration)
      .input('cost',         sql.Decimal(10, 2), data.cost)
      .query<{ prescription_id: number }>(
        `INSERT INTO Prescriptions (record_id, medicine_name, dosage, duration, cost)
         OUTPUT INSERTED.prescription_id
         VALUES (@recordId, @medicineName, @dosage, @duration, @cost)`,
      );
    const prescriptionId = prescResult.recordset[0].prescription_id;

    // 2. Create treatment
    const treatResult = await new sql.Request(transaction)
      .input('recordId',         sql.Int,          data.recordId)
      .input('prescriptionId',   sql.Int,          prescriptionId)
      .input('authoredByDoctor', sql.Int,          data.authoredByDoctor)
      .input('approvedByDoctor', sql.Int,          data.authoredByDoctor) // doctor approves own
      .input('treatmentType',    sql.VarChar(100), data.treatmentType)
      .input('treatmentNote',    sql.NVarChar(sql.MAX), data.treatmentNote)
      .query<{ treatment_id: number }>(
        `INSERT INTO Treatment
           (record_id, prescription_id, authored_by_doctor, approved_by_doctor,
            treatment_type, treatment_note)
         OUTPUT INSERTED.treatment_id
         VALUES (@recordId, @prescriptionId, @authoredByDoctor, @approvedByDoctor,
                 @treatmentType, @treatmentNote)`,
      );

    await transaction.commit();
    return treatResult.recordset[0];
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
