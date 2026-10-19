// HTTP handlers for the Screening_Requests module.  Parses req, calls service,
// returns responses via response.util.ts.  No business logic here.
import { Request, Response } from 'express';
import {
  createScreeningRequestService,
  cancelScreeningRequestService,
  listMyScreeningRequestsService,
  getScreeningRequestsByRecordService,
  ScreeningRequestError,
} from '../services/screening-requests.service';
import {
  success,
  created,
  badRequest,
  forbidden,
  notFound,
  conflict,
  serverError,
} from '../utils/response.util';

function mapError(res: Response, err: unknown): void {
  if (err instanceof ScreeningRequestError) {
    switch (err.statusCode) {
      case 400: badRequest(res, err.message); return;
      case 403: forbidden(res, err.message); return;
      case 404: notFound(res, err.message); return;
      case 409: conflict(res, err.message); return;
      case 503: res.status(503).json({ success: false, error: err.message }); return;
    }
  }
  console.error('[screening-requests] service error:', err);
  serverError(res);
}

// POST /screening-requests
export async function create(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) { forbidden(res); return; }

  const { record_id, patient_id, appointment_id } = req.body as {
    record_id: number;
    patient_id: number;
    appointment_id?: number | null;
  };

  try {
    const result = await createScreeningRequestService(
      record_id,
      patient_id,
      appointment_id ?? null,
      user.userId,
    );
    created(res, result, 'Screening request created and assigned to a radiologist');
  } catch (err) {
    mapError(res, err);
  }
}

// PATCH /screening-requests/:id/cancel
export async function cancel(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) { forbidden(res); return; }

  const requestId = parseInt(req.params['id'], 10);
  if (Number.isNaN(requestId) || requestId <= 0) {
    badRequest(res, 'Invalid request ID');
    return;
  }

  try {
    await cancelScreeningRequestService(requestId, user.userId);
    success(res, null, 'Screening request cancelled');
  } catch (err) {
    mapError(res, err);
  }
}

// GET /screening-requests/mine
export async function listMine(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) { forbidden(res); return; }

  const limit  = Math.min(parseInt(String(req.query['limit']  ?? '20'), 10), 100);
  const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

  try {
    const rows = await listMyScreeningRequestsService(user.userId, limit, offset);
    success(res, rows);
  } catch (err) {
    mapError(res, err);
  }
}

// GET /screening-requests/record/:recordId
export async function listByRecord(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) { forbidden(res); return; }

  const recordId = parseInt(req.params['recordId'], 10);
  if (Number.isNaN(recordId) || recordId <= 0) {
    badRequest(res, 'Invalid record ID');
    return;
  }

  try {
    const rows = await getScreeningRequestsByRecordService(recordId);
    success(res, rows);
  } catch (err) {
    mapError(res, err);
  }
}
