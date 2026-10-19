import {
  getStudentSubmissions,
  getStudentNotes,
  getStudentSupervisorId,
  getPatientRecordIdForSubmission,
  submitStudentDiagnosis,
  reviewDiagnosis,
} from '../repositories/diagnosis.repository';

export async function listStudentSubmissionsService(
  doctorEmployeeId: number,
  limit: number,
  offset: number,
) {
  return getStudentSubmissions(doctorEmployeeId, limit, offset);
}

export async function listStudentNotesService(
  studentAcademicId: number,
  limit: number,
  offset: number,
  patientId?: number,
) {
  return getStudentNotes(studentAcademicId, limit, offset, patientId);
}

// Student-authored diagnoses are NEVER final on insert — they're routed to
// the student's assigned supervising doctor who approves/rejects via
// reviewDiagnosisService. The row is created with status 'Submitted'; the
// supervisor link (`reviewed_by`) is locked in here at submission time so
// changing the student's supervisor later doesn't reassign past submissions.
export async function submitDiagnosisService(
  academicId: number,
  patientId: number,
  data: {
    diagnosisType:        string;
    clinicalFindings:     string;
    radiographicFindings: string;
    progressNote:         string;
    doctorId?:            number;
  },
) {
  let reviewedBy: number;
  if (data.doctorId) {
    reviewedBy = data.doctorId;
  } else {
    const supervisorId = await getStudentSupervisorId(academicId);
    if (!supervisorId) throw new Error('No supervisor assigned to this student');
    reviewedBy = supervisorId;
  }

  const recordId = await getPatientRecordIdForSubmission(patientId);
  if (!recordId) throw new Error('No medical record found for this patient');

  const { doctorId: _ignored, ...diagData } = data;
  return submitStudentDiagnosis({
    ...diagData,
    recordId,
    authoredByStudent: academicId,
    reviewedBy,
  });
}

export async function reviewDiagnosisService(
  diagnosisId: number,
  status: string,
  feedback: string,
) {
  return reviewDiagnosis(diagnosisId, status, feedback);
}
