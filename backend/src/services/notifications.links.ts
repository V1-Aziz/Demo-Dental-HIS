// Maps a notification type string + entityId + recipient role to the frontend
// route the user lands on when they click the notification.
export function buildLinkTo(
  type: string,
  entityId: number | null | undefined,
  recipientRole: string,
): string | null {
  const id = entityId ?? 0;

  switch (type) {
    case 'academic.note.submitted':
    case 'academic.submission.new':
    case 'academic.submission.resubmitted':
      return `/doctor/evaluations`;
    case 'academic.note.approved':
    case 'academic.note.rejected':
    case 'academic.note.feedback':
    case 'academic.submission.revision_requested':
    case 'academic.submission.approved':
    case 'academic.submission.rejected':
      return `/student/notes`;

    case 'appointment.assigned':
      return recipientRole === 'Doctor' ? `/doctor/appointments` : `/student/appointments`;
    case 'appointment.cancelled':
    case 'appointment.rescheduled':
      if (recipientRole === 'Doctor')       return `/doctor/appointments`;
      if (recipientRole === 'Student')      return `/student/appointments`;
      if (recipientRole === 'Receptionist') return `/receptionist/appointments`;
      return null;
    case 'appointment.no_show':
      return `/receptionist/appointments`;
    case 'appointment.checked_in':
      return `/doctor/appointments`;
    case 'appointment.patient_arrived':
      if (recipientRole === 'Receptionist') return `/receptionist/scheduling`;
      if (recipientRole === 'Student')      return `/student/appointments`;
      return `/doctor/appointments`;

    case 'lab.request.created':
    case 'lab.request.approved':
      return recipientRole === 'LabTechnician' ? `/lab/requests/${id}` : null;
    case 'lab.request.rejected':
      return null;
    case 'lab.response.posted':
      return recipientRole === 'Doctor'
        ? `/doctor/lab/requests/${id}`
        : `/student/lab/requests/${id}`;

    case 'inventory.low_stock':
      return `/inventory-manager/inventory?filter=low-stock`;
    case 'inventory.item_expiring':
      return `/inventory-manager/inventory?filter=expiring`;
    case 'inventory.request.created':
    case 'inventory.request.approved':
    case 'inventory.request.rejected':
      return `/inventory-manager/requests`;

    case 'screening.uploaded':
    case 'screening.deleted':
      return `/${rolePath(recipientRole)}/patients/${id}`;

    // Screening requests (radiologist workflow)
    case 'screening.request.created':
    case 'screening.request.cancelled':
      // id here is the patient_id — radiologist lands on their patient detail
      return `/radiologist/patients/${id}`;
    case 'screening.request.fulfilled':
      // Original requester (Doctor/Student) — land on their patient file
      return `/${rolePath(recipientRole)}/patients/${id}`;

    case 'ticket.created':
      return `/admin/tickets/${id}`;
    case 'ticket.reply':
    case 'ticket.resolved':
      return recipientRole === 'Admin'
        ? `/admin/tickets/${id}`
        : `/${rolePath(recipientRole)}/tickets/${id}`;

    default:
      return null;
  }
}

function rolePath(role: string): string {
  const map: Record<string, string> = {
    Admin:            'admin',
    Doctor:           'doctor',
    Student:          'student',
    Receptionist:     'receptionist',
    LabTechnician:    'lab',
    DentalAssistant:  'assistant',
    InventoryManager: 'inventory-manager',
    Radiologist:      'radiologist',
  };
  return map[role] ?? 'notifications';
}
