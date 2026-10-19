// Shared TypeScript interfaces for lab request data.
// LabRequestSummary matches the list endpoint row shape (GET /lab).
// LabRequestDetail matches the detail endpoint shape (GET /lab/:id) and is used by the modal.
import { LabRequestStatus } from '../enums/lab-request-status.enum';

export interface LabRequestSummary {
  lab_request_id:      number;
  request_timestamp:   string;
  request_note:        string;
  request_status:      LabRequestStatus;
  requester_name:      string;
  requester_kind:      'student' | 'doctor';
  patient_name:        string;
  patient_file_no:     number | null;
  supervisor_feedback: string | null;
}

export interface LabRequestDetail extends LabRequestSummary {
  submitted_by_name:  string;
  submitted_by_role:  'Student' | 'Doctor';
  approved_by_name:   string | null;
  lab_response_note:  string | null;
}
