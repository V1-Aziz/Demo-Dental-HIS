// HTTP-layer for the Screening module. Thin handlers that parse req, call the
// service, and wrap responses via response.util.ts. Keeps business logic out
// of this file.
import fs from 'fs';
import { Request, Response } from 'express';
import {
  uploadScreeningsService,
  listScreeningsForRecordService,
  resolveScreeningFileService,
  deleteScreeningService,
  getUploadGateAppointmentService,
  listTodaysAppointmentsService,
  toRelativeUploadPath,
  ScreeningError,
  UploadMeta,
  UploadedFileInfo,
} from '../services/screening.service';
import {
  success,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
  serverError,
} from '../utils/response.util';

function mapServiceError(res: Response, err: unknown): void {
  if (err instanceof ScreeningError) {
    switch (err.statusCode) {
      case 400: badRequest(res, err.message); return;
      case 403: forbidden(res, err.message); return;
      case 404: notFound(res, err.message); return;
      case 409: conflict(res, err.message); return;
      case 413: res.status(413).json({ success: false, error: err.message }); return;
      case 415: res.status(415).json({ success: false, error: err.message }); return;
    }
  }
  console.error('[screening] service error:', err);
  serverError(res);
}

// POST /screening/patient/:patientId  (multipart/form-data)
export async function upload(req: Request, res: Response): Promise<void> {
  const patientId = parseInt(req.params['patientId'], 10);
  if (Number.isNaN(patientId) || patientId <= 0) {
    cleanupMulterFiles(req);
    badRequest(res, 'Invalid patient ID');
    return;
  }

  const user = req.user;
  if (!user) { cleanupMulterFiles(req); forbidden(res); return; }

  const rawFiles = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (rawFiles.length === 0) {
    // Either no files attached, or everything was rejected by the fileFilter.
    res.status(415).json({ success: false, error: 'No valid images in upload. Only .jpg / .jpeg / .png are accepted.' });
    return;
  }

  // `meta` arrives as a JSON-encoded string in the multipart form — parse it
  // into an array of UploadMeta.  Malformed JSON is a client error, not a 500.
  let metaList: UploadMeta[];
  try {
    const rawMeta = (req.body as Record<string, unknown>)['meta'];
    if (typeof rawMeta !== 'string') throw new Error('meta is required');
    const parsed: unknown = JSON.parse(rawMeta);
    if (!Array.isArray(parsed)) throw new Error('meta must be an array');
    metaList = parsed as UploadMeta[];
  } catch (err) {
    cleanupMulterFiles(req);
    badRequest(res, `Invalid meta payload: ${(err as Error).message}`);
    return;
  }

  const files: UploadedFileInfo[] = rawFiles.map(f => ({
    absolutePath: f.path,
    relativePath: toRelativeUploadPath(f.path),
    originalName: f.originalname,
    mime:         f.mimetype,
    size:         f.size,
  }));

  // Optional appointment_id override: when the DA picks a specific appointment
  // in the modal dropdown.  Absent → service falls back to auto-selection.
  const rawApptId = (req.body as Record<string, unknown>)['appointment_id']
    ?? (req.body as Record<string, unknown>)['appointmentId'];
  let chosenAppointmentId: number | undefined;
  if (rawApptId != null && rawApptId !== '') {
    const parsed = parseInt(String(rawApptId), 10);
    if (!Number.isNaN(parsed) && parsed > 0) chosenAppointmentId = parsed;
  }

  try {
    const result = await uploadScreeningsService(
      patientId,
      user.userId,
      user.role,
      files,
      metaList,
      chosenAppointmentId,
    );
    created(res, result, 'Screenings uploaded');
  } catch (err) {
    mapServiceError(res, err);
  }
}

// GET /screening/patient/:patientId/todays-appointment
// Returns the appointment that a DA upload would attach to today, or null.
// Mirrors the same selection logic as the upload guard so the UI stays in sync.
export async function todaysAppointment(req: Request, res: Response): Promise<void> {
  const patientId = parseInt(req.params['patientId'], 10);
  if (Number.isNaN(patientId) || patientId <= 0) { badRequest(res, 'Invalid patient ID'); return; }

  const user = req.user;
  if (!user) { forbidden(res); return; }

  try {
    const appt = await getUploadGateAppointmentService(patientId);
    success(res, appt);
  } catch (err) {
    mapServiceError(res, err);
  }
}

// GET /screening/patient/:patientId/todays-appointments
// Returns every today's appointment the DA can upload against — used to
// populate the appointment picker dropdown in the upload modal.
export async function todaysAppointmentsList(req: Request, res: Response): Promise<void> {
  const patientId = parseInt(req.params['patientId'], 10);
  if (Number.isNaN(patientId) || patientId <= 0) { badRequest(res, 'Invalid patient ID'); return; }

  const user = req.user;
  if (!user) { forbidden(res); return; }

  try {
    const list = await listTodaysAppointmentsService(patientId);
    success(res, list);
  } catch (err) {
    mapServiceError(res, err);
  }
}

// GET /screening/record/:recordId
export async function listByRecord(req: Request, res: Response): Promise<void> {
  const recordId = parseInt(req.params['recordId'], 10);
  if (Number.isNaN(recordId) || recordId <= 0) { badRequest(res, 'Invalid record ID'); return; }

  const user = req.user;
  if (!user) { forbidden(res); return; }

  try {
    const screenings = await listScreeningsForRecordService(recordId, user.userId, user.role);
    success(res, screenings);
  } catch (err) {
    mapServiceError(res, err);
  }
}

// GET /screening/file/:imageId
export async function serveFile(req: Request, res: Response): Promise<void> {
  const imageId = parseInt(req.params['imageId'], 10);
  if (Number.isNaN(imageId) || imageId <= 0) { badRequest(res, 'Invalid image ID'); return; }

  const user = req.user;
  if (!user) { forbidden(res); return; }

  try {
    const file = await resolveScreeningFileService(imageId, user.userId, user.role);
    // Stream the file with the correct content type.  Avoid res.sendFile for
    // absolute-path portability across Windows / Linux dev environments.
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=60');
    const stream = fs.createReadStream(file.absolutePath);
    stream.on('error', (err) => {
      console.error('[screening] stream error:', err);
      if (!res.headersSent) serverError(res);
    });
    stream.pipe(res);
  } catch (err) {
    mapServiceError(res, err);
  }
}

// DELETE /screening/:imageId
export async function softDelete(req: Request, res: Response): Promise<void> {
  const imageId = parseInt(req.params['imageId'], 10);
  if (Number.isNaN(imageId) || imageId <= 0) { badRequest(res, 'Invalid image ID'); return; }

  const user = req.user;
  if (!user) { forbidden(res); return; }

  try {
    await deleteScreeningService(imageId, user.userId, user.role);
    success(res, null, 'Screening deleted');
  } catch (err) {
    mapServiceError(res, err);
  }
}

// If the request bails early (bad patientId, malformed meta), the files multer
// already wrote to disk are orphans.  Best-effort cleanup.
function cleanupMulterFiles(req: Request): void {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  for (const f of files) {
    fs.promises.unlink(f.path).catch(() => { /* swallow */ });
  }
}
