// Business logic for lab requests and lab responses.
import {
  getLabRequests,
  getLabRequestById,
  createLabRequest,
  updateLabRequestStatus,
  reviewLabRequest,
  createLabResponse,
  claimLabRequest,
  LabFilters,
  CreateLabRequestInput,
} from '../repositories/lab.repository';
import {
  getLabRequestDispatchInfo,
  getUserIdByEmployeeId,
  getUserIdByAcademicId,
} from '../repositories/notification.repository';
import { dispatch, dispatchToRole, dispatchToUsers } from './notification.service';
import { buildLinkTo } from './notifications.links';

export async function listLabRequestsService(
  filters: LabFilters,
  limit: number,
  offset: number,
) {
  return getLabRequests(filters, limit, offset);
}

export async function getLabRequestByIdService(id: number, studentId: number | null) {
  return getLabRequestById(id, studentId);
}

export async function createLabRequestService(data: CreateLabRequestInput) {
  const result = await createLabRequest(data);

  // Notify all Lab Technicians that a new request has been created.
  try {
    await dispatchToRole('LabTechnician', {
      type:              'lab.request.created',
      title:             'New lab request submitted',
      message:           'A new lab request requires your attention.',
      linkTo:            buildLinkTo('lab.request.created', result.lab_request_id, 'LabTechnician'),
      relatedEntityType: 'Lab_Requests',
      relatedEntityId:   result.lab_request_id,
    });
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'lab.request.created', err });
  }

  return result;
}

export async function claimLabRequestService(id: number, employeeId: number): Promise<boolean> {
  const claimed = await claimLabRequest(id, employeeId);
  if (!claimed) return false;

  try {
    const info = await getLabRequestDispatchInfo(id);
    if (info) {
      const requesterUserId = info.student_id
        ? await getUserIdByAcademicId(info.student_id)
        : await getUserIdByEmployeeId(info.employee_id);

      if (requesterUserId) {
        const requesterRole = info.student_id ? 'Student' : 'Doctor';
        await dispatch({
          userId:            requesterUserId,
          type:              'lab.request.in_progress',
          title:             'Lab request in progress',
          message:           'A lab specialist has picked up your request and is now working on it.',
          linkTo:            buildLinkTo('lab.request.approved', id, requesterRole),
          relatedEntityType: 'Lab_Requests',
          relatedEntityId:   id,
        });
      }
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'lab.request.claimed', id, err });
  }

  return true;
}

export async function updateLabRequestStatusService(id: number, status: string, employeeId: number): Promise<boolean> {
  const updated = await updateLabRequestStatus(id, status, employeeId);

  try {
    const info = await getLabRequestDispatchInfo(id);
    if (!info) return updated;

    // Resolve the requesting user's user_id (student or employee).
    const requesterUserId = info.student_id
      ? await getUserIdByAcademicId(info.student_id)
      : await getUserIdByEmployeeId(info.employee_id);

    if (status === 'Approved') {
      // Notify the requester
      if (requesterUserId) {
        const requesterRole = info.student_id ? 'Student' : 'Doctor';
        await dispatch({
          userId:            requesterUserId,
          type:              'lab.request.approved',
          title:             'Lab request approved',
          message:           'Your lab request has been approved.',
          linkTo:            buildLinkTo('lab.request.approved', id, requesterRole),
          relatedEntityType: 'Lab_Requests',
          relatedEntityId:   id,
        });
      }
      // Notify all Lab Technicians
      await dispatchToRole('LabTechnician', {
        type:              'lab.request.approved',
        title:             'Lab request approved',
        message:           'A lab request has been approved and is ready for processing.',
        linkTo:            buildLinkTo('lab.request.approved', id, 'LabTechnician'),
        relatedEntityType: 'Lab_Requests',
        relatedEntityId:   id,
      });
    } else if (status === 'Rejected') {
      if (requesterUserId) {
        const requesterRole = info.student_id ? 'Student' : 'Doctor';
        await dispatch({
          userId:            requesterUserId,
          type:              'lab.request.rejected',
          title:             'Lab request rejected',
          message:           'Your lab request has been rejected.',
          linkTo:            buildLinkTo('lab.request.rejected', id, requesterRole),
          relatedEntityType: 'Lab_Requests',
          relatedEntityId:   id,
        });
      }
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'lab.request.status', id, status, err });
  }
  return updated;
}

// Doctor supervisor approves or rejects a student-submitted lab request.
// Dispatches a notification to the student after the review.
export async function reviewLabRequestService(
  id:                 number,
  doctorEmployeeId:   number,
  status:             'Approved' | 'Rejected',
  supervisorFeedback: string | null,
): Promise<boolean> {
  const updated = await reviewLabRequest(id, status, supervisorFeedback, doctorEmployeeId);
  if (!updated) return false;

  try {
    const info = await getLabRequestDispatchInfo(id);
    if (info?.student_id) {
      const studentUserId = await getUserIdByAcademicId(info.student_id);
      if (studentUserId) {
        await dispatch({
          userId:            studentUserId,
          type:              status === 'Approved' ? 'lab.request.approved' : 'lab.request.rejected',
          title:             status === 'Approved' ? 'Lab request approved' : 'Lab request rejected',
          message:           status === 'Approved'
            ? 'Your lab request has been approved by your supervisor.'
            : `Your lab request was rejected by your supervisor${supervisorFeedback ? ': ' + supervisorFeedback : '.'}`,
          linkTo:            buildLinkTo(
            status === 'Approved' ? 'lab.request.approved' : 'lab.request.rejected',
            id, 'Student',
          ),
          relatedEntityType: 'Lab_Requests',
          relatedEntityId:   id,
        });
      }
    }
    if (status === 'Approved') {
      await dispatchToRole('LabTechnician', {
        type:              'lab.request.approved',
        title:             'Lab request approved',
        message:           'A lab request has been approved and is ready for processing.',
        linkTo:            buildLinkTo('lab.request.approved', id, 'LabTechnician'),
        relatedEntityType: 'Lab_Requests',
        relatedEntityId:   id,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'lab.request.review', id, status, err });
  }

  return true;
}

export async function createLabResponseService(labRequestId: number, responseNote: string) {
  const result = await createLabResponse(labRequestId, responseNote);

  // Notify the original requester that a lab response has been posted.
  try {
    const info = await getLabRequestDispatchInfo(labRequestId);
    if (info) {
      const requesterUserId = info.student_id
        ? await getUserIdByAcademicId(info.student_id)
        : await getUserIdByEmployeeId(info.employee_id);

      if (requesterUserId) {
        const requesterRole = info.student_id ? 'Student' : 'Doctor';
        await dispatch({
          userId:            requesterUserId,
          type:              'lab.response.posted',
          title:             'Lab response ready',
          message:           'The lab has posted a response to your request.',
          linkTo:            buildLinkTo('lab.response.posted', labRequestId, requesterRole),
          relatedEntityType: 'Lab_Requests',
          relatedEntityId:   labRequestId,
        });
      }
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'lab.response.posted', err });
  }

  return result;
}
