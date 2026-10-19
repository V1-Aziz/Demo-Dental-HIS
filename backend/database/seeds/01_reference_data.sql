-- ============================================================
-- Seed 01: reference data
--
-- Lookup rows the application needs in order to work: roles,
-- clinical sections, appointment and ticket types, and the
-- admin-managed dropdown values. Run after schema.sql.
-- ============================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- ── Roles ───────────────────────────────────────────────────
-- role_name values are what the API puts in JWTs and checks in
-- authorize(); they must match backend/src/enums/roles.enum.ts.
SET IDENTITY_INSERT Roles ON;
INSERT INTO Roles (role_id, role_name, role_description) VALUES
(1, 'Admin',            'Full system access: user management, clinics, audit logs, reports, ticket management'),
(2, 'Doctor',           'Patient records, diagnosis, treatment, student oversight, grading, lab requests'),
(3, 'Student',          'Assigned patients, write notes for review, lab requests under supervision'),
(4, 'Receptionist',     'Patient registration, appointment scheduling, editing, and cancellation'),
(5, 'LabTechnician',    'Process lab requests, give feedback, request inventory items'),
(6, 'DentalAssistant',  'View patient files, request inventory items, support tickets'),
(7, 'InventoryManager', 'Manage stock levels, record deposits/withdrawals, approve inventory requests'),
(8, 'Radiologist',      'Uploads screening images for same-day appointments and processes screening requests');
SET IDENTITY_INSERT Roles OFF;

-- ── Clinical sections ───────────────────────────────────────
SET IDENTITY_INSERT Sections ON;
INSERT INTO Sections (section_id, section_name, description) VALUES
(1, 'Restorative',         'Restorative dentistry including fillings, inlays, and onlays'),
(2, 'Orthodontics',        'Orthodontic treatment including braces and clear aligners'),
(3, 'Oral Medicine',       'Diagnosis and non-surgical management of oral diseases'),
(4, 'Periodontics',        'Prevention and treatment of gum and supporting bone diseases'),
(5, 'Endodontics',         'Root canal treatment and periapical surgery'),
(6, 'Oral Surgery',        'Extractions, biopsies, and minor oral surgical procedures'),
(7, 'Prosthodontics',      'Fixed and removable prosthetic restorations'),
(8, 'Pediatric Dentistry', 'Dental care for infants, children, and adolescents');
SET IDENTITY_INSERT Sections OFF;

-- ── Appointment types (duration in minutes) ─────────────────
SET IDENTITY_INSERT Appointment_Type ON;
INSERT INTO Appointment_Type (type_id, type_name, duration, section_id, display_order) VALUES
(1,  'Consultation',           30, 3, 1),
(2,  'Check-up',               20, 3, 2),
(3,  'Cleaning',               45, 4, 3),
(4,  'Filling',                60, 1, 4),
(5,  'Extraction',             45, 6, 5),
(6,  'Root Canal',             90, 5, 6),
(7,  'Crown Placement',        60, 7, 7),
(8,  'Bridge Fitting',         75, 7, 8),
(9,  'Orthodontic Adjustment', 30, 2, 9),
(10, 'Periodontic Treatment',  60, 4, 10),
(11, 'Dental Imaging',         15, 3, 11),
(12, 'Emergency',              30, 6, 12),
(13, 'Follow-up',              20, 1, 13),
(14, 'Pediatric Check-up',     30, 8, 14);
SET IDENTITY_INSERT Appointment_Type OFF;

-- ── Support ticket types ────────────────────────────────────
SET IDENTITY_INSERT Ticket_Type ON;
INSERT INTO Ticket_Type (ticket_type_id, type_name, description, display_order) VALUES
(1, 'Technical Issue',     'System bugs, errors, crashes, or performance problems',             1),
(2, 'Access Request',      'Request for role change, permission update, or account activation', 2),
(3, 'Clinical Assistance', 'Request for help with clinical features or patient records',        3),
(4, 'Data Correction',     'Request to correct or update data that cannot be self-edited',      4),
(5, 'Feature Request',     'Suggestion for a new feature or improvement',                       5),
(6, 'General Inquiry',     'General questions about system usage or procedures',                6);
SET IDENTITY_INSERT Ticket_Type OFF;

-- ── Admin-managed dropdown values ───────────────────────────
INSERT INTO System_Lookups (category_key, value_label, display_order) VALUES
('diagnosis_type', 'Healthy',           1),
('diagnosis_type', 'Cavity',            2),
('diagnosis_type', 'Fracture',          3),
('diagnosis_type', 'Missing',           4),
('diagnosis_type', 'Treated',           5),
('diagnosis_type', 'Periapical lesion', 6),
('diagnosis_type', 'Gingivitis',        7),

('treatment_type', 'Filling',    1),
('treatment_type', 'Extraction', 2),
('treatment_type', 'Crown',      3),
('treatment_type', 'RCT',        4),
('treatment_type', 'Scaling',    5),
('treatment_type', 'Implant',    6),
('treatment_type', 'Review',     7),
('treatment_type', 'Whitening',  8),

('cancellation_reason', 'Patient request',    1),
('cancellation_reason', 'Doctor unavailable', 2),
('cancellation_reason', 'Emergency',          3),
('cancellation_reason', 'No-show',            4),

('doctor_specialty', 'General dentistry',   1),
('doctor_specialty', 'Orthodontics',        2),
('doctor_specialty', 'Periodontics',        3),
('doctor_specialty', 'Endodontics',         4),
('doctor_specialty', 'Prosthodontics',      5),
('doctor_specialty', 'Oral surgery',        6),
('doctor_specialty', 'Pediatric dentistry', 7),

('contact_type', 'Email',      1),
('contact_type', 'Mobile',     2),
('contact_type', 'Work phone', 3),
('contact_type', 'Home phone', 4),

('inventory_category', 'Consumables',   1),
('inventory_category', 'Instruments',   2),
('inventory_category', 'Medications',   3),
('inventory_category', 'Anesthesia',    4),
('inventory_category', 'Restorative',   5),
('inventory_category', 'Endodontic',    6),
('inventory_category', 'Surgical',      7),
('inventory_category', 'Imaging',       8),
('inventory_category', 'Sterilization', 9),

('inventory_unit', 'Box',    1),
('inventory_unit', 'Pack',   2),
('inventory_unit', 'Piece',  3),
('inventory_unit', 'Bottle', 4),
('inventory_unit', 'Tube',   5),
('inventory_unit', 'Roll',   6),

('ticket_priority', 'Low',      1),
('ticket_priority', 'Medium',   2),
('ticket_priority', 'High',     3),
('ticket_priority', 'Critical', 4),

('lab_service_type', 'PFM crown',       1),
('lab_service_type', 'Zirconia crown',  2),
('lab_service_type', 'Veneer',          3),
('lab_service_type', 'Full denture',    4),
('lab_service_type', 'Partial denture', 5),
('lab_service_type', 'Bridge 3-unit',   6),
('lab_service_type', 'Bridge 4-unit',   7),
('lab_service_type', 'Inlay',           8),
('lab_service_type', 'Onlay',           9),
('lab_service_type', 'Night guard',    10),
('lab_service_type', 'Retainer',       11),
('lab_service_type', 'Bleaching tray', 12);

COMMIT TRANSACTION;
GO
