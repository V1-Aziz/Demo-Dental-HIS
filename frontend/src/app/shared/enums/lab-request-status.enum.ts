// Enum values must exactly match the SQL CHECK constraint on Lab_Requests.request_status.
export enum LabRequestStatus {
  Pending    = 'Pending',
  Approved   = 'Approved',
  Rejected   = 'Rejected',
  InProgress = 'In Progress',
  Delivered  = 'Delivered',
}
