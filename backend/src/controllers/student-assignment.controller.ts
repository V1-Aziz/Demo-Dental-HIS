import { Request, Response } from 'express';
import {
  success,
  created,
  badRequest,
  serverError,
} from '../utils/response.util';
import {
  getFileAccessService,
  createOrGetAssignmentService,
  getStudentAssignmentsService,
} from '../services/student-assignment.service';

// GET /academic/file-access/:patientId
// Returns the student's current access level for a specific patient file.
// The frontend calls this on every chart load to decide which UI to render.
export async function getFileAccess(req: Request, res: Response): Promise<void> {
  try {
    const userId    = req.user?.userId;
    const patientId = parseInt(req.params['patientId'], 10);
    if (!userId)                        { badRequest(res, 'User ID required'); return; }
    if (isNaN(patientId) || patientId <= 0) { badRequest(res, 'Invalid patient ID'); return; }

    const access = await getFileAccessService(userId, patientId);
    success(res, access);
  } catch {
    serverError(res);
  }
}

// POST /academic/assignments
// Creates a new 24-hour write assignment for the authenticated student.
// Returns existing assignment (200) if one already exists; new one (201) otherwise.
export async function createAssignment(req: Request, res: Response): Promise<void> {
  try {
    const userId    = req.user?.userId;
    const patientId = parseInt(req.body?.patientId, 10);
    if (!userId)                        { badRequest(res, 'User ID required'); return; }
    if (isNaN(patientId) || patientId <= 0) { badRequest(res, 'Invalid patient ID'); return; }

    const { assignment, created: wasCreated } = await createOrGetAssignmentService(userId, patientId);
    if (wasCreated) {
      created(res, assignment, 'Assignment created');
    } else {
      success(res, assignment, 'Assignment already exists');
    }
  } catch {
    serverError(res);
  }
}

// GET /academic/assignments
// Returns all assignments for the authenticated student sorted by assignedAt desc.
export async function getMyAssignments(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) { badRequest(res, 'User ID required'); return; }

    const items = await getStudentAssignmentsService(userId);
    success(res, { items, total: (items as unknown[]).length });
  } catch {
    serverError(res);
  }
}
