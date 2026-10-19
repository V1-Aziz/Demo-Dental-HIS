// Business logic for the Screening (medical imaging) module.  Orchestrates
// today's-appointment guard, file persistence, row inserts, and notification
// dispatch.  No SQL here — data access is in screening.repository.ts.  No
// req/res — HTTP concerns stay in screening.controller.ts.
import path from 'path';
import fs from 'fs';
import {
  getTodaysAppointmentForPatient,
  getAllTodaysAppointmentsForPatient,
  getTodaysAppointmentByIdForPatient,
  insertScreening,
  findByRecordId,
  findById,
  softDelete,
  getPatientDisplayName,
  getUserDisplayName,
  getTreatingDoctorEmpIdForRecord,
  getAppointmentDisplayMeta,
  ScreeningRow,
} from '../repositories/screening.repository';
import {
  getUserIdByEmployeeId,
  getUserIdByAcademicId,
  getAppointmentDispatchInfo,
} from '../repositories/notification.repository';
import {
  fulfillScreeningRequest,
  findPendingRequestForPatientAppointmentAndRadiologist,
} from '../repositories/screening-requests.repository';
import { dispatch } from './notification.service';
import { buildLinkTo } from './notifications.links';
import { SCREENING_UPLOAD_ROOT } from '../middleware/upload.middleware';
import {
  ScreeningImageType,
  SCREENING_IMAGE_TYPES,
  SCREENING_TYPES_WITH_TOOTH,
} from '../enums/screening-image-type.enum';
import { Screening } from '../types/screening.types';

export class ScreeningError extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 409 | 413 | 415,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScreeningError';
  }
}

export interface UploadMeta {
  image_type:     ScreeningImageType;
  tooth_numbers?: string | null;
  notes?:         string | null;
}

