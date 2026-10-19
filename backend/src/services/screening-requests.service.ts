// Business logic for the Screening_Requests module.  Orchestrates auto-routing
// to the least-loaded radiologist, status transitions, and notification dispatch.
// No SQL here — data access is in screening-requests.repository.ts.
import {
  insertScreeningRequest,
  cancelScreeningRequest,
  findScreeningRequestById,
  findScreeningRequestsByRecord,
  findPendingRequestsByRadiologist,
  findActiveRequestForPatientAppointment,
  findLeastLoadedRadiologist,
  getRadiologistUserIdByEmployeeId,
  getEmployeeIdByUserId,
} from '../repositories/screening-requests.repository';
import { dispatch } from './notification.service';
import { buildLinkTo } from './notifications.links';

export class ScreeningRequestError extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 409 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScreeningRequestError';
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createScreeningRequestService(
  recordId:         number,
  patientId:        number,
  appointmentId:    number | null,
  requesterUserId:  number,
): Promise<{ request_id: number; assigned_radiologist_id: number }> {
  // Enforce 1 active request per (patient, appointment) to prevent spam.
  const existing = await findActiveRequestForPatientAppointment(patientId, appointmentId);
  if (existing) {
    throw new ScreeningRequestError(409, 'REQUEST_EXISTS',
      'A pending screening request already exists for this patient and appointment');
  }

  // Auto-route to the least-loaded active radiologist.
  const radiologistEmpId = await findLeastLoadedRadiologist();
  if (!radiologistEmpId) {
    throw new ScreeningRequestError(503, 'NO_RADIOLOGIST_AVAILABLE',
      'No active radiologist is available to handle this request. Contact the administrator.');
  }

  const requestId = await insertScreeningRequest({
    recordId,
    patientId,
    appointmentId:         appointmentId ?? null,
    requestedByUserId:     requesterUserId,
    assignedRadiologistId: radiologistEmpId,
  });

  // Notify the assigned radiologist (fire-and-forget).
  try {
    const radiologistUserId = await getRadiologistUserIdByEmployeeId(radiologistEmpId);
    if (radiologistUserId) {
      await dispatch({
        userId:            radiologistUserId,
        type:              'screening.request.created',
        title:             'New screening request',
        message:           `A doctor has requested a screening for patient #${patientId}.`,
        linkTo:            buildLinkTo('screening.request.created', patientId, 'Radiologist'),
        relatedEntityType: 'ScreeningRequest',
        relatedEntityId:   requestId,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'screening.request.created', err });
  }

  return { request_id: requestId, assigned_radiologist_id: radiologistEmpId };
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelScreeningRequestService(
  requestId:      number,
  callerUserId:   number,
): Promise<void> {
  const req = await findScreeningRequestById(requestId);
  if (!req) {
    throw new ScreeningRequestError(404, 'NOT_FOUND', 'Screening request not found');
  }
  if (req.requested_by_user_id !== callerUserId) {
    throw new ScreeningRequestError(403, 'NOT_OWNER', 'You can only cancel your own requests');
  }
  if (req.request_status !== 'Pending') {
    throw new ScreeningRequestError(409, 'NOT_PENDING',
      `Cannot cancel a request with status '${req.request_status}'`);
  }

  await cancelScreeningRequest(requestId);

  // Notify the radiologist their assigned request was cancelled.
  try {
    const radiologistUserId = await getRadiologistUserIdByEmployeeId(req.assigned_radiologist_id);
    if (radiologistUserId) {
      await dispatch({
        userId:            radiologistUserId,
        type:              'screening.request.cancelled',
        title:             'Screening request cancelled',
        message:           `A screening request for patient #${req.patient_id} has been cancelled.`,
        linkTo:            buildLinkTo('screening.request.cancelled', req.patient_id, 'Radiologist'),
        relatedEntityType: 'ScreeningRequest',
        relatedEntityId:   requestId,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'screening.request.cancelled', err });
  }
}

// ─── List mine ────────────────────────────────────────────────────────────────

export async function listMyScreeningRequestsService(
  callerUserId: number,
  limit: number,
  offset: number,
) {
  const empId = await getEmployeeIdByUserId(callerUserId);
  if (!empId) return [];
  return findPendingRequestsByRadiologist(empId, limit, offset);
}

// ─── By record ────────────────────────────────────────────────────────────────

export async function getScreeningRequestsByRecordService(recordId: number) {
  return findScreeningRequestsByRecord(recordId);
}
