import { Request, Response } from 'express';
import {
  success,
  created,
  badRequest,
  notFound,
  forbidden,
  conflict,
  unprocessable,
  serverError,
} from '../utils/response.util';
import {
  getReviewQueueService,
  getReviewQueueStatsService,
  getSubmissionDetailService,
  reviewSubmissionService,
  getMySubmissionsService,
  resubmitNoteService,
  withdrawSubmissionService,
  submitGradeService,
  getStudentGradesService,
  getGradeSummaryService,
  getMyGradesService,
  AcademicError,
} from '../services/academic.service';
import { SubmissionType } from '../enums/academic.enum';
import { ReviewActionRequest, ResubmitRequest } from '../types/academic.types';

function parseType(raw: string): SubmissionType | null {
  if (raw === 'Diagnosis') return SubmissionType.Diagnosis;
  if (raw === 'Treatment') return SubmissionType.Treatment;
  return null;
}

function handleAcademicError(res: Response, err: unknown): Response {
  if (err instanceof AcademicError) {
    switch (err.statusCode) {
      case 400: return badRequest(res, err.message);
      case 403: return forbidden(res, err.message);
      case 404: return notFound(res, err.message);
      case 409: return conflict(res, err.message);
      case 422: return unprocessable(res, err.message);
    }
  }
  return serverError(res);
}

// ─── Doctor routes ────────────────────────────────────────────────────────────

export async function pendingReviews(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const filter = (req.query['filter'] as string) || 'pending';
    const allowed = ['pending', 'revision', 'decided', 'all'];
    if (!allowed.includes(filter)) { badRequest(res, 'Invalid filter value'); return; }
    const items = await getReviewQueueService(doctorId, filter as any);
    success(res, { items, total: items.length });
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function reviewQueueStats(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const stats = await getReviewQueueStatsService(doctorId);
    success(res, stats);
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function getReviewDetail(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const type = parseType(req.params['type']);
    if (!type) { badRequest(res, 'type must be Diagnosis or Treatment'); return; }
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id) || id <= 0) { badRequest(res, 'Invalid ID'); return; }
    const detail = await getSubmissionDetailService(type, id, doctorId);
    success(res, detail);
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function reviewSubmission(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const type = parseType(req.params['type']);
    if (!type) { badRequest(res, 'type must be Diagnosis or Treatment'); return; }
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id) || id <= 0) { badRequest(res, 'Invalid ID'); return; }
    await reviewSubmissionService(type, id, doctorId, req.body as ReviewActionRequest);
    success(res, null, 'Review submitted');
  } catch (err) {
    handleAcademicError(res, err);
  }
}

// ─── Student routes ───────────────────────────────────────────────────────────

export async function mySubmissions(req: Request, res: Response): Promise<void> {
  try {
    const academicId = req.user?.academicId;
    if (!academicId) { badRequest(res, 'Academic ID required'); return; }
    const items = await getMySubmissionsService(academicId);
    success(res, { items, total: items.length });
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function resubmitNote(req: Request, res: Response): Promise<void> {
  try {
    const academicId = req.user?.academicId;
    if (!academicId) { badRequest(res, 'Academic ID required'); return; }
    const type = parseType(req.params['type']);
    if (!type) { badRequest(res, 'type must be Diagnosis or Treatment'); return; }
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id) || id <= 0) { badRequest(res, 'Invalid ID'); return; }
    await resubmitNoteService(type, id, academicId, req.body as ResubmitRequest);
    success(res, null, 'Resubmitted for review');
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function withdrawNote(req: Request, res: Response): Promise<void> {
  try {
    const academicId = req.user?.academicId;
    if (!academicId) { badRequest(res, 'Academic ID required'); return; }
    const type = parseType(req.params['type']);
    if (!type) { badRequest(res, 'type must be Diagnosis or Treatment'); return; }
    const id = parseInt(req.params['id'], 10);
    if (isNaN(id) || id <= 0) { badRequest(res, 'Invalid ID'); return; }
    await withdrawSubmissionService(type, id, academicId);
    success(res, null, 'Submission withdrawn');
  } catch (err) {
    handleAcademicError(res, err);
  }
}

// ─── Grade routes ─────────────────────────────────────────────────────────────

export async function submitGrade(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const { submissionType, submissionId, studentId, grade, feedbackNote } = req.body as any;
    if (typeof grade !== 'number' || grade < 0 || grade > 10) {
      badRequest(res, 'grade must be an integer between 0 and 10'); return;
    }
    const gradeRow = await submitGradeService(doctorId, { submissionType, submissionId, studentId, grade, feedbackNote });
    created(res, gradeRow, 'Grade submitted');
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function getStudentGrades(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const studentId = parseInt(req.params['studentId'], 10);
    if (isNaN(studentId) || studentId <= 0) { badRequest(res, 'Invalid student ID'); return; }
    const records = await getStudentGradesService(studentId, doctorId);
    success(res, { records, total: records.length });
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function getGradeSummary(req: Request, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.employeeId;
    if (!doctorId) { badRequest(res, 'Employee ID required'); return; }
    const students = await getGradeSummaryService(doctorId);
    success(res, { students, total: students.length });
  } catch (err) {
    handleAcademicError(res, err);
  }
}

export async function getMyGrades(req: Request, res: Response): Promise<void> {
  try {
    const academicId = req.user?.academicId;
    if (!academicId) { badRequest(res, 'Academic ID required'); return; }
    const data = await getMyGradesService(academicId);
    success(res, data);
  } catch (err) {
    handleAcademicError(res, err);
  }
}
