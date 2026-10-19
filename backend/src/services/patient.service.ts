import {
  getPatients,
  searchPatients,
  getPatientById,
  getPatientsByStudentId,
  createPatient,
  CreatePatientInput,
  updatePatientPhone,
} from '../repositories/patient.repository';

export async function listPatientsService(search: string, limit: number, offset: number) {
  return getPatients(search, limit, offset);
}

export async function searchPatientsService(q: string, limit: number, offset: number) {
  return searchPatients(q, limit, offset);
}

export async function listPatientsByStudentService(
  studentId: number,
  search: string,
  limit: number,
  offset: number,
) {
  return getPatientsByStudentId(studentId, search, limit, offset);
}

export async function getPatientByIdService(patientId: number) {
  return getPatientById(patientId);
}

export async function createPatientService(data: CreatePatientInput) {
  return createPatient(data);
}

export async function updatePatientPhoneService(patientId: number, phoneNumber: string) {
  return updatePatientPhone(patientId, phoneNumber);
}