export interface UploadedFileInfo {
  absolutePath:  string;             // full disk path multer wrote to
  relativePath:  string;             // path relative to SCREENING_UPLOAD_ROOT
  originalName:  string;
  mime:          string;
  size:          number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Accepts "15" or "14,15,16,17" in FDI notation (quadrants 1–4, positions 1–8).
const FDI_REGEX = /^(1[1-8]|2[1-8]|3[1-8]|4[1-8])(,(1[1-8]|2[1-8]|3[1-8]|4[1-8]))*$/;

function validateMeta(meta: UploadMeta, index: number): void {
  if (!meta || typeof meta !== 'object') {
    throw new ScreeningError(400, 'BAD_META', `Missing metadata for file ${index + 1}`);
  }
  if (!SCREENING_IMAGE_TYPES.includes(meta.image_type)) {
    throw new ScreeningError(400, 'BAD_IMAGE_TYPE', `Invalid image type for file ${index + 1}`);
  }
  if (meta.tooth_numbers) {
    if (!SCREENING_TYPES_WITH_TOOTH.includes(meta.image_type)) {
      throw new ScreeningError(400, 'TOOTH_NOT_ALLOWED',
        `Tooth number does not apply to ${meta.image_type}`);
    }
    if (!FDI_REGEX.test(meta.tooth_numbers)) {
      throw new ScreeningError(400, 'BAD_TOOTH_NUMBERS',
        `Invalid FDI tooth notation for file ${index + 1}`);
    }
  }
  if (meta.notes && meta.notes.length > 500) {
    throw new ScreeningError(400, 'NOTES_TOO_LONG', `Notes for file ${index + 1} exceed 500 chars`);
  }
}

export function toRelativeUploadPath(absolutePath: string): string {
  return path.relative(SCREENING_UPLOAD_ROOT, absolutePath).split(path.sep).join('/');
}

function rowToDto(row: ScreeningRow, callerUserId: number, callerRole: string): Screening {
  return {
    image_id:         row.image_id,
    record_id:        row.record_id,
    image_url:        `/api/screening/file/${row.image_id}`,
    image_type:       row.image_type as ScreeningImageType,
    tooth_numbers:    row.tooth_numbers,
    notes:            row.notes,
    uploaded_by:      row.uploaded_by,
    uploaded_by_name: row.uploaded_by_name,
    uploaded_by_role: row.uploaded_by_role,
    uploaded_at:      row.uploaded_at,
    deleted_at:       row.deleted_at,
    can_delete:       canDelete(row, callerUserId, callerRole),
    appointment_id:   row.appointment_id,
  };
}

function canDelete(row: ScreeningRow, callerUserId: number, callerRole: string): boolean {
  if (callerRole === 'Admin') return true;
  if (callerRole === 'Radiologist') {
    if (row.uploaded_by !== callerUserId) return false;
    return isSameCalendarDay(row.uploaded_at, new Date());
  }
  return false;
}

function isSameCalendarDay(isoOrDate: string | Date, reference: Date): boolean {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return (
    d.getFullYear() === reference.getFullYear() &&
    d.getMonth()    === reference.getMonth() &&
    d.getDate()     === reference.getDate()
  );
}

// Returns [todayStartUtc, tomorrowStartUtc) for same-day window validation.
function todayUtcWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadScreeningsService(
  patientId: number,
  uploaderUserId: number,
  uploaderRole: string,
  files: UploadedFileInfo[],
  metaList: UploadMeta[],
  chosenAppointmentId?: number,
): Promise<Screening[]> {
  // Defence-in-depth: route-level authorize() already blocks non-radiologists.
  if (uploaderRole !== 'Radiologist') {
    throw new ScreeningError(403, 'FORBIDDEN', 'Only Radiologists can upload screenings');
  }

  // appointment_id is required for all radiologist uploads.
  if (chosenAppointmentId == null) {
    cleanupFiles(files);
    throw new ScreeningError(400, 'APPOINTMENT_REQUIRED',
      'appointment_id is required for radiologist uploads');
  }

  if (!files || files.length === 0) {
    throw new ScreeningError(400, 'NO_FILES', 'At least one image is required');
  }
  if (files.length !== metaList.length) {
    cleanupFiles(files);
    throw new ScreeningError(400, 'META_LENGTH_MISMATCH',
      `Expected ${files.length} metadata entries, got ${metaList.length}`);
  }

  try {
    metaList.forEach(validateMeta);
  } catch (err) {
    cleanupFiles(files);
    throw err;
  }

  // Validate the appointment: must belong to this patient, be in an eligible
  // status, and fall within the same-day UTC window.
  const appt = await getTodaysAppointmentByIdForPatient(chosenAppointmentId, patientId);
  if (!appt) {
    cleanupFiles(files);
    throw new ScreeningError(403, 'OUTSIDE_SCREENING_WINDOW',
      'The appointment is not today or is not eligible for screening upload');
  }

  const { start, end } = todayUtcWindow();
  const apptTime = new Date(appt.appointment_start_time);
  if (apptTime < start || apptTime >= end) {
    cleanupFiles(files);
    throw new ScreeningError(403, 'OUTSIDE_SCREENING_WINDOW',
      'Screening uploads are only allowed for appointments scheduled today');
  }

  const insertedIds: number[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const f    = files[i];
      const meta = metaList[i];
      const imageId = await insertScreening({
        recordId:       appt.record_id,
        imagePath:      f.relativePath,
        imageType:      meta.image_type,
        toothNumbers:   meta.tooth_numbers || null,
        notes:          meta.notes || null,
        uploadedBy:     uploaderUserId,
        appointmentId:  chosenAppointmentId,
      });
      insertedIds.push(imageId);
    }
  } catch (err) {
    const uninsertedFiles = files.slice(insertedIds.length);
    cleanupFiles(uninsertedFiles);
    throw err;
  }

