// Business logic for the unified academic review workflow.
// No SQL here — data access is in academic.repository.ts.
// No req/res here — HTTP concerns stay in academic.controller.ts.
import {
  getReviewQueue,
  getReviewQueueStats,
  getSubmissionDetail,
  getSubmissionBasic,
  updateDiagnosisReview,
  updateTreatmentReview,
  insertReviewHistory,
  getMySubmissions,
  resubmitDiagnosis,
  resubmitTreatment,
  withdrawSubmission,
  getSupervisorForStudent,
  getStudentForSubmission,
  getGradeBySubmission,
  insertGrade,
  getStudentGradeRecords,
  getGradeSummary,
  getMyGrades,
} from '../repositories/academic.repository';
import {
  getUserIdByEmployeeId,
  getUserIdByAcademicId,
} from '../repositories/notification.repository';
import { dispatch } from './notification.service';
import { buildLinkTo } from './notifications.links';
import { ReviewStatus, SubmissionType, ReviewHistoryAction, MAX_REVISION_ROUNDS } from '../enums/academic.enum';
import { ReviewActionRequest, ResubmitRequest } from '../types/academic.types';

export class AcademicError extends Error {
  constructor(
    public readonly statusCode: 400 | 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'AcademicError';
  }
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function statusesForFilter(
  filter: 'pending' | 'revision' | 'decided' | 'all',
): ReviewStatus[] {
  switch (filter) {
    case 'pending':  return [ReviewStatus.Submitted];
    case 'revision': return [ReviewStatus.RevisionRequested];
    case 'decided':  return [ReviewStatus.Approved, ReviewStatus.Rejected];
    case 'all':      return [ReviewStatus.Submitted, ReviewStatus.RevisionRequested, ReviewStatus.Approved, ReviewStatus.Rejected];
  }
}

// ─── Doctor: queue ────────────────────────────────────────────────────────────

export async function getReviewQueueService(
  doctorEmployeeId: number,
  filter: 'pending' | 'revision' | 'decided' | 'all',
) {
  return getReviewQueue(doctorEmployeeId, statusesForFilter(filter), filter === 'decided');
}

export async function getReviewQueueStatsService(doctorEmployeeId: number) {
  return getReviewQueueStats(doctorEmployeeId);
}

// ─── Doctor: detail ───────────────────────────────────────────────────────────

export async function getSubmissionDetailService(
  type:                  SubmissionType,
  submissionId:          number,
  requestingDoctorEmpId: number,
) {
  const detail = await getSubmissionDetail(type, submissionId);
  if (!detail) throw new AcademicError(404, 'Submission not found');

  const info = await getStudentForSubmission(type, submissionId);
  if (!info || info.supervisorEmployeeId !== requestingDoctorEmpId) {
    throw new AcademicError(403, 'You are not the supervising doctor for this student');
  }

  return detail;
}

// ─── Doctor: review action ────────────────────────────────────────────────────

export async function reviewSubmissionService(
  type:               SubmissionType,
  submissionId:       number,
  reviewerEmployeeId: number,
  request:            ReviewActionRequest,
): Promise<void> {
  const sub = await getSubmissionBasic(type, submissionId);
  if (!sub) throw new AcademicError(404, 'Submission not found');

  const info = await getStudentForSubmission(type, submissionId);
  if (!info || info.supervisorEmployeeId !== reviewerEmployeeId) {
    throw new AcademicError(403, 'You are not the supervising doctor for this student');
  }

  const actionable: ReviewStatus[] = [ReviewStatus.Submitted, ReviewStatus.RevisionRequested];
  if (!actionable.includes(sub.status)) {
    throw new AcademicError(409, 'This submission has already been decided');
  }

  const { action, feedback } = request;

  if (action === 'request_revision') {
    if (!feedback?.trim()) throw new AcademicError(400, 'Feedback is required when requesting revision');
    if (sub.revision_count >= MAX_REVISION_ROUNDS) {
      throw new AcademicError(422, `Maximum revision rounds (${MAX_REVISION_ROUNDS}) reached. Approve or reject this submission.`);
    }

    const round = sub.revision_count + 1;
    if (type === SubmissionType.Diagnosis) {
      await updateDiagnosisReview(submissionId, ReviewStatus.RevisionRequested, reviewerEmployeeId, feedback, true);
    } else {
      await updateTreatmentReview(submissionId, ReviewStatus.RevisionRequested, reviewerEmployeeId, feedback, true);
    }
    await insertReviewHistory({
      submissionType: type, submissionId, roundNumber: round,
      reviewedBy: reviewerEmployeeId, action: ReviewHistoryAction.RevisionRequested, feedback,
    });
    await notifyStudent(info.academicId, submissionId, type, 'revision');

  } else if (action === 'approve') {
    if (type === SubmissionType.Diagnosis) {
      await updateDiagnosisReview(submissionId, ReviewStatus.Approved, reviewerEmployeeId, feedback ?? null, false);
    } else {
      await updateTreatmentReview(submissionId, ReviewStatus.Approved, reviewerEmployeeId, feedback ?? null, false);
    }
    await insertReviewHistory({
      submissionType: type, submissionId, roundNumber: sub.revision_count,
      reviewedBy: reviewerEmployeeId, action: ReviewHistoryAction.Approved, feedback: feedback ?? null,
    });
    await notifyStudent(info.academicId, submissionId, type, 'approved');

  } else if (action === 'reject') {
    if (!feedback?.trim()) throw new AcademicError(400, 'Feedback is required when rejecting a submission');
    if (type === SubmissionType.Diagnosis) {
      await updateDiagnosisReview(submissionId, ReviewStatus.Rejected, reviewerEmployeeId, feedback, false);
    } else {
      await updateTreatmentReview(submissionId, ReviewStatus.Rejected, reviewerEmployeeId, feedback, false);
    }
    await insertReviewHistory({
      submissionType: type, submissionId, roundNumber: sub.revision_count,
      reviewedBy: reviewerEmployeeId, action: ReviewHistoryAction.Rejected, feedback,
    });
    await notifyStudent(info.academicId, submissionId, type, 'rejected');
  }
}

// ─── Student: list ────────────────────────────────────────────────────────────

export async function getMySubmissionsService(studentAcademicId: number) {
  return getMySubmissions(studentAcademicId);
}

// ─── Student: resubmit ────────────────────────────────────────────────────────

export async function resubmitNoteService(
  type:              SubmissionType,
  submissionId:      number,
  studentAcademicId: number,
  fields:            ResubmitRequest,
): Promise<void> {
  const sub = await getSubmissionBasic(type, submissionId);
  if (!sub) throw new AcademicError(404, 'Submission not found');
  if (sub.authored_by_student !== studentAcademicId) throw new AcademicError(403, 'You do not own this submission');
  if (sub.status !== ReviewStatus.RevisionRequested) throw new AcademicError(409, 'Only submissions in Revision_Requested status can be resubmitted');

  if (type === SubmissionType.Diagnosis) {
    await resubmitDiagnosis(submissionId, fields);
  } else {
    await resubmitTreatment(submissionId, fields);
  }

  await insertReviewHistory({
    submissionType: type, submissionId, roundNumber: sub.revision_count,
    reviewedBy: studentAcademicId,
    action:     ReviewHistoryAction.Resubmitted,
    feedback:   null,
  }).catch(() => {
    // Review_History.reviewed_by references Employee, not Student. Skip history for resubmit
    // since the student isn't an Employee record. Log but don't fail the operation.
    console.warn('academic.resubmit.history.skipped', { type, submissionId });
  });

  const supervisorId = await getSupervisorForStudent(studentAcademicId);
  if (supervisorId) {
    await notifyDoctor(supervisorId, submissionId, type, 'resubmitted');
  }
}

// ─── Student: withdraw ────────────────────────────────────────────────────────

export async function withdrawSubmissionService(
  type:              SubmissionType,
  submissionId:      number,
  studentAcademicId: number,
): Promise<void> {
  const sub = await getSubmissionBasic(type, submissionId);
  if (!sub) throw new AcademicError(404, 'Submission not found');
  if (sub.authored_by_student !== studentAcademicId) throw new AcademicError(403, 'You do not own this submission');

  const withdrawable: ReviewStatus[] = [ReviewStatus.Submitted, ReviewStatus.RevisionRequested];
  if (!withdrawable.includes(sub.status)) {
    throw new AcademicError(409, 'Only pending or revision-requested submissions can be withdrawn');
  }

  await withdrawSubmission(type, submissionId);
}

// ─── Notification helpers ─────────────────────────────────────────────────────

async function notifyStudent(
  studentAcademicId: number,
  submissionId:      number,
  type:              SubmissionType,
  event:             'revision' | 'approved' | 'rejected',
): Promise<void> {
  try {
    const userId = await getUserIdByAcademicId(studentAcademicId);
    if (!userId) return;
    const notifType = event === 'revision'
      ? 'academic.submission.revision_requested'
      : event === 'approved' ? 'academic.submission.approved' : 'academic.submission.rejected';
    const title   = event === 'revision' ? 'Revision requested' : event === 'approved' ? 'Note approved' : 'Note rejected';
    const message = event === 'revision' ? '1 note requires revision' : event === 'approved' ? 'Your note was approved' : 'Your note was rejected';
    await dispatch({
      userId,
      type:              notifType,
      title,
      message,
      linkTo:            buildLinkTo(notifType, submissionId, 'Student'),
      relatedEntityType: type,
      relatedEntityId:   submissionId,
    });
  } catch (err) {
    console.warn('academic.notify.student.failed', { event, submissionId, err });
  }
}

async function notifyDoctor(
  doctorEmployeeId: number,
  submissionId:     number,
  type:             SubmissionType,
  event:            'new' | 'resubmitted',
): Promise<void> {
  try {
    const userId = await getUserIdByEmployeeId(doctorEmployeeId);
    if (!userId) return;
    const notifType = event === 'new' ? 'academic.submission.new' : 'academic.submission.resubmitted';
    await dispatch({
      userId,
      type:              notifType,
      title:             event === 'new' ? 'New note for review' : 'Resubmitted for review',
      message:           '1 note requires review',
      linkTo:            buildLinkTo(notifType, submissionId, 'Doctor'),
      relatedEntityType: type,
      relatedEntityId:   submissionId,
    });
  } catch (err) {
    console.warn('academic.notify.doctor.failed', { event, submissionId, err });
  }
}

// Exported so diagnosis.service can call it when a student submits a new note
export { notifyDoctor as notifyDoctorOfNewSubmission };

// ─── Grades ───────────────────────────────────────────────────────────────────

export async function submitGradeService(
  doctorEmployeeId: number,
  body: {
    submissionType: string;
    submissionId:   number;
    studentId:      number;
    grade:          number;
    feedbackNote?:  string;
  },
) {
  const { submissionType, submissionId, studentId, grade, feedbackNote } = body;

  const existing = await getGradeBySubmission(submissionType, submissionId);
  if (existing) throw new AcademicError(409, 'This submission has already been graded');

  const info = await getStudentForSubmission(submissionType as SubmissionType, submissionId);
  if (!info || info.supervisorEmployeeId !== doctorEmployeeId) {
    throw new AcademicError(403, 'You are not the supervising doctor for this student');
  }

  return insertGrade({
    submissionType,
    submissionId,
    studentId,
    gradedBy:     doctorEmployeeId,
    grade,
    feedbackNote: feedbackNote ?? null,
  });
}

export async function getStudentGradesService(
  studentId:        number,
  doctorEmployeeId: number,
) {
  return getStudentGradeRecords(studentId, doctorEmployeeId);
}

export async function getGradeSummaryService(doctorEmployeeId: number) {
  return getGradeSummary(doctorEmployeeId);
}

export async function getMyGradesService(studentAcademicId: number) {
  return getMyGrades(studentAcademicId);
}
