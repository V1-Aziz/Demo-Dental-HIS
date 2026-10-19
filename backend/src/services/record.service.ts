import {
  getEmployeeIdByUserId,
  getPatientRecord,
  updateRecord,
  createDiagnosis,
  createTreatmentWithPrescription,
  createProcedureNoteByStudent,
  DiagnosisInput,
  TreatmentInput,
  StudentProcedureNoteInput,
} from '../repositories/record.repository';

export async function getPatientRecordService(patientId: number) {
  return getPatientRecord(patientId);
}

export async function updateRecordService(
  recordId: number,
  data: { chiefComplaint: string; chronicDiseases: string },
) {
  return updateRecord(recordId, data);
}

export async function createDiagnosisService(userId: number, recordId: number, data: Omit<DiagnosisInput, 'recordId' | 'authoredByDoctor'>) {
  const employeeId = await getEmployeeIdByUserId(userId);
  if (!employeeId) throw new Error('Employee record not found for this user');
  return createDiagnosis({ ...data, recordId, authoredByDoctor: employeeId });
}

export async function createTreatmentService(userId: number, recordId: number, data: Omit<TreatmentInput, 'recordId' | 'authoredByDoctor'>) {
  const employeeId = await getEmployeeIdByUserId(userId);
  if (!employeeId) throw new Error('Employee record not found for this user');
  return createTreatmentWithPrescription({ ...data, recordId, authoredByDoctor: employeeId });
}

export async function createProcedureNoteByStudentService(
  academicId: number,
  recordId: number,
  data: Omit<StudentProcedureNoteInput, 'recordId' | 'academicId'>,
) {
  return createProcedureNoteByStudent({ ...data, recordId, academicId });
}
