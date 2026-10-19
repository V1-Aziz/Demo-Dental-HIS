import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, created, notFound, serverError, badRequest, forbidden } from '../utils/response.util';
import {
  listLabRequestsService,
  getLabRequestByIdService,
  createLabRequestService,
  updateLabRequestStatusService,
  reviewLabRequestService,
  createLabResponseService,
  claimLabRequestService,
} from '../services/lab.service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const filters: Record<string, any> = {
      status:    req.query['status']    ? String(req.query['status'])                   : undefined,
      patientId: req.query['patientId'] ? parseInt(String(req.query['patientId']), 10)  : undefined,
      search:    req.query['search']    ? String(req.query['search'])                   : undefined,
    };
    if (req.user?.role === 'Student' && req.user.academicId) {
      filters['studentId'] = req.user.academicId;
    }
    if (req.user?.role === 'Doctor' && req.user.employeeId) {
      filters['employeeId'] = req.user.employeeId;
    }
    // LabTechnician: scope by queue (incoming / my_work / history) when explicitly requested
    if (req.user?.role === 'LabTechnician' && req.user.employeeId) {
      const queue = req.query['queue'] as string | undefined;
      if (queue === 'incoming' || queue === 'my_work' || queue === 'history') {
        filters['queue']          = queue;
        filters['techEmployeeId'] = req.user.employeeId;
      }
      // No queue param: return all requests so the frontend can populate both tabs
    }
    const result = await listLabRequestsService(filters, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const role = req.user!.role;

    let studentId: number | null = null;
    let supervisorEmployeeId: number;

    if (role === 'Doctor') {
      if (!req.user!.employeeId) { badRequest(res, 'Doctor employee ID not found in token'); return; }
      supervisorEmployeeId = req.user!.employeeId;
    } else {
      // Student
      if (!req.user!.academicId) { badRequest(res, 'Student academic ID not found in token'); return; }
      studentId = req.user!.academicId;
      if (!req.body.supervisorEmployeeId) { badRequest(res, 'Supervisor employee ID is required'); return; }
      supervisorEmployeeId = req.body.supervisorEmployeeId;
    }

    const result = await createLabRequestService({
      studentId,
      supervisorEmployeeId,
      patientId:   req.body.patientId,
      requestNote: req.body.requestNote,
      toothNumber: req.body.toothNumber ?? null,
    });
    created(res, result, 'Lab request created');
  } catch (err: any) {
    console.error('[Lab Create Error]', err?.message ?? err);
    serverError(res, err?.message ?? 'Internal server error');
  }
}

const VALID_STATUSES = ['Pending', 'Approved', 'Rejected', 'In Progress', 'Delivered'];

export async function updateStatus(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid lab request ID'); return; }
    if (!req.user?.employeeId) { badRequest(res, 'Employee ID not found in token'); return; }

    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      badRequest(res, `status must be one of: ${VALID_STATUSES.join(', ')}`);
      return;
    }
    const updated = await updateLabRequestStatusService(id, status, req.user.employeeId);
    if (!updated) { notFound(res, 'Lab request not found or not assigned to you'); return; }
    success(res, { lab_request_id: id, request_status: status });
  } catch {
    serverError(res);
  }
}

export async function claimRequest(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid lab request ID'); return; }
    if (!req.user?.employeeId) { badRequest(res, 'Employee ID not found in token'); return; }

    const claimed = await claimLabRequestService(id, req.user.employeeId);
    if (!claimed) {
      notFound(res, 'Lab request not found, already claimed, or not in a claimable state');
      return;
    }
    success(res, { lab_request_id: id, request_status: 'In Progress' }, 'Lab request claimed');
  } catch {
    serverError(res);
  }
}

export async function review(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid lab request ID'); return; }
    if (!req.user?.employeeId) { badRequest(res, 'Doctor employee ID not found in token'); return; }

    const { status, supervisorFeedback } = req.body as {
      status: 'Approved' | 'Rejected';
      supervisorFeedback?: string;
    };

    const updated = await reviewLabRequestService(
      id,
      req.user.employeeId,
      status,
      supervisorFeedback?.trim() ?? null,
    );

    if (!updated) {
      notFound(res, 'Lab request not found or is not eligible for review');
      return;
    }

    success(res, { lab_request_id: id, request_status: status }, `Lab request ${status.toLowerCase()}`);
  } catch {
    serverError(res);
  }
}

export async function createResponse(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid lab request ID'); return; }
    const { responseNote } = req.body;
    if (!responseNote || typeof responseNote !== 'string' || responseNote.trim().length === 0) {
      badRequest(res, 'responseNote is required');
      return;
    }
    const result = await createLabResponseService(id, responseNote.trim());
    created(res, result, 'Lab response saved');
  } catch (err: any) {
    console.error('[Lab Response Error]', err?.message ?? err);
    serverError(res, err?.message ?? 'Internal server error');
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id)) { notFound(res, 'Invalid lab request ID'); return; }

    // Students may only read their own requests; pass academicId so the
    // repository WHERE clause enforces the ownership check at the DB level.
    const studentId = req.user?.role === 'Student' ? (req.user.academicId ?? null) : null;

    const item = await getLabRequestByIdService(id, studentId);

    // A null result for a student means the row either doesn't exist or belongs
    // to another student — both surfaces as 403 to avoid information leakage.
    if (!item) {
      if (req.user?.role === 'Student') { forbidden(res, 'Access denied'); return; }
      notFound(res, 'Lab request not found');
      return;
    }

    success(res, item);
  } catch {
    serverError(res);
  }
}