  // If there's a pending screening request for this patient+appointment assigned
  // to this radiologist, mark it completed (transactional in the repository).
  try {
    const pendingRequest = await findPendingRequestForPatientAppointmentAndRadiologist(
      patientId,
      chosenAppointmentId,
      uploaderUserId,
    );
    if (pendingRequest) {
      await fulfillScreeningRequest(pendingRequest.request_id, insertedIds[0]);
      // Notify original requester that their request is fulfilled.
      dispatch({
        userId:            pendingRequest.requested_by_user_id,
        type:              'screening.request.fulfilled',
        title:             'Screening completed',
        message:           `The radiologist uploaded ${insertedIds.length} image${insertedIds.length === 1 ? '' : 's'} for your patient.`,
        linkTo:            buildLinkTo('screening.request.fulfilled', patientId, 'Doctor'),
        relatedEntityType: 'ScreeningRequest',
        relatedEntityId:   pendingRequest.request_id,
      }).catch(err => console.warn('notifications.dispatch.failed', { type: 'screening.request.fulfilled', err }));
    }
  } catch (err) {
    console.warn('[screening] request fulfillment error (non-fatal):', err);
  }

  // Notify the supervising doctor and assigned student.
  try {
    await dispatchUploadNotifications(patientId, appt.appointment_id, insertedIds, uploaderUserId);
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'screening.uploaded', err });
  }

  const rows = await findByRecordId(appt.record_id);
  const created = rows.filter(r => insertedIds.includes(r.image_id));
  return created.map(r => rowToDto(r, uploaderUserId, uploaderRole));
}

function cleanupFiles(files: UploadedFileInfo[]): void {
  for (const f of files) {
    fs.promises.unlink(f.absolutePath).catch(() => { /* swallow — cleanup is best-effort */ });
  }
}

