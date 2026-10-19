// /academic — mirrors academic.routes.ts, academic.service.ts,
// academic.repository.ts and the student-assignment controller/service/repository.
import { DemoRouter, DemoResponse, ok, created, badRequest, conflict, forbidden, notFound, unprocessable } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { now, today, localDate } from '../data/time';
import { audit, buildLinkTo, employeeById, name2, notifyUsers, patientById, recordById, studentById } from '../helpers';

type SubmissionType = 'Diagnosis' | 'Treatment';
const MAX_REVISION_ROUNDS = 3;
const WRITE_ACCESS_MS = 24 * 60 * 60 * 1000;

const table = (t: SubmissionType) => (t === 'Diagnosis' ? 'Diagnosis' : 'Treatment');
const idCol = (t: SubmissionType) => (t === 'Diagnosis' ? 'diagnosis_id' : 'treatment_id');
const parseType = (raw: string): SubmissionType | null => (raw === 'Diagnosis' || raw === 'Treatment' ? raw : null);

function submission(db: DemoDb, type: SubmissionType, id: number): Row | undefined {
  return db.tables[table(type)].find(x => x[idCol(type)] === id && !x.deleted_at);
}

function patientOf(db: DemoDb, row: Row): Row | undefined {
  return patientById(db, recordById(db, row.record_id)?.patient_id);
}

const isStale = (row: Row) =>
  (Date.now() - new Date(row.submitted_at).getTime()) / 3_600_000 > 24 && ['Submitted', 'Revision_Requested'].includes(row.status);

function hasMedicalAlert(db: DemoDb, row: Row): boolean {
  const c = recordById(db, row.record_id)?.chronic_diseases;
  return !!c && c.length > 0;
}

function history(db: DemoDb, type: SubmissionType, id: number): Row[] {
  return db.tables.Review_History
    .filter(h => h.submission_type === type && h.submission_id === id && employeeById(db, h.reviewed_by))
    .sort((a, b) => a.round_number - b.round_number)
    .map(h => ({
      round_number: h.round_number,
      action: h.action,
      feedback: h.feedback,
      reviewer_name: name2(employeeById(db, h.reviewed_by)),
      created_at: h.created_at,
    }));
}

function queueRow(db: DemoDb, type: SubmissionType, x: Row): Row {
  const s = studentById(db, x.authored_by_student)!;
  const p = patientOf(db, x)!;
  return {
    submission_id: x[idCol(type)],
    submission_type: type,
    student_id: s.academic_id,
    student_name: name2(s),
    student_level: s.academic_level,
    patient_id: p.patient_id,
    patient_name: name2(p),
    patient_file_no: p.file_number,
    has_medical_alert: hasMedicalAlert(db, x),
    procedure_label: type === 'Diagnosis' ? x.diagnosis_type : x.treatment_type,
    status: x.status,
    submitted_at: x.submitted_at,
    revision_count: x.revision_count,
    is_stale: isStale(x),
    reviewed_at: x.reviewed_at,
  };
}

/** Student submissions (both kinds) whose student is supervised by `doctorId`. */
function supervised(db: DemoDb, doctorId: number): { type: SubmissionType; row: Row }[] {
  const out: { type: SubmissionType; row: Row }[] = [];
  for (const type of ['Diagnosis', 'Treatment'] as SubmissionType[]) {
    for (const x of db.tables[table(type)]) {
      if (x.deleted_at || x.authored_by_student === null) continue;
      const s = studentById(db, x.authored_by_student);
      if (s?.employee_id === doctorId && patientOf(db, x)) out.push({ type, row: x });
    }
  }
  return out;
}

function supervisorOf(db: DemoDb, type: SubmissionType, id: number): number | null {
  const x = submission(db, type, id);
  if (!x || x.authored_by_student === null) return null;
  return studentById(db, x.authored_by_student)?.employee_id ?? null;
}

