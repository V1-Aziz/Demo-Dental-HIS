import { ReviewStatus, SubmissionType, ReviewHistoryAction } from '../enums/academic.enum';

export interface Student {
  academicId:    number;
  userId:        number;
  employeeId:    number;
  firstName:     string;
  middleName:    string;
  lastName:      string;
  academicLevel: number;
}

export interface ReviewQueueItem {
  submission_id:     number;
  submission_type:   SubmissionType;
  student_id:        number;
  student_name:      string;
  student_level:     number;
  patient_id:        number;
  patient_name:      string;
  patient_file_no:   number;
  has_medical_alert: boolean;
  procedure_label:   string;
  status:            ReviewStatus;
  submitted_at:      string;
  revision_count:    number;
  is_stale:          boolean;
}

export interface ReviewQueueStats {
  pending_count:             number;
  revision_requested_count:  number;
  approved_today_count:      number;
  rejected_today_count:      number;
}

export interface ReviewHistoryEntry {
  round_number:  number;
  action:        ReviewHistoryAction;
  feedback:      string | null;
  reviewer_name: string;
  created_at:    string;
}

export interface ReviewSubmissionDetail extends ReviewQueueItem {
  clinical_findings?:     string;
  radiographic_findings?: string;
  progress_note?:         string;
  treatment_note?:        string;
  chronic_conditions?:    string;
  history:                ReviewHistoryEntry[];
}

export interface ReviewActionRequest {
  action:    'approve' | 'request_revision' | 'reject';
  feedback?: string;
}

export interface ResubmitRequest {
  diagnosis_type?:        string;
  clinical_findings?:     string;
  radiographic_findings?: string;
  progress_note?:         string;
  treatment_type?:        string;
  treatment_note?:        string;
}