async function dispatchUploadNotifications(
  patientId:      number,
  appointmentId:  number,
  insertedIds:    number[],
  uploaderUserId: number,
): Promise<void> {
  const info = await getAppointmentDispatchInfo(appointmentId);
  if (!info) return;

  const [doctorUserId, studentUserId, patientName, uploaderName] = await Promise.all([
    getUserIdByEmployeeId(info.doctor_id),
    info.academic_id ? getUserIdByAcademicId(info.academic_id) : Promise.resolve(null),
    getPatientDisplayName(patientId),
    getUserDisplayName(uploaderUserId),
  ]);

  if (!doctorUserId && !studentUserId) return;

  const count    = insertedIds.length;
  const plural   = count === 1 ? 'screening' : 'screenings';
  const patient  = patientName ?? `patient #${patientId}`;
  const uploader = uploaderName ?? 'The radiologist';
  const firstId  = insertedIds[0];

  // De-duplicate: don't notify the same user twice (e.g. if requester == doctor).
  const notified = new Set<number>();
  const dispatches: Promise<void>[] = [];

  if (doctorUserId && !notified.has(doctorUserId)) {
    notified.add(doctorUserId);
    dispatches.push(dispatch({
      userId:            doctorUserId,
      type:              'screening.uploaded',
      title:             'New screenings uploaded',
      message:           `${uploader} uploaded ${count} ${plural} for ${patient}.`,
      linkTo:            buildLinkTo('screening.uploaded', patientId, 'Doctor'),
      relatedEntityType: 'Screening',
      relatedEntityId:   firstId,
    }));
  }
  if (studentUserId && !notified.has(studentUserId)) {
    notified.add(studentUserId);
    dispatches.push(dispatch({
      userId:            studentUserId,
      type:              'screening.uploaded',
      title:             'New screenings uploaded',
      message:           `${uploader} uploaded ${count} ${plural} for ${patient}.`,
      linkTo:            buildLinkTo('screening.uploaded', patientId, 'Student'),
      relatedEntityType: 'Screening',
      relatedEntityId:   firstId,
    }));
  }
  await Promise.all(dispatches);
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listScreeningsForRecordService(
  recordId: number,
  callerUserId: number,
  callerRole: string,
): Promise<Screening[]> {
  const rows = await findByRecordId(recordId);
  return rows.map(r => rowToDto(r, callerUserId, callerRole));
}

// ─── Today's appointment (DA upload gate — legacy) ────────────────────────────

export interface TodaysAppointmentDto {
  appointment_id: number;
  appointment_time: string;   // HH:MM
  doctor_name: string;
  clinic_name: string;
  status: string;
}

export async function getUploadGateAppointmentService(
  patientId: number,
): Promise<TodaysAppointmentDto | null> {
  const appt = await getTodaysAppointmentForPatient(patientId);
  if (!appt) return null;
  const meta = await getAppointmentDisplayMeta(appt.appointment_id);
  return {
    appointment_id:   appt.appointment_id,
    appointment_time: meta?.appointment_time ?? '',
    doctor_name:      meta?.doctor_name ?? 'Unknown',
    clinic_name:      meta?.clinic_name ?? 'Unknown Clinic',
    status:           appt.status,
  };
}

export async function listTodaysAppointmentsService(
  patientId: number,
): Promise<TodaysAppointmentDto[]> {
  const rows = await getAllTodaysAppointmentsForPatient(patientId);
  if (rows.length === 0) return [];
  const metas = await Promise.all(rows.map(r => getAppointmentDisplayMeta(r.appointment_id)));
  return rows.map((r, i) => ({
    appointment_id:   r.appointment_id,
    appointment_time: metas[i]?.appointment_time ?? '',
    doctor_name:      metas[i]?.doctor_name      ?? 'Unknown',
    clinic_name:      metas[i]?.clinic_name      ?? 'Unknown Clinic',
    status:           r.status,
  }));
}

// ─── Serve file ───────────────────────────────────────────────────────────────

export interface ResolvedFile {
  absolutePath: string;
  mime:         string;
}

export async function resolveScreeningFileService(
  imageId: number,
  _callerUserId: number,
  _callerRole: string,
): Promise<ResolvedFile> {
  const row = await findById(imageId);
  if (!row || row.deleted_at !== null) {
    throw new ScreeningError(404, 'NOT_FOUND', 'Screening not found');
  }

  const absolutePath = path.join(SCREENING_UPLOAD_ROOT, row.image_path);
  if (!fs.existsSync(absolutePath)) {
    throw new ScreeningError(404, 'FILE_MISSING', 'Screening file is missing on disk');
  }

  const ext = path.extname(row.image_path).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return { absolutePath, mime };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteScreeningService(
  imageId: number,
  callerUserId: number,
  callerRole: string,
): Promise<void> {
  const row = await findById(imageId);
  if (!row || row.deleted_at !== null) {
    throw new ScreeningError(404, 'NOT_FOUND', 'Screening not found');
  }

  if (callerRole === 'Admin') {
    await softDelete(imageId);
    try {
      await dispatchAdminDeleteNotification(row);
    } catch (err) {
      console.warn('notifications.dispatch.failed', { type: 'screening.deleted', err });
    }
    return;
  }

  if (callerRole === 'Radiologist') {
    if (row.uploaded_by !== callerUserId) {
      throw new ScreeningError(403, 'NOT_OWNER_OR_STALE', 'You can only delete your own uploads');
    }
    if (!isSameCalendarDay(row.uploaded_at, new Date())) {
      throw new ScreeningError(403, 'NOT_OWNER_OR_STALE',
        'Screenings can only be deleted on the same day they were uploaded');
    }
    await softDelete(imageId);
    return;
  }

  throw new ScreeningError(403, 'FORBIDDEN', 'You are not allowed to delete screenings');
}

async function dispatchAdminDeleteNotification(row: ScreeningRow): Promise<void> {
  const doctorEmpId = await getTreatingDoctorEmpIdForRecord(row.record_id);
  if (!doctorEmpId) return;

  const doctorUserId = await getUserIdByEmployeeId(doctorEmpId);
  if (!doctorUserId) return;

  const patientName = await getPatientDisplayName(row.patient_id);
  await dispatch({
    userId:            doctorUserId,
    type:              'screening.deleted',
    title:             'Screening removed by admin',
    message:           `A screening image was removed by an administrator${patientName ? ` for ${patientName}` : ''}.`,
    linkTo:            buildLinkTo('screening.deleted', row.patient_id, 'Doctor'),
    relatedEntityType: 'Screening',
    relatedEntityId:   row.image_id,
  });
}
