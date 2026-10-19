// Single source of truth for notification icon and colour across all portals.
// Every portal layout imports these two functions instead of maintaining its own
// local map — adding a new notification type here automatically covers all roles.
// Icon names are Material Symbols Outlined (the icon font used throughout the app).

const ICON_MAP: Record<string, string> = {
  // Academic
  'academic.note.submitted':                 'assignment',
  'academic.note.approved':                  'check_circle',
  'academic.note.rejected':                  'cancel',
  'academic.note.feedback':                  'rate_review',
  'academic.submission.new':                 'assignment',
  'academic.submission.resubmitted':         'assignment_return',
  'academic.submission.approved':            'check_circle',
  'academic.submission.rejected':            'cancel',
  'academic.submission.revision_requested':  'rate_review',

  // Appointments
  'appointment.assigned':        'calendar_month',
  'appointment.cancelled':       'event_busy',
  'appointment.rescheduled':     'event_repeat',
  'appointment.no_show':         'person_off',
  'appointment.checked_in':      'how_to_reg',
  'appointment.patient_arrived': 'directions_walk',

  // Lab
  'lab.request.created':  'science',
  'lab.request.approved': 'check_circle',
  'lab.request.rejected': 'cancel',
  'lab.response.posted':  'biotech',

  // Inventory
  'inventory.low_stock':       'warning',
  'inventory.item_expiring':   'schedule',
  'inventory.request.created': 'inbox',
  'inventory.request.approved':'check_circle',
  'inventory.request.rejected':'cancel',

  // Screening
  'screening.uploaded':            'image',
  'screening.deleted':             'image',
  'screening.request.created':     'scan',
  'screening.request.cancelled':   'cancel',
  'screening.request.fulfilled':   'check_circle',

  // Tickets
  'ticket.created':  'confirmation_number',
  'ticket.reply':    'reply',
  'ticket.resolved': 'task_alt',

  // System
  'system.user.created': 'person_add',
};

export function notifIcon(type: string): string {
  return ICON_MAP[type] ?? 'notifications';
}

export function notifColor(type: string): string {
  if (
    type.endsWith('.approved') ||
    type.endsWith('.resolved') ||
    type.endsWith('.checked_in') ||
    type === 'screening.request.fulfilled' ||
    type === 'lab.request.approved'
  ) return 'text-green-600';

  if (
    type.endsWith('.rejected') ||
    type.endsWith('.cancelled') ||
    type === 'appointment.no_show' ||
    type === 'inventory.item_expiring' ||
    type === 'screening.request.cancelled'
  ) return 'text-red-500';

  if (type.startsWith('appointment'))        return 'text-blue-500';
  if (type.startsWith('lab'))                return 'text-purple-500';
  if (type.startsWith('academic'))           return 'text-indigo-500';
  if (type.startsWith('inventory'))          return 'text-amber-500';
  if (type.startsWith('ticket'))             return 'text-orange-500';
  if (type.startsWith('screening'))          return 'text-sky-500';
  if (type === 'system.user.created')        return 'text-blue-600';
  return 'text-gray-400';
}