function notifyStudent(db: DemoDb, academicId: number, id: number, type: SubmissionType, event: 'revision' | 'approved' | 'rejected'): void {
  const notifType = event === 'revision' ? 'academic.submission.revision_requested'
    : event === 'approved' ? 'academic.submission.approved' : 'academic.submission.rejected';
  notifyUsers(db, [studentById(db, academicId)?.user_id], {
    type: notifType,
    title: event === 'revision' ? 'Revision requested' : event === 'approved' ? 'Note approved' : 'Note rejected',
    message: event === 'revision' ? '1 note requires revision' : event === 'approved' ? 'Your note was approved' : 'Your note was rejected',
    linkTo: buildLinkTo(notifType, id, 'Student'),
    relatedEntityType: type,
    relatedEntityId: id,
  });
}

export function notifyDoctor(db: DemoDb, doctorId: number, id: number, type: SubmissionType, event: 'new' | 'resubmitted'): void {
  const notifType = event === 'new' ? 'academic.submission.new' : 'academic.submission.resubmitted';
  notifyUsers(db, [employeeById(db, doctorId)?.user_id], {
    type: notifType,
    title: event === 'new' ? 'New note for review' : 'Resubmitted for review',
    message: '1 note requires review',
    linkTo: buildLinkTo(notifType, id, 'Doctor'),
    relatedEntityType: type,
    relatedEntityId: id,
  });
}

// ─── Student file access (student-assignment.service.ts) ─────────────────────

export function fileAccess(db: DemoDb, studentUserId: number, patientId: number): Row {
  const a = db.tables.Student_Assignments.find(x => x.student_id === studentUserId && x.patient_id === patientId);
  if (!a) return { accessType: 'read', isAssigned: false, isExpired: false, hoursRemaining: 0 };
  const expiresAt = new Date(a.write_access_expires_at).getTime();
  if (Date.now() > expiresAt) {
    if (!a.is_expired) {
      a.access_type = 'read';
      a.is_expired = true;
      db.save();
    }
    return { accessType: 'read', isAssigned: true, isExpired: true, hoursRemaining: 0, expiredAt: new Date(expiresAt).toISOString() };
  }
  return {
    accessType: 'write',
    isAssigned: true,
    isExpired: false,
    hoursRemaining: Math.round(((expiresAt - Date.now()) / 3_600_000) * 10) / 10,
    writeAccessExpiresAt: new Date(expiresAt).toISOString(),
  };
}

function assignmentRow(a: Row): Row {
  return {
    assignment_id: a.assignment_id,
    student_id: a.student_id,
    patient_id: a.patient_id,
    assigned_at: a.assigned_at,
    write_access_expires_at: a.write_access_expires_at,
    access_type: a.access_type,
    is_expired: !!a.is_expired,
  };
}

