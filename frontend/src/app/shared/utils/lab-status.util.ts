// Shared status-derivation logic for lab requests.
// Both the list table and the details modal use these helpers so the display
// is consistent and enum-driven — no raw string comparisons in templates.
import { LabRequestStatus } from '../enums/lab-request-status.enum';

export type SupervisorLabel = 'Pending' | 'Approved' | 'Rejected';
export type LabLabel = 'Not started' | 'Approved' | 'In progress' | 'Delivered';

export interface SupervisorStatusInfo {
  label:      SupervisorLabel;
  isApproved: boolean;
  isRejected: boolean;
  isPending:  boolean;
}

export interface LabStatusInfo {
  label: LabLabel;
}

/**
 * Derive the supervisor-track status from the raw request_status value.
 * In Progress and Delivered carry an implicit "supervisor already Approved".
 */
export function getSupervisorStatus(status: LabRequestStatus): SupervisorStatusInfo {
  const isApproved =
    status === LabRequestStatus.Approved ||
    status === LabRequestStatus.InProgress ||
    status === LabRequestStatus.Delivered;
  const isRejected = status === LabRequestStatus.Rejected;
  const isPending  = !isApproved && !isRejected;
  const label: SupervisorLabel = isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending';
  return { label, isApproved, isRejected, isPending };
}

/**
 * Derive the lab-specialist-track status.
 * "Not started" while supervisor hasn't approved; then mirrors the status value.
 */
export function getLabSpecialistStatus(status: LabRequestStatus): LabStatusInfo {
  switch (status) {
    case LabRequestStatus.InProgress: return { label: 'In progress' };
    case LabRequestStatus.Delivered:  return { label: 'Delivered' };
    case LabRequestStatus.Approved:   return { label: 'Approved' };
    default:                          return { label: 'Not started' };
  }
}

/** Tailwind badge classes keyed to supervisor labels. */
export function supervisorBadgeClass(label: SupervisorLabel): string {
  switch (label) {
    case 'Approved': return 'bg-green-100 text-green-700 border-green-200';
    case 'Rejected': return 'bg-red-100 text-red-700 border-red-200';
    default:         return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

/** Tailwind badge classes keyed to lab-specialist labels. */
export function labBadgeClass(label: LabLabel): string {
  switch (label) {
    case 'In progress': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Delivered':   return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Approved':    return 'bg-sky-100 text-sky-700 border-sky-200';
    default:            return 'bg-slate-100 text-slate-500 border-slate-200';
  }
}

/** Material icon name for supervisor labels. */
export function supervisorStatusIcon(label: SupervisorLabel): string {
  switch (label) {
    case 'Approved': return 'check_circle';
    case 'Rejected': return 'cancel';
    default:         return 'schedule';
  }
}

/** Material icon name for lab-specialist labels. */
export function labStatusIcon(label: LabLabel): string {
  switch (label) {
    case 'In progress': return 'autorenew';
    case 'Delivered':   return 'check_circle';
    case 'Approved':    return 'science';
    default:            return 'hourglass_empty';
  }
}
