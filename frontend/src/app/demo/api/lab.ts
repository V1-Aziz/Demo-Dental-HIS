// /lab — mirrors lab.routes.ts, lab.service.ts and lab.repository.ts.
import { DemoRouter, ok, created, badRequest, forbidden, notFound, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { now } from '../data/time';
import { buildLinkTo, employeeById, like, name2, notifyRole, notifyUsers, patientById, studentById } from '../helpers';

const STATUSES = ['Pending', 'Approved', 'Rejected', 'In Progress', 'Delivered'];

function patientName(p: Row | undefined): string {
  return p ? `${p.first_name} ${p.middle_name ? p.middle_name + ' ' : ''}${p.last_name}` : '—';
}

function requesterUserId(db: DemoDb, lr: Row): number | null {
  return lr.student_id ? studentById(db, lr.student_id)?.user_id ?? null : employeeById(db, lr.employee_id)?.user_id ?? null;
}

function baseRow(db: DemoDb, lr: Row): Row {
  const p = patientById(db, lr.patient_id);
  return {
    lab_request_id: lr.lab_request_id,
    request_timestamp: lr.request_timestamp,
    request_note: lr.request_note,
    tooth_number: lr.tooth_number,
    request_status: lr.request_status,
    supervisor_feedback: lr.supervisor_feedback,
    reviewed_at: lr.reviewed_at,
    assigned_to: lr.assigned_to,
    assigned_at: lr.assigned_at,
    student_academic_id: lr.student_id,
    requester_kind: lr.student_id ? 'student' : 'doctor',
    requester_name: lr.student_id ? name2(studentById(db, lr.student_id)) : name2(employeeById(db, lr.employee_id)),
    patient_name: patientName(p),
    patient_file_no: p?.file_number ?? null,
  };
}

export function registerLab(r: DemoRouter): void {
  r.get('/lab', ['Doctor', 'Student', 'LabTechnician'], ({ user, query, db }) => {
    const { limit, offset, page } = pagination(query);
    const status = query['status'] || undefined;
    const patientId = query['patientId'] ? parseInt(query['patientId'], 10) : undefined;
    const search = query['search'] || undefined;
    const queue = user.role === 'LabTechnician' && user.employeeId &&
      ['incoming', 'my_work', 'history'].includes(query['queue']) ? query['queue'] : undefined;

    const all = db.tables.Lab_Requests.filter(lr => {
      if (!employeeById(db, lr.employee_id)) return false;
      if (queue === 'incoming' && !(lr.assigned_to === null && ['Pending', 'Approved'].includes(lr.request_status))) return false;
      if (queue === 'my_work' && !(lr.assigned_to === user.employeeId && lr.request_status === 'In Progress')) return false;
      if (queue === 'history' && !(lr.assigned_to === user.employeeId && lr.request_status === 'Delivered')) return false;
      if (!queue) {
        if (user.role === 'Doctor' && user.employeeId && lr.employee_id !== user.employeeId) return false;
        if (user.role === 'Student' && user.academicId && lr.student_id !== user.academicId) return false;
      }
      if (patientId && lr.patient_id !== patientId) return false;
      if (status && lr.request_status !== status) return false;
      if (search) {
        const p = patientById(db, lr.patient_id);
        if (!like(lr.lab_request_id, search) && !like(p ? patientName(p) : null, search) && !like(p?.file_number, search)) return false;
      }
      return true;
    }).sort((a, b) => b.request_timestamp.localeCompare(a.request_timestamp));

    return ok({ rows: all.slice(offset, offset + limit).map(lr => baseRow(db, lr)), total: all.length, page, limit });
  });

  r.post('/lab', ['Student', 'Doctor'], ({ user, body, db }) => {
    const errors: string[] = [];
    if (!Number.isInteger(body?.patientId) || body.patientId <= 0) errors.push('patientId is required');
    if (typeof body?.requestNote !== 'string' || !body.requestNote || body.requestNote.length > 500) errors.push('requestNote is required');
    if (errors.length) return badRequest(errors.join(', '));

    let studentId: number | null = null;
    let supervisorId: number;
    if (user.role === 'Doctor') {
      if (!user.employeeId) return badRequest('Doctor employee ID not found in token');
      supervisorId = user.employeeId;
    } else {
      if (!user.academicId) return badRequest('Student academic ID not found in token');
      studentId = user.academicId;
      if (!body.supervisorEmployeeId) return badRequest('Supervisor employee ID is required');
      supervisorId = body.supervisorEmployeeId;
    }
    const lr = db.insert('Lab_Requests', {
      employee_id: supervisorId,
      student_id: studentId,
      patient_id: body.patientId,
      approved_by: supervisorId,
      request_note: body.requestNote,
      tooth_number: body.toothNumber ?? null,
      request_status: 'Pending',
    });
    notifyRole(db, 'LabTechnician', {
      type: 'lab.request.created',
      title: 'New lab request submitted',
      message: 'A new lab request requires your attention.',
      linkTo: buildLinkTo('lab.request.created', lr.lab_request_id, 'LabTechnician'),
      relatedEntityType: 'Lab_Requests',
      relatedEntityId: lr.lab_request_id,
    });
    return created({ lab_request_id: lr.lab_request_id }, 'Lab request created');
  });

  r.get('/lab/:id', ['Doctor', 'Student', 'LabTechnician'], ({ user, params, db }) => {
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid lab request ID');
    const studentId = user.role === 'Student' ? (user.academicId ?? null) : null;
    const lr = db.tables.Lab_Requests.find(x => x.lab_request_id === id && (studentId === null || x.student_id === studentId));
    if (!lr || !employeeById(db, lr.employee_id)) {
      return user.role === 'Student' ? forbidden('Access denied') : notFound('Lab request not found');
    }
    const name = lr.student_id ? name2(studentById(db, lr.student_id)) : name2(employeeById(db, lr.employee_id));
    const response = db.tables.Lab_Response
      .filter(x => x.lab_request_id === id)
      .sort((a, b) => a.lab_response_id - b.lab_response_id)[0];
    return ok({
      ...baseRow(db, lr),
      submitted_by_role: lr.student_id ? 'Student' : 'Doctor',
      submitted_by_name: name,
      approved_by_name: ['Approved', 'In Progress', 'Delivered'].includes(lr.request_status)
        ? name2(employeeById(db, lr.approved_by)) : null,
      lab_response_note: response?.response_note ?? null,
    });
  });

  r.patch('/lab/:id/claim', ['LabTechnician'], ({ user, params, db }) => {
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid lab request ID');
    if (!user.employeeId) return badRequest('Employee ID not found in token');
    const lr = db.tables.Lab_Requests.find(x =>
      x.lab_request_id === id && x.assigned_to === null && ['Pending', 'Approved'].includes(x.request_status));
    if (!lr) return notFound('Lab request not found, already claimed, or not in a claimable state');
    lr.assigned_to = user.employeeId;
    lr.assigned_at = now();
    lr.request_status = 'In Progress';
    db.save();
    notifyUsers(db, [requesterUserId(db, lr)], {
      type: 'lab.request.in_progress',
      title: 'Lab request in progress',
      message: 'A lab specialist has picked up your request and is now working on it.',
      linkTo: buildLinkTo('lab.request.approved', id, lr.student_id ? 'Student' : 'Doctor'),
      relatedEntityType: 'Lab_Requests',
      relatedEntityId: id,
    });
    return ok({ lab_request_id: id, request_status: 'In Progress' }, 'Lab request claimed');
  });

  r.patch('/lab/:id/status', ['LabTechnician'], ({ user, params, body, db }) => {
    if (!STATUSES.includes(body?.status)) {
      return badRequest(`Invalid enum value. Expected ${STATUSES.map(s => `'${s}'`).join(' | ')}, received '${body?.status}'`);
    }
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid lab request ID');
    if (!user.employeeId) return badRequest('Employee ID not found in token');
    const lr = db.tables.Lab_Requests.find(x =>
      x.lab_request_id === id && (x.assigned_to === user.employeeId || x.assigned_to === null));
    if (!lr) return notFound('Lab request not found or not assigned to you');
    if (lr.assigned_to === null) lr.assigned_at = now();
    lr.assigned_to = lr.assigned_to ?? user.employeeId;
    lr.request_status = body.status;
    db.save();

    const requester = requesterUserId(db, lr);
    const role = lr.student_id ? 'Student' : 'Doctor';
    if (body.status === 'Approved') {
      notifyUsers(db, [requester], {
        type: 'lab.request.approved', title: 'Lab request approved', message: 'Your lab request has been approved.',
        linkTo: buildLinkTo('lab.request.approved', id, role), relatedEntityType: 'Lab_Requests', relatedEntityId: id,
      });
      notifyRole(db, 'LabTechnician', {
        type: 'lab.request.approved', title: 'Lab request approved',
        message: 'A lab request has been approved and is ready for processing.',
        linkTo: buildLinkTo('lab.request.approved', id, 'LabTechnician'), relatedEntityType: 'Lab_Requests', relatedEntityId: id,
      });
    } else if (body.status === 'Rejected') {
      notifyUsers(db, [requester], {
        type: 'lab.request.rejected', title: 'Lab request rejected', message: 'Your lab request has been rejected.',
        linkTo: buildLinkTo('lab.request.rejected', id, role), relatedEntityType: 'Lab_Requests', relatedEntityId: id,
      });
    }
    return ok({ lab_request_id: id, request_status: body.status });
  });

  r.patch('/lab/:id/review', ['Doctor'], ({ user, params, body, db }) => {
    if (body?.status !== 'Approved' && body?.status !== 'Rejected') {
      return badRequest(`Invalid enum value. Expected 'Approved' | 'Rejected', received '${body?.status}'`);
    }
    if (body.supervisorFeedback !== undefined && (typeof body.supervisorFeedback !== 'string' || body.supervisorFeedback.length > 500)) {
      return badRequest('String must contain at most 500 character(s)');
    }
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid lab request ID');
    if (!user.employeeId) return badRequest('Doctor employee ID not found in token');
    const lr = db.tables.Lab_Requests.find(x =>
      x.lab_request_id === id && x.employee_id === user.employeeId && x.student_id !== null && x.request_status === 'Pending');
    if (!lr) return notFound('Lab request not found or is not eligible for review');
    const feedback = body.supervisorFeedback?.trim() ?? null;
    lr.request_status = body.status;
    lr.supervisor_feedback = feedback;
    lr.reviewed_at = now();
    db.save();

    const approved = body.status === 'Approved';
    notifyUsers(db, [studentById(db, lr.student_id)?.user_id], {
      type: approved ? 'lab.request.approved' : 'lab.request.rejected',
      title: approved ? 'Lab request approved' : 'Lab request rejected',
      message: approved
        ? 'Your lab request has been approved by your supervisor.'
        : `Your lab request was rejected by your supervisor${feedback ? ': ' + feedback : '.'}`,
      linkTo: buildLinkTo(approved ? 'lab.request.approved' : 'lab.request.rejected', id, 'Student'),
      relatedEntityType: 'Lab_Requests',
      relatedEntityId: id,
    });
    if (approved) {
      notifyRole(db, 'LabTechnician', {
        type: 'lab.request.approved', title: 'Lab request approved',
        message: 'A lab request has been approved and is ready for processing.',
        linkTo: buildLinkTo('lab.request.approved', id, 'LabTechnician'), relatedEntityType: 'Lab_Requests', relatedEntityId: id,
      });
    }
    return ok({ lab_request_id: id, request_status: body.status }, `Lab request ${body.status.toLowerCase()}`);
  });

  r.post('/lab/:id/response', ['LabTechnician'], ({ params, body, db }) => {
    if (typeof body?.responseNote !== 'string' || !body.responseNote || body.responseNote.length > 500) {
      return badRequest('responseNote is required');
    }
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid lab request ID');
    if (!body.responseNote.trim()) return badRequest('responseNote is required');
    const lr = db.tables.Lab_Requests.find(x => x.lab_request_id === id);
    if (!lr) return { status: 500, body: { success: false, error: 'Lab request not found' } };
    const resp = db.insert('Lab_Response', { lab_request_id: id, response_note: body.responseNote.trim() });
    notifyUsers(db, [requesterUserId(db, lr)], {
      type: 'lab.response.posted',
      title: 'Lab response ready',
      message: 'The lab has posted a response to your request.',
      linkTo: buildLinkTo('lab.response.posted', id, lr.student_id ? 'Student' : 'Doctor'),
      relatedEntityType: 'Lab_Requests',
      relatedEntityId: id,
    });
    return created({ lab_response_id: resp.lab_response_id }, 'Lab response saved');
  });
}
