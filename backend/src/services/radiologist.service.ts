// Business logic for the Radiologist portal endpoints.
// Dashboard, patient list, and per-patient appointment details.
import {
  findRadiologistPatients,
  findRadiologistPatientById,
  findTodaysAppointmentsForPatient,
  getDashboardCards,
  getDashboardTopPending,
} from '../repositories/radiologist.repository';
import { getEmployeeIdByUserId } from '../repositories/screening-requests.repository';
import { RadiologistDashboardSummary } from '../types/screening.types';

export class RadiologistError extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RadiologistError';
  }
}

export async function getRadiologistDashboardService(
  callerUserId: number,
): Promise<RadiologistDashboardSummary> {
  const empId = await getEmployeeIdByUserId(callerUserId);
  if (!empId) {
    throw new RadiologistError(404, 'NO_EMPLOYEE_RECORD',
      'Radiologist employee record not found. Contact the administrator.');
  }

  const [cards, topPending] = await Promise.all([
    getDashboardCards(empId),
    getDashboardTopPending(empId),
  ]);

  return { cards, topPending };
}

export async function listRadiologistPatientsService() {
  return findRadiologistPatients();
}

export async function getRadiologistPatientService(patientId: number) {
  const patient = await findRadiologistPatientById(patientId);
  if (!patient) {
    throw new RadiologistError(404, 'NOT_FOUND', 'Patient not found');
  }
  return patient;
}

export async function listTodaysAppointmentsForPatientService(patientId: number) {
  return findTodaysAppointmentsForPatient(patientId);
}
