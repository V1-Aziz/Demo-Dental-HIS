import { ScreeningImageType } from '../enums/screening-image-type.enum';
import { ScreeningRequestStatus } from '../enums/screening-request-status.enum';

// Screening row as returned by the API. `image_path` is an internal detail and
// never exposed to the client — clients always fetch through the authenticated
// `image_url` that the server resolves after RBAC checks.
export interface Screening {
  image_id:          number;
  record_id:         number;
  image_url:         string;           // authenticated URL: `/screening/file/:imageId`
  image_type:        ScreeningImageType;
  tooth_numbers:     string | null;
  notes:             string | null;
  uploaded_by:       number | null;    // user_id; NULL for legacy rows
  uploaded_by_name:  string;
  uploaded_by_role:  string;
  uploaded_at:       string;           // ISO timestamp
  deleted_at:        string | null;
  can_delete:        boolean;          // server-computed permission hint
  appointment_id?:   number | null;    // set by radiologist workflow
}

// Per-file metadata paired with each upload.
export interface ScreeningUploadMeta {
  image_type:     ScreeningImageType;
  tooth_numbers?: string;             // FDI notation, comma-separated (e.g. "15" or "14,15,16,17")
  notes?:         string;
}

export interface ScreeningListResponse {
  record_id:  number;
  patient_id: number;
  screenings: Screening[];
}

// Mirrors the Screening_Requests table.
export interface ScreeningRequest {
  request_id:              number;
  record_id:               number;
  patient_id:              number;
  appointment_id:          number | null;
  requested_by_user_id:    number;
  assigned_radiologist_id: number;  // Employee.employee_id
  request_status:          ScreeningRequestStatus;
  requested_at:            string;  // ISO timestamp
  completed_at:            string | null;
  fulfilled_image_id:      number | null;
}

// Dashboard payload returned by GET /radiologist/dashboard.
export interface RadiologistDashboardSummary {
  cards: {
    patientsNeedingScreeningToday: number;
    screeningsUploadedToday:       number;
    patientsScheduledToday:        number;
  };
  topPending: Array<{
    request_id:              number;
    patient_id:              number;
    patient_full_name:       string;
    appointment_start_time:  string;
    appointment_status:      string;
    doctor_full_name:        string;
    requested_at:            string;
  }>;
}

// Minimal patient row returned by radiologist endpoints (no DOB).
export interface RadiologistPatientRow {
  patient_id:  number;
  first_name:  string;
  last_name:   string;
  gender:      string;
  age:         number;
  file_number: string | null;
}

// Today's appointment for a patient — used in the radiologist upload modal.
export interface RadiologistAppointmentDto {
  appointment_id:         number;
  appointment_start_time: string;  // ISO timestamp
  appointment_time:       string;  // HH:MM
  doctor_name:            string;
  clinic_name:            string;
  status:                 string;
}
