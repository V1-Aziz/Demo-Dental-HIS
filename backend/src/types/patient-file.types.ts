export enum PatientFileRole {
  Admin           = 'Admin',
  Doctor          = 'Doctor',
  Student         = 'Student',
  DentalAssistant = 'DentalAssistant',
  Radiologist     = 'Radiologist',
}

export interface AuthorshipInfo {
  author_name:      string;
  author_role:      'Student' | 'Doctor';
  author_level?:    number;
  reviewer_name?:   string;
  supervisor_name?: string;
}

export interface DiagnosisEntry {
  diagnosis_id:          number;
  diagnosis_type:        string;
  tooth_number?:         string;
  clinical_findings:     string;
  radiographic_findings: string;
  progress_note:         string;
  status:                'Submitted' | 'Approved' | 'Rejected' | 'Revision_Requested';
  doctor_feedback:       string | null;
  submitted_at:          string;
  revision_count:        number;
  authorship:            AuthorshipInfo;
}

export interface TreatmentEntry {
  treatment_id:    number;
  treatment_type:  string;
  tooth_number?:   string;
  treatment_note:  string;
  status:          'Submitted' | 'Approved' | 'Rejected' | 'Revision_Requested';
  doctor_feedback: string | null;
  submitted_at:    string;
  revision_count:  number;
  authorship:      AuthorshipInfo;
}

export interface ScreeningEntry {
  image_id:     number;
  image_path:   string;
  image_type:   string;
  uploaded_at:  string;
  authorship:   AuthorshipInfo;
}

export interface DentalChartEntry {
  note_id:      number;
  tooth_number: string;
  tooth_note:   string;
  created_at:   string;
  authorship:   AuthorshipInfo;
}

export interface VisitEntryCount {
  diagnoses:    number;
  treatments:   number;
  screenings:   number;
  lab_requests: number;
  dental_notes: number;
}

export interface VisitTimelineEntry {
  appointment_id:   number;
  appointment_date: string;
  appointment_time: string;
  appointment_type: string;
  status:           string;
  attending_doctor: string | null;
  clinic_name:      string;
  one_line_summary: string;
  entry_counts:     VisitEntryCount;
  total_count:      number;
  is_today:         boolean;
  is_read_only:     boolean;
}

export interface VisitTimelineGrouped {
  year:   number;
  count:  number;
  months: Array<{
    month:  number;
    name:   string;
    count:  number;
    visits: VisitTimelineEntry[];
  }>;
}

export interface PatientVisitTimeline {
  total_visits:   number;
  today_visit_id: number | null;
  grouped:        VisitTimelineGrouped[];
}

export interface VisitContent {
  appointment_id:     number;
  appointment_date:   string;
  appointment_time:   string;
  appointment_type:   string;
  attending_doctor:   string | null;
  clinic_name:        string;
  diagnoses:          DiagnosisEntry[];
  treatments:         TreatmentEntry[];
  screenings:         ScreeningEntry[];
  dental_chart_notes: DentalChartEntry[];
}

export interface ActiveAppointmentInfo {
  appointment_id:              number | null;
  appointment_time:            string | null;
  appointment_type:            string | null;
  patient_is_assigned_to_user: boolean;
}

export interface TodaysAppointment {
  appointment_id:   number;
  appointment_time: string;  // HH:MM
  appointment_type: string;
  doctor_name:      string;
  clinic_name:      string;
  status:           'Scheduled' | 'In Progress';
}

export interface TodaysAppointmentsResponse {
  appointments:                TodaysAppointment[];
  patient_is_assigned_to_user: boolean;
}

export interface ToothHistoryEntry {
  note_id:     number;
  recorded_at: string;
  visit_date:  string | null;
  state?:      string;
  note:        string;
  authored_by: string;
}

export interface LabRequestDetail {
  lab_request_id:  number;
  request_note:    string;
  request_status:  string;
  request_date:    string;
  patient_name:    string;
  submitter_name:  string;
  submitter_role:  string;
  approver_name:   string | null;
  lab_specialist:  string | null;
  response_note:   string | null;
  response_date:   string | null;
  appointment_id:  number | null;
}
