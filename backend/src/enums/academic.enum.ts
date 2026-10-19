export enum ReviewStatus {
  Submitted         = 'Submitted',
  Approved          = 'Approved',
  Rejected          = 'Rejected',
  RevisionRequested = 'Revision_Requested',
}

export enum SubmissionType {
  Diagnosis = 'Diagnosis',
  Treatment = 'Treatment',
}

export enum ReviewAction {
  Approve         = 'approve',
  RequestRevision = 'request_revision',
  Reject          = 'reject',
}

export enum ReviewHistoryAction {
  Approved          = 'Approved',
  Rejected          = 'Rejected',
  RevisionRequested = 'Revision_Requested',
  Resubmitted       = 'Resubmitted',
}

export const MAX_REVISION_ROUNDS = 3;
