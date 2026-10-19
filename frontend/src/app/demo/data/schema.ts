// Table definitions for the in-browser demo database. They mirror
// backend/database/schema.sql: same table and column names, so the demo
// API can return exactly what the real API returns.
import { now, dateOnly } from './time';

// Rows are plain objects keyed by column name.
export type Row = any;
export type ColumnType = 'number' | 'string' | 'bit' | 'date' | 'time' | 'datetime';

export interface TableDef {
  identity: string | null;
  columns: Record<string, ColumnType>;
  defaults: Record<string, () => unknown>;
}

export const SCHEMA = {
  Roles: {
    identity: 'role_id',
    columns: { role_id: 'number', role_name: 'string', role_description: 'string' },
    defaults: {  },
  },
  Users: {
    identity: 'user_id',
    columns: { user_id: 'number', role_id: 'number', email: 'string', password: 'string', created_at: 'datetime', last_login: 'datetime', account_status: 'string' },
    defaults: { created_at: () => now() },
  },
  User_Sessions: {
    identity: 'session_id',
    columns: { session_id: 'number', user_id: 'number', refresh_token_hash: 'string', last_activity_at: 'datetime', expires_at: 'datetime', ip_address: 'string', user_agent: 'string', revoked_at: 'datetime', created_at: 'datetime' },
    defaults: { last_activity_at: () => now(), created_at: () => now() },
  },
  Employee: {
    identity: 'employee_id',
    columns: { employee_id: 'number', user_id: 'number', first_name: 'string', middle_name: 'string', last_name: 'string', specialization: 'string', hire_date: 'date', termination_date: 'date', deleted_at: 'datetime' },
    defaults: {  },
  },
  Manager: {
    identity: 'manager_id',
    columns: { manager_id: 'number', employee_id: 'number', start_date: 'date', end_date: 'date' },
    defaults: {  },
  },
  Clinic: {
    identity: 'clinic_id',
    columns: { clinic_id: 'number', manager_id: 'number', clinic_name: 'string' },
    defaults: {  },
  },
  Student: {
    identity: 'academic_id',
    columns: { academic_id: 'number', user_id: 'number', employee_id: 'number', first_name: 'string', middle_name: 'string', last_name: 'string', academic_level: 'number' },
    defaults: {  },
  },
  Sections: {
    identity: 'section_id',
    columns: { section_id: 'number', section_name: 'string', description: 'string', is_active: 'bit' },
    defaults: { is_active: () => true },
  },
  Employee_Section: {
    identity: null,
    columns: { employee_id: 'number', section_id: 'number', is_primary: 'bit' },
    defaults: { is_primary: () => false },
  },
  Doctor_Availability: {
    identity: 'availability_id',
    columns: { availability_id: 'number', doctor_id: 'number', day_of_week: 'number', start_time: 'time', end_time: 'time', is_active: 'bit' },
    defaults: { is_active: () => true },
  },
  Patients: {
    identity: 'patient_id',
    columns: { patient_id: 'number', file_number: 'number', academic_id: 'number', national_id: 'number', first_name: 'string', middle_name: 'string', last_name: 'string', date_of_birth: 'date', gender: 'string', created_at: 'datetime', deleted_at: 'datetime' },
    defaults: { created_at: () => now() },
  },
  Contact_Information: {
    identity: 'contact_id',
    columns: { contact_id: 'number', employee_id: 'number', student_id: 'number', patient_id: 'number', owner_type: 'string', phone_number: 'string', email: 'string', contact_type: 'string' },
    defaults: {  },
  },
  Medical_Records: {
    identity: 'record_id',
    columns: { record_id: 'number', patient_id: 'number', chief_complaint: 'string', chronic_diseases: 'string', pain_score: 'number', allergies: 'string', deleted_at: 'datetime' },
    defaults: {  },
  },
  Appointment_Type: {
    identity: 'type_id',
    columns: { type_id: 'number', type_name: 'string', duration: 'number', section_id: 'number', is_active: 'bit', display_order: 'number' },
    defaults: { is_active: () => true, display_order: () => 0 },
  },
  Appointments: {
    identity: 'appointment_id',
    columns: { appointment_id: 'number', patient_id: 'number', doctor_id: 'number', academic_id: 'number', clinic_id: 'number', record_id: 'number', appointment_type_id: 'number', appointment_start_time: 'datetime', appointment_end_time: 'datetime', status: 'string', booked_by: 'number', arrival_status: 'string', arrived_at: 'datetime', deleted_at: 'datetime' },
    defaults: {  },
  },
  Screening: {
    identity: 'image_id',
    columns: { image_id: 'number', record_id: 'number', image_path: 'string', image_type: 'string', tooth_numbers: 'string', notes: 'string', uploaded_by: 'number', appointment_id: 'number', uploaded_at: 'datetime', deleted_at: 'datetime' },
    defaults: { uploaded_at: () => now() },
  },
  Screening_Requests: {
    identity: 'request_id',
    columns: { request_id: 'number', record_id: 'number', patient_id: 'number', appointment_id: 'number', requested_by_user_id: 'number', assigned_radiologist_id: 'number', request_status: 'string', requested_at: 'datetime', completed_at: 'datetime', fulfilled_image_id: 'number' },
    defaults: { request_status: () => 'Pending', requested_at: () => now() },
  },
  Diagnosis: {
    identity: 'diagnosis_id',
    columns: { diagnosis_id: 'number', record_id: 'number', appointment_id: 'number', authored_by_student: 'number', authored_by_doctor: 'number', reviewed_by: 'number', tooth_number: 'string', diagnosis_type: 'string', clinical_findings: 'string', radiographic_findings: 'string', progress_note: 'string', status: 'string', doctor_feedback: 'string', revision_count: 'number', submitted_at: 'datetime', reviewed_at: 'datetime', created_at: 'datetime', deleted_at: 'datetime' },
    defaults: { status: () => 'Submitted', revision_count: () => 0, submitted_at: () => now(), created_at: () => now() },
  },
  Prescriptions: {
    identity: 'prescription_id',
    columns: { prescription_id: 'number', record_id: 'number', medicine_name: 'string', dosage: 'string', duration: 'string', cost: 'number' },
    defaults: {  },
  },
  Treatment: {
    identity: 'treatment_id',
    columns: { treatment_id: 'number', record_id: 'number', appointment_id: 'number', prescription_id: 'number', authored_by_student: 'number', authored_by_doctor: 'number', approved_by_doctor: 'number', treatment_type: 'string', treatment_note: 'string', doctor_feedback: 'string', status: 'string', revision_count: 'number', submitted_at: 'datetime', reviewed_at: 'datetime', deleted_at: 'datetime' },
    defaults: { status: () => 'Submitted', revision_count: () => 0, submitted_at: () => now() },
  },
  Dental_Chart: {
    identity: 'note_id',
    columns: { note_id: 'number', record_id: 'number', appointment_id: 'number', tooth_number: 'string', tooth_note: 'string', authored_by_student: 'number', authored_by_doctor: 'number', created_at: 'datetime', updated_at: 'datetime' },
    defaults: { created_at: () => now(), updated_at: () => now() },
  },
  Review_History: {
    identity: 'history_id',
    columns: { history_id: 'number', submission_type: 'string', submission_id: 'number', round_number: 'number', reviewed_by: 'number', action: 'string', feedback: 'string', created_at: 'datetime' },
    defaults: { created_at: () => now() },
  },
  Student_Grades: {
    identity: 'grade_id',
    columns: { grade_id: 'number', submission_type: 'string', submission_id: 'number', student_id: 'number', graded_by: 'number', grade: 'number', feedback_note: 'string', graded_at: 'datetime' },
    defaults: { graded_at: () => now() },
  },
  Student_Assignments: {
    identity: 'assignment_id',
    columns: { assignment_id: 'number', student_id: 'number', patient_id: 'number', assigned_at: 'datetime', write_access_expires_at: 'datetime', access_type: 'string', is_expired: 'bit' },
    defaults: { assigned_at: () => now(), access_type: () => 'write', is_expired: () => false },
  },
  Lab_Requests: {
    identity: 'lab_request_id',
    columns: { lab_request_id: 'number', employee_id: 'number', student_id: 'number', patient_id: 'number', appointment_id: 'number', approved_by: 'number', tooth_number: 'string', request_note: 'string', request_status: 'string', request_timestamp: 'datetime', supervisor_feedback: 'string', reviewed_at: 'datetime', assigned_to: 'number', assigned_at: 'datetime' },
    defaults: { request_timestamp: () => now() },
  },
  Lab_Response: {
    identity: 'lab_response_id',
    columns: { lab_response_id: 'number', lab_request_id: 'number', response_note: 'string', created_at: 'datetime' },
    defaults: { created_at: () => now() },
  },
  Inventory_Items: {
    identity: 'item_id',
    columns: { item_id: 'number', item_name: 'string', category: 'string', low_stock_limit: 'number', supplier: 'string', unit_cost: 'number', register_date: 'date', assigned_by: 'number' },
    defaults: { register_date: () => dateOnly(0) },
  },
  Item_Batches: {
    identity: 'batch_id',
    columns: { batch_id: 'number', item_id: 'number', quantity_initial: 'number', quantity_remaining: 'number', expire_date: 'date', deposited_by: 'number', deposited_at: 'datetime', notes: 'string' },
    defaults: { deposited_at: () => now() },
  },
  Stock_Transactions: {
    identity: 'transaction_id',
    columns: { transaction_id: 'number', item_id: 'number', user_id: 'number', transaction_type: 'string', quantity: 'number', notes: 'string', time_stamp: 'datetime' },
    defaults: { time_stamp: () => now() },
  },
  Inventory_Requests: {
    identity: 'request_id',
    columns: { request_id: 'number', item_id: 'number', requested_by: 'number', quantity: 'number', approved_quantity: 'number', status: 'string', notes: 'string', rejection_feedback: 'string', approved_by: 'number', created_at: 'datetime', modified_at: 'datetime', processed_at: 'datetime' },
    defaults: { status: () => 'Pending', created_at: () => now() },
  },
  Removed_Inventory_Items: {
    identity: 'removal_id',
    columns: { removal_id: 'number', item_id: 'number', item_name: 'string', category: 'string', removed_by: 'number', removal_reason: 'string', quantity_removed: 'number', removed_at: 'datetime' },
    defaults: { removed_at: () => now() },
  },
  Ticket_Type: {
    identity: 'ticket_type_id',
    columns: { ticket_type_id: 'number', type_name: 'string', description: 'string', is_active: 'bit', display_order: 'number' },
    defaults: { is_active: () => true, display_order: () => 0 },
  },
  Tickets: {
    identity: 'ticket_id',
    columns: { ticket_id: 'number', user_id: 'number', ticket_type_id: 'number', details: 'string', status: 'string', created_at: 'datetime', updated_at: 'datetime' },
    defaults: { status: () => 'Open', created_at: () => now(), updated_at: () => now() },
  },
  Ticket_Messages: {
    identity: 'message_id',
    columns: { message_id: 'number', ticket_id: 'number', sender_user_id: 'number', message_text: 'string', is_resolution_note: 'bit', created_at: 'datetime' },
    defaults: { is_resolution_note: () => false, created_at: () => now() },
  },
  Notifications: {
    identity: 'notification_id',
    columns: { notification_id: 'number', user_id: 'number', type: 'string', title: 'string', message: 'string', link_to: 'string', related_entity_type: 'string', related_entity_id: 'number', is_read: 'bit', read_at: 'datetime', created_at: 'datetime' },
    defaults: { type: () => 'info', is_read: () => false, created_at: () => now() },
  },
  Audit_Log: {
    identity: 'event_id',
    columns: { event_id: 'number', user_id: 'number', patient_id: 'number', event_type: 'string', event_description: 'string', details: 'string', operation_status: 'string', timestamp: 'datetime' },
    defaults: { timestamp: () => now() },
  },
  Pending_Registrations: {
    identity: 'registration_id',
    columns: { registration_id: 'number', first_name: 'string', middle_name: 'string', last_name: 'string', civil_id: 'string', requested_role_id: 'number', password_hash: 'string', status: 'string', submitted_at: 'datetime', reviewed_by: 'number', reviewed_at: 'datetime', rejection_reason: 'string', created_user_id: 'number', created_employee_id: 'number', created_academic_id: 'number' },
    defaults: { status: () => 'Pending', submitted_at: () => now() },
  },
  Pending_Registration_Contacts: {
    identity: 'pending_contact_id',
    columns: { pending_contact_id: 'number', registration_id: 'number', contact_type: 'string', value: 'string', is_primary: 'bit' },
    defaults: { is_primary: () => false },
  },
  System_Lookups: {
    identity: 'lookup_id',
    columns: { lookup_id: 'number', category_key: 'string', value_label: 'string', display_order: 'number', is_active: 'bit', created_at: 'datetime', created_by: 'number', updated_at: 'datetime', updated_by: 'number' },
    defaults: { display_order: () => 0, is_active: () => true, created_at: () => now(), updated_at: () => now() },
  },
  System_Settings: {
    identity: null,
    columns: { setting_key: 'string', setting_value: 'string', description: 'string', updated_by: 'number', updated_at: 'datetime' },
    defaults: { updated_at: () => now() },
  },
} satisfies Record<string, TableDef>;

export type TableName = keyof typeof SCHEMA;
export type Tables = Record<TableName, Row[]>;
