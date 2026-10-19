// Status values for the Screening_Requests table.  Values must match the SQL
// CHK_ScrReq_Status CHECK constraint in backend/database/schema.sql exactly.
export enum ScreeningRequestStatus {
  Pending   = 'Pending',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}