export function registerAcademic(r: DemoRouter): void {
  r.get('/academic/pending-reviews', ['Doctor'], ({ user, query, db }) => {
    if (!user.employeeId) return badRequest('Employee ID required');
    const filter = query['filter'] || 'pending';
    const statuses: Record<string, string[]> = {
      pending: ['Submitted'],
      revision: ['Revision_Requested'],
      decided: ['Approved', 'Rejected'],
      all: ['Submitted', 'Revision_Requested', 'Approved', 'Rejected'],
    };
    if (!statuses[filter]) return badRequest('Invalid filter value');
    const items = supervised(db, user.employeeId)
      .filter(({ row }) => statuses[filter].includes(row.status))
      .filter(({ row }) => filter !== 'decided' || localDate(row.reviewed_at) === today())
      .map(({ type, row }) => queueRow(db, type, row))
      .sort((a, b) => a['submitted_at'].localeCompare(b['submitted_at']));
    return ok({ items, total: items.length });
  });

  r.get('/academic/review-queue-stats', ['Doctor'], ({ user, db }) => {
    if (!user.employeeId) return badRequest('Employee ID required');
    const rows = supervised(db, user.employeeId).map(x => x.row);
    const reviewedToday = (x: Row) => localDate(x.reviewed_at) === today();
    return ok({
      pending_count: rows.filter(x => x.status === 'Submitted').length,
      revision_requested_count: rows.filter(x => x.status === 'Revision_Requested').length,
      approved_today_count: rows.filter(x => x.status === 'Approved' && reviewedToday(x)).length,
      rejected_today_count: rows.filter(x => x.status === 'Rejected' && reviewedToday(x)).length,
    });
  });

  r.get('/academic/review/:type/:id', ['Doctor'], ({ user, params, db }) => {
    if (!user.employeeId) return badRequest('Employee ID required');
    const type = parseType(params['type']);
    if (!type) return badRequest('type must be Diagnosis or Treatment');
    const id = parseInt(params['id'], 10);
    if (isNaN(id) || id <= 0) return badRequest('Invalid ID');
    const x = submission(db, type, id);
    if (!x || !studentById(db, x.authored_by_student) || !patientOf(db, x)) return notFound('Submission not found');
    if (supervisorOf(db, type, id) !== user.employeeId) return forbidden('You are not the supervising doctor for this student');
    const base = queueRow(db, type, x);
    delete base['reviewed_at'];
    const extra = type === 'Diagnosis'
      ? { clinical_findings: x.clinical_findings, radiographic_findings: x.radiographic_findings, progress_note: x.progress_note }
      : { treatment_note: x.treatment_note };
    return ok({ ...base, ...extra, chronic_conditions: recordById(db, x.record_id)?.chronic_diseases ?? null, history: history(db, type, id) });
  });

  r.patch('/academic/review/:type/:id', ['Doctor'], (req) => {
    const { user, params, body, db } = req;
    if (!['approve', 'request_revision', 'reject'].includes(body?.action)) {
      return badRequest(`Invalid enum value. Expected 'approve' | 'request_revision' | 'reject', received '${body?.action}'`);
    }
    if (body.feedback !== undefined && (typeof body.feedback !== 'string' || body.feedback.length > 2000)) {
      return badRequest('String must contain at most 2000 character(s)');
    }
    const result = review(db, user.employeeId, params, body);
    audit(db, user, 'Academic_Review', 'Doctor reviewed student submission',
      `${params['type']} #${params['id']}: ${body.action ?? ''}`, null, result.status < 300 ? 'Success' : 'Failure');
    return result;
  });

  r.get('/academic/my-submissions', ['Student'], ({ user, db }) => {
    if (!user.academicId) return badRequest('Academic ID required');
    const items: Row[] = [];
    for (const type of ['Diagnosis', 'Treatment'] as SubmissionType[]) {
      for (const x of db.tables[table(type)].filter(r => r.authored_by_student === user.academicId && !r.deleted_at)) {
        const p = patientOf(db, x);
        if (!p) continue;
        items.push({
          submission_id: x[idCol(type)],
          submission_type: type,
          patient_name: name2(p),
          patient_file_no: p.file_number,
          procedure_label: type === 'Diagnosis' ? x.diagnosis_type : x.treatment_type,
          status: x.status,
          submitted_at: x.submitted_at,
          revision_count: x.revision_count,
          doctor_feedback: x.doctor_feedback,
          clinical_findings: type === 'Diagnosis' ? x.clinical_findings : null,
          radiographic_findings: type === 'Diagnosis' ? x.radiographic_findings : null,
          progress_note: type === 'Diagnosis' ? x.progress_note : null,
          treatment_note: type === 'Treatment' ? x.treatment_note : null,
        });
      }
    }
    items.sort((a, b) => b['submitted_at'].localeCompare(a['submitted_at']));
    return ok({ items, total: items.length });
  });

  r.patch('/academic/resubmit/:type/:id', ['Student'], (req) => {
    const { user, params, body, db } = req;
    const fields = ['diagnosis_type', 'clinical_findings', 'radiographic_findings', 'progress_note', 'treatment_type', 'treatment_note'];
    if (!fields.some(f => body?.[f] !== undefined)) return badRequest('At least one field must be provided for resubmission');
    if (fields.some(f => body[f] !== undefined && (typeof body[f] !== 'string' || !body[f]))) return badRequest('String must contain at least 1 character(s)');
    if (!user.academicId) return badRequest('Academic ID required');
    const type = parseType(params['type']);
    if (!type) return badRequest('type must be Diagnosis or Treatment');
    const id = parseInt(params['id'], 10);
    if (isNaN(id) || id <= 0) return badRequest('Invalid ID');
    const x = submission(db, type, id);
    if (!x) return notFound('Submission not found');
    if (x.authored_by_student !== user.academicId) return forbidden('You do not own this submission');
    if (x.status !== 'Revision_Requested') return conflict('Only submissions in Revision_Requested status can be resubmitted');

    x.status = 'Submitted';
    x.submitted_at = now();
    x.reviewed_at = null;
    x.doctor_feedback = null;
    if (type === 'Diagnosis') {
      x.reviewed_by = null;
      for (const f of ['diagnosis_type', 'clinical_findings', 'radiographic_findings', 'progress_note']) if (body[f] !== undefined) x[f] = body[f];
    } else {
      x.approved_by_doctor = null;
      for (const f of ['treatment_type', 'treatment_note']) if (body[f] !== undefined) x[f] = body[f];
    }
    db.save();
    // The backend tries to log a 'Resubmitted' history row with the student's
    // academic_id as reviewer, which the foreign key rejects, so none is stored.
    const supervisorId = studentById(db, user.academicId)?.employee_id;
    if (supervisorId) notifyDoctor(db, supervisorId, id, type, 'resubmitted');
    audit(db, user, 'Academic_Resubmit', 'Student resubmitted a note after revision request', `${params['type']} #${params['id']} resubmitted`);
    return ok(null, 'Resubmitted for review');
  });

  r.delete('/academic/submission/:type/:id', ['Student'], (req) => {
    const { user, params, db } = req;
    if (!user.academicId) return badRequest('Academic ID required');
    const type = parseType(params['type']);
    if (!type) return badRequest('type must be Diagnosis or Treatment');
    const id = parseInt(params['id'], 10);
    if (isNaN(id) || id <= 0) return badRequest('Invalid ID');
    const x = submission(db, type, id);
    if (!x) return notFound('Submission not found');
    if (x.authored_by_student !== user.academicId) return forbidden('You do not own this submission');
    if (!['Submitted', 'Revision_Requested'].includes(x.status)) {
      return conflict('Only pending or revision-requested submissions can be withdrawn');
    }
    x.deleted_at = now();
    db.save();
    audit(db, user, 'Academic_Withdraw', 'Student withdrew a pending submission', `${params['type']} #${params['id']} withdrawn`);
    return ok(null, 'Submission withdrawn');
  });

  r.get('/academic/grades/my', ['Student'], ({ user, db }) => {
    if (!user.academicId) return badRequest('Academic ID required');
    const grades = db.tables.Student_Grades
      .filter(g => g.student_id === user.academicId)
      .map(g => {
        const type = g.submission_type as SubmissionType;
        const x = db.tables[table(type)].find(r => r[idCol(type)] === g.submission_id);
        const p = x ? patientOf(db, x) : undefined;
        return x && p ? {
          grade_id: g.grade_id,
          submission_type: type,
          submission_id: g.submission_id,
          procedure_label: type === 'Diagnosis' ? x.diagnosis_type : x.treatment_type,
          patient_name: name2(p),
          patient_file_no: p.file_number,
          submitted_at: x.submitted_at,
          grade: g.grade,
          feedback_note: g.feedback_note,
          graded_at: g.graded_at,
        } : null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null)
      .sort((a, b) => b.graded_at.localeCompare(a.graded_at));
    const graded = new Set(db.tables.Student_Grades.map(g => `${g.submission_type}|${g.submission_id}`));
    let ungraded = 0;
    for (const type of ['Diagnosis', 'Treatment'] as SubmissionType[]) {
      ungraded += db.tables[table(type)].filter(x =>
        x.authored_by_student === user.academicId && x.status === 'Approved' && !x.deleted_at &&
        !graded.has(`${type}|${x[idCol(type)]}`)).length;
    }
    return ok({ grades, ungradedApprovedCount: ungraded });
  });

  r.post('/academic/grades', ['Doctor'], ({ user, body, db }) => {
    if (body?.submissionType !== 'Diagnosis' && body?.submissionType !== 'Treatment') {
      return badRequest(`Invalid enum value. Expected 'Diagnosis' | 'Treatment', received '${body?.submissionType}'`);
    }
    for (const f of ['submissionId', 'studentId']) {
      if (!Number.isInteger(body[f]) || body[f] <= 0) return badRequest(`${f} must be a positive integer`);
    }
    if (!Number.isInteger(body.grade) || body.grade < 0 || body.grade > 10) return badRequest('grade must be an integer between 0 and 10');
    if (body.feedbackNote !== undefined && (typeof body.feedbackNote !== 'string' || body.feedbackNote.length > 500)) {
      return badRequest('String must contain at most 500 character(s)');
    }
    if (!user.employeeId) return badRequest('Employee ID required');
    if (db.tables.Student_Grades.some(g => g.submission_type === body.submissionType && g.submission_id === body.submissionId)) {
      return conflict('This submission has already been graded');
    }
    if (supervisorOf(db, body.submissionType, body.submissionId) !== user.employeeId) {
      return forbidden('You are not the supervising doctor for this student');
    }
    const g = db.insert('Student_Grades', {
      submission_type: body.submissionType,
      submission_id: body.submissionId,
      student_id: body.studentId,
      graded_by: user.employeeId,
      grade: body.grade,
      feedback_note: body.feedbackNote ?? null,
    });
    return created({ ...g }, 'Grade submitted');
  });

  r.get('/academic/grades/summary', ['Doctor'], ({ user, db }) => {
    if (!user.employeeId) return badRequest('Employee ID required');
    const students = db.tables.Student
      .filter(s => s.employee_id === user.employeeId)
      .map(s => {
        const subs = approvedWithGrades(db, s.academic_id);
        const gradedRows = subs.filter(x => x.grade !== null);
        const avg = gradedRows.length ? Math.round((gradedRows.reduce((sum, x) => sum + x.grade!, 0) / gradedRows.length) * 10) / 10 : null;
        const last = gradedRows.map(x => x.graded_at!).sort().pop() ?? null;
        return {
          student_id: s.academic_id,
          student_name: name2(s),
          student_level: s.academic_level,
          total_count: subs.length,
          graded_count: gradedRows.length,
          avg_grade: avg,
          last_graded_at: last,
          first: s.first_name,
          lastName: s.last_name,
        };
      })
      .filter(x => x.total_count > 0)
      .sort((a, b) => a.first.localeCompare(b.first) || a.lastName.localeCompare(b.lastName))
      .map(({ first: _f, lastName: _l, ...rest }) => rest);
    return ok({ students, total: students.length });
  });

  r.get('/academic/grades/student/:studentId', ['Doctor'], ({ user, params, db }) => {
    if (!user.employeeId) return badRequest('Employee ID required');
    const studentId = parseInt(params['studentId'], 10);
    if (isNaN(studentId) || studentId <= 0) return badRequest('Invalid student ID');
    const s = db.tables.Student.find(x => x.academic_id === studentId && x.employee_id === user.employeeId);
    const records = !s ? [] : approvedWithGrades(db, studentId)
      .map(x => {
        const p = patientOf(db, x.row)!;
        const g = x.gradeRow;
        return {
          submission_id: x.id,
          submission_type: x.type,
          student_id: s.academic_id,
          student_name: name2(s),
          procedure_label: x.type === 'Diagnosis' ? x.row.diagnosis_type : x.row.treatment_type,
          patient_name: name2(p),
          patient_file_no: p.file_number,
          submitted_at: x.row.submitted_at,
          status: x.row.status,
          grade: g?.grade ?? null,
          feedback_note: g?.feedback_note ?? null,
          graded_at: g?.graded_at ?? null,
        };
      })
      .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
    return ok({ records, total: records.length });
  });

  r.get('/academic/file-access/:patientId', ['Student'], ({ user, params, db }) => {
    const patientId = parseInt(params['patientId'], 10);
    if (isNaN(patientId) || patientId <= 0) return badRequest('Invalid patient ID');
    return ok(fileAccess(db, user.userId, patientId));
  });

  r.post('/academic/assignments', ['Student'], ({ user, body, db }) => {
    const patientId = parseInt(body?.patientId, 10);
    if (isNaN(patientId) || patientId <= 0) return badRequest('Invalid patient ID');
    const existing = db.tables.Student_Assignments.find(x => x.student_id === user.userId && x.patient_id === patientId);
    if (existing) return ok(assignmentRow(existing), 'Assignment already exists');
    const a = db.insert('Student_Assignments', {
      student_id: user.userId,
      patient_id: patientId,
      assigned_at: now(),
      write_access_expires_at: new Date(Date.now() + WRITE_ACCESS_MS).toISOString(),
      access_type: 'write',
      is_expired: false,
    });
    return created(assignmentRow(a), 'Assignment created');
  });

  r.get('/academic/assignments', ['Student'], ({ user, db }) => {
    const items = db.tables.Student_Assignments
      .filter(a => a.student_id === user.userId)
      .map(a => ({ a, p: patientById(db, a.patient_id) }))
      .filter(({ p }) => p)
      .sort((x, y) => y.a.assigned_at.localeCompare(x.a.assigned_at))
      .map(({ a, p }) => ({
        assignment_id: a.assignment_id,
        patient_id: a.patient_id,
        assigned_at: a.assigned_at,
        write_access_expires_at: a.write_access_expires_at,
        access_type: a.access_type,
        is_expired: !!a.is_expired,
        patient_name: `${p!.first_name} ${p!.middle_name ? p!.middle_name + ' ' : ''}${p!.last_name}`,
        patient_file_no: p!.file_number,
      }));
    return ok({ items, total: items.length });
  });
}

/** Approved student submissions with their grade (if any), both kinds. */
function approvedWithGrades(db: DemoDb, academicId: number) {
  const out: { type: SubmissionType; id: number; row: Row; grade: number | null; graded_at: string | null; gradeRow: Row | undefined }[] = [];
  for (const type of ['Diagnosis', 'Treatment'] as SubmissionType[]) {
    for (const x of db.tables[table(type)]) {
      if (x.authored_by_student !== academicId || x.deleted_at || x.status !== 'Approved' || !patientOf(db, x)) continue;
      const g = db.tables.Student_Grades.find(sg => sg.submission_type === type && sg.submission_id === x[idCol(type)]);
      out.push({ type, id: x[idCol(type)], row: x, grade: g?.grade ?? null, graded_at: g?.graded_at ?? null, gradeRow: g });
    }
  }
  return out;
}

/** reviewSubmissionService(): approve, request a revision or reject. */
function review(db: DemoDb, doctorId: number | undefined, params: Record<string, string>, body: any): DemoResponse {
  if (!doctorId) return badRequest('Employee ID required');
  const type = parseType(params['type']);
  if (!type) return badRequest('type must be Diagnosis or Treatment');
  const id = parseInt(params['id'], 10);
  if (isNaN(id) || id <= 0) return badRequest('Invalid ID');
  const x = submission(db, type, id);
  if (!x) return notFound('Submission not found');
  if (supervisorOf(db, type, id) !== doctorId) return forbidden('You are not the supervising doctor for this student');
  if (!['Submitted', 'Revision_Requested'].includes(x.status)) return conflict('This submission has already been decided');

  const feedback: string | undefined = body.feedback;
  const apply = (status: string, fb: string | null, incrementRevision: boolean) => {
    x.status = status;
    if (type === 'Diagnosis') x.reviewed_by = doctorId;
    else x.approved_by_doctor = doctorId;
    x.reviewed_at = now();
    x.doctor_feedback = fb;
    if (incrementRevision) x.revision_count += 1;
    db.save();
  };
  const logHistory = (round: number, action: string, fb: string | null) =>
    db.insert('Review_History', { submission_type: type, submission_id: id, round_number: round, reviewed_by: doctorId, action, feedback: fb });

  if (body.action === 'request_revision') {
    if (!feedback?.trim()) return badRequest('Feedback is required when requesting revision');
    if (x.revision_count >= MAX_REVISION_ROUNDS) {
      return unprocessable(`Maximum revision rounds (${MAX_REVISION_ROUNDS}) reached. Approve or reject this submission.`);
    }
    const round = x.revision_count + 1;
    apply('Revision_Requested', feedback, true);
    logHistory(round, 'Revision_Requested', feedback);
    notifyStudent(db, x.authored_by_student, id, type, 'revision');
  } else if (body.action === 'approve') {
    apply('Approved', feedback ?? null, false);
    logHistory(x.revision_count, 'Approved', feedback ?? null);
    notifyStudent(db, x.authored_by_student, id, type, 'approved');
  } else {
    if (!feedback?.trim()) return badRequest('Feedback is required when rejecting a submission');
    apply('Rejected', feedback, false);
    logHistory(x.revision_count, 'Rejected', feedback);
    notifyStudent(db, x.authored_by_student, id, type, 'rejected');
  }
  return ok(null, 'Review submitted');
}

