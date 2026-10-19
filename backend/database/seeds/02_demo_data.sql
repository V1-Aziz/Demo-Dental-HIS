-- ============================================================
-- Seed 02: demo data
--
-- A small, consistent clinic you can log into right away:
-- one account per role, 12 patients with ~4 months of history,
-- today's schedule, pending reviews, lab work, inventory and
-- support tickets. Every person, ID and phone number is made up.
--
-- All dates are relative to the day the seed runs, so the
-- dashboards always have "today" data. All demo accounts share
-- the password Demo@1234.
-- ============================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- seed_at(day_offset, 'HH:MM'): local wall-clock time on today + day_offset,
-- converted to UTC because the API stores timestamps in UTC. Dropped at the end.
CREATE OR ALTER FUNCTION dbo.seed_at(@day_offset INT, @local_time TIME)
RETURNS DATETIME
AS
BEGIN
    DECLARE @utc_offset_minutes INT =
        CAST(ROUND(DATEDIFF(SECOND, GETDATE(), GETUTCDATE()) / 900.0, 0) AS INT) * 15;
    RETURN DATEADD(MINUTE,
                   DATEPART(HOUR, @local_time) * 60 + DATEPART(MINUTE, @local_time) + @utc_offset_minutes,
                   CAST(DATEADD(DAY, @day_offset, CAST(GETDATE() AS DATE)) AS DATETIME));
END;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- bcrypt hash of 'Demo@1234' (cost 12, same as the API's hashPassword)
DECLARE @pw VARCHAR(255) = '$2b$12$oPAEhzfllSq1TSIMAHaMI.PWrWg3ZyjhF8gH3sE.lBJn/U93UYL6O';

-- ============================================================
-- PEOPLE
-- ============================================================

-- role_id: 1 Admin, 2 Doctor, 3 Student, 4 Receptionist, 5 LabTechnician,
--          6 DentalAssistant, 7 InventoryManager, 8 Radiologist
SET IDENTITY_INSERT Users ON;
INSERT INTO Users (user_id, role_id, email, password, created_at, last_login, account_status) VALUES
(1,  1, 'admin@example.com',     @pw, DATEADD(DAY, -400, GETUTCDATE()), DATEADD(HOUR, -2, GETDATE()),  'Active'),
(2,  2, 'doctor@example.com',    @pw, DATEADD(DAY, -390, GETUTCDATE()), DATEADD(HOUR, -3, GETDATE()),  'Active'),
(3,  2, 'doctor2@example.com',   @pw, DATEADD(DAY, -380, GETUTCDATE()), DATEADD(HOUR, -4, GETDATE()),  'Active'),
(4,  3, 'student@example.com',   @pw, DATEADD(DAY, -240, GETUTCDATE()), DATEADD(HOUR, -3, GETDATE()),  'Active'),
(5,  3, 'student2@example.com',  @pw, DATEADD(DAY, -235, GETUTCDATE()), DATEADD(HOUR, -26, GETDATE()), 'Active'),
(6,  4, 'reception@example.com', @pw, DATEADD(DAY, -360, GETUTCDATE()), DATEADD(HOUR, -5, GETDATE()),  'Active'),
(7,  5, 'lab@example.com',       @pw, DATEADD(DAY, -350, GETUTCDATE()), DATEADD(HOUR, -28, GETDATE()), 'Active'),
(8,  6, 'assistant@example.com', @pw, DATEADD(DAY, -300, GETUTCDATE()), DATEADD(HOUR, -6, GETDATE()),  'Active'),
(9,  7, 'inventory@example.com', @pw, DATEADD(DAY, -340, GETUTCDATE()), DATEADD(HOUR, -25, GETDATE()), 'Active'),
(10, 8, 'radiology@example.com', @pw, DATEADD(DAY, -320, GETUTCDATE()), DATEADD(HOUR, -7, GETDATE()),  'Active');
SET IDENTITY_INSERT Users OFF;

SET IDENTITY_INSERT Employee ON;
INSERT INTO Employee (employee_id, user_id, first_name, middle_name, last_name, specialization, hire_date) VALUES
(1, 1,  'Sara',  'Khalid',   'Al-Otaibi',  'System Administration', '2021-09-01'),
(2, 2,  'Ahmed', 'Mohammed', 'Al-Qahtani', 'Orthodontics',          '2018-09-01'),
(3, 3,  'Noura', 'Ali',      'Al-Dosari',  'Periodontics',          '2019-06-15'),
(4, 6,  'Reem',  'Saad',     'Al-Shahrani','Reception',             '2022-01-10'),
(5, 7,  'Samer', 'Khalid',   'Al-Ghamdi',  'Dental Laboratory',     '2021-03-20'),
(6, 8,  'Huda',  'Faisal',   'Asiri',      'Clinical Assistance',   '2023-02-01'),
(7, 9,  'Fahad', 'Ibrahim',  'Al-Malki',   'Inventory Management',  '2022-08-15'),
(8, 10, 'Layla', 'Hassan',   'Al-Harbi',   'Oral Radiology',        '2020-11-01');
SET IDENTITY_INSERT Employee OFF;

SET IDENTITY_INSERT Manager ON;
INSERT INTO Manager (manager_id, employee_id, start_date) VALUES
(1, 2, '2023-01-01'),
(2, 3, '2023-01-01');
SET IDENTITY_INSERT Manager OFF;

SET IDENTITY_INSERT Clinic ON;
INSERT INTO Clinic (clinic_id, manager_id, clinic_name) VALUES
(1, 1, 'Clinic C-03'),
(2, 2, 'Clinic C-05'),
(3, 1, 'Clinic C-07');
SET IDENTITY_INSERT Clinic OFF;

-- Saleh is supervised by Dr. Ahmed (employee 2), Mona by Dr. Noura (employee 3).
SET IDENTITY_INSERT Student ON;
INSERT INTO Student (academic_id, user_id, employee_id, first_name, middle_name, last_name, academic_level) VALUES
(1, 4, 2, 'Saleh', 'Hassan',   'Al-Amri',    5),
(2, 5, 3, 'Mona',  'Abdullah', 'Al-Zahrani', 4);
SET IDENTITY_INSERT Student OFF;

-- section_id: 1 Restorative, 2 Orthodontics, 3 Oral Medicine, 4 Periodontics
INSERT INTO Employee_Section (employee_id, section_id, is_primary) VALUES
(2, 2, 1),
(2, 1, 0),
(3, 4, 1),
(3, 3, 0),
(6, 1, 1),
(6, 4, 0);

-- Sunday to Thursday, 08:00-16:00 (day_of_week: 0 = Sunday)
INSERT INTO Doctor_Availability (doctor_id, day_of_week, start_time, end_time) VALUES
(2, 0, '08:00', '16:00'), (2, 1, '08:00', '16:00'), (2, 2, '08:00', '16:00'), (2, 3, '08:00', '16:00'), (2, 4, '08:00', '16:00'),
(3, 0, '08:00', '16:00'), (3, 1, '08:00', '16:00'), (3, 2, '08:00', '16:00'), (3, 3, '08:00', '16:00'), (3, 4, '08:00', '16:00');

SET IDENTITY_INSERT Patients ON;
INSERT INTO Patients (patient_id, file_number, national_id, first_name, middle_name, last_name, date_of_birth, gender, created_at) VALUES
(1,  10001, 1023456781, 'Abdullah', 'Saeed',       'Al-Qahtani',  '1990-05-14', 'Male',   DATEADD(DAY, -180, GETDATE())),
(2,  10002, 1034567812, 'Fatima',   'Mohammed',    'Al-Zahrani',  '1985-11-22', 'Female', DATEADD(DAY, -170, GETDATE())),
(3,  10003, 1045678123, 'Sarah',    'Ali',         'Al-Mutairi',  '1998-03-08', 'Female', DATEADD(DAY, -150, GETDATE())),
(4,  10004, 1056781234, 'Omar',     'Khalid',      'Al-Rashidi',  '2001-07-30', 'Male',   DATEADD(DAY, -140, GETDATE())),
(5,  10005, 1067812345, 'Maher',    'Fahad',       'Al-Harbi',    '1962-12-01', 'Male',   DATEADD(DAY, -120, GETDATE())),
(6,  10006, 1078123456, 'Nasser',   'Saad',        'Al-Shehri',   '1988-04-10', 'Male',   DATEADD(DAY, -100, GETDATE())),
(7,  10007, 1081234567, 'Hessa',    'Turki',       'Al-Otaibi',   '1995-07-25', 'Female', DATEADD(DAY, -90,  GETDATE())),
(8,  10008, 1092345678, 'Tariq',    'Majed',       'Al-Subaie',   '1979-11-03', 'Male',   DATEADD(DAY, -85,  GETDATE())),
(9,  10009, 1013456789, 'Lama',     'Yousef',      'Al-Ghamdi',   '2014-02-17', 'Female', DATEADD(DAY, -60,  GETDATE())),
(10, 10010, 1024567890, 'Khalid',   'Nasser',      'Al-Dossary',  '1971-09-09', 'Male',   DATEADD(DAY, -45,  GETDATE())),
(11, 10011, 1035678901, 'Reem',     'Abdulrahman', 'Al-Shammari', '2007-06-21', 'Female', DATEADD(DAY, -20,  GETDATE())),
(12, 10012, 1046789012, 'Yousef',   'Ibrahim',     'Al-Anazi',    '1955-01-30', 'Male',   DATEADD(DAY, -5,   GETDATE()));
SET IDENTITY_INSERT Patients OFF;

-- One medical record per patient (record_id = patient_id), with intake data.
SET IDENTITY_INSERT Medical_Records ON;
INSERT INTO Medical_Records (record_id, patient_id, chief_complaint, chronic_diseases, pain_score, allergies) VALUES
(1,  1,  'Pain on the lower right side when chewing',          'Type 2 diabetes',                 6, NULL),
(2,  2,  'Bleeding gums when brushing',                        NULL,                              2, NULL),
(3,  3,  'Pain behind the lower right molars',                 NULL,                              5, 'Latex'),
(4,  4,  'Sensitivity to cold drinks',                         NULL,                              3, NULL),
(5,  5,  'Loose teeth and receding gums',                      'Hypertension',                    4, NULL),
(6,  6,  'Crowded upper front teeth',                          NULL,                              0, NULL),
(7,  7,  'Swollen gums around the lower front teeth',          'Asthma',                          3, NULL),
(8,  8,  'Broken lower left wisdom tooth',                     NULL,                              7, NULL),
(9,  9,  'Toothache in a lower molar',                         NULL,                              5, NULL),
(10, 10, 'Cracked upper right molar',                          'Hypertension, high cholesterol',  4, 'Penicillin'),
(11, 11, 'Wants to straighten her teeth',                      NULL,                              0, NULL),
(12, 12, 'Food getting stuck between the upper left teeth',    'Type 2 diabetes, hypertension',   2, NULL);
SET IDENTITY_INSERT Medical_Records OFF;

INSERT INTO Contact_Information (employee_id, student_id, patient_id, owner_type, phone_number, email, contact_type) VALUES
(1,    NULL, NULL, 'Employee', '0500002001', 'admin@example.com',             'Primary'),
(2,    NULL, NULL, 'Employee', '0500002002', 'doctor@example.com',            'Primary'),
(3,    NULL, NULL, 'Employee', '0500002003', 'doctor2@example.com',           'Primary'),
(4,    NULL, NULL, 'Employee', '0500002004', 'reception@example.com',         'Primary'),
(5,    NULL, NULL, 'Employee', '0500002005', 'lab@example.com',               'Primary'),
(6,    NULL, NULL, 'Employee', '0500002006', 'assistant@example.com',         'Primary'),
(7,    NULL, NULL, 'Employee', '0500002007', 'inventory@example.com',         'Primary'),
(8,    NULL, NULL, 'Employee', '0500002008', 'radiology@example.com',         'Primary'),
(NULL, 1,    NULL, 'Student',  '0500003001', 'student@example.com',           'Primary'),
(NULL, 2,    NULL, 'Student',  '0500003002', 'student2@example.com',          'Primary'),
(NULL, NULL, 1,    'Patient',  '0500001001', 'abdullah.qahtani@example.com',  'Personal'),
(NULL, NULL, 2,    'Patient',  '0500001002', 'fatima.zahrani@example.com',    'Personal'),
(NULL, NULL, 3,    'Patient',  '0500001003', 'sarah.mutairi@example.com',     'Personal'),
(NULL, NULL, 4,    'Patient',  '0500001004', 'omar.rashidi@example.com',      'Personal'),
(NULL, NULL, 5,    'Patient',  '0500001005', NULL,                            'Personal'),
(NULL, NULL, 6,    'Patient',  '0500001006', 'nasser.shehri@example.com',     'Personal'),
(NULL, NULL, 7,    'Patient',  '0500001007', 'hessa.otaibi@example.com',      'Personal'),
(NULL, NULL, 8,    'Patient',  '0500001008', 'tariq.subaie@example.com',      'Personal'),
(NULL, NULL, 9,    'Patient',  '0500001009', NULL,                            'Personal'),
(NULL, NULL, 10,   'Patient',  '0500001010', 'khalid.dossary@example.com',    'Personal'),
(NULL, NULL, 11,   'Patient',  '0500001011', 'reem.shammari@example.com',     'Personal'),
(NULL, NULL, 12,   'Patient',  '0500001012', NULL,                            'Personal');

-- ============================================================
-- APPOINTMENTS
-- History (Completed / No Show / Canceled), today's schedule and
-- the next two weeks. booked_by 6 = the receptionist.
-- type_id: 1 Consultation, 2 Check-up, 3 Cleaning, 4 Filling, 5 Extraction,
--          6 Root Canal, 7 Crown Placement, 9 Orthodontic Adjustment,
--          10 Periodontic Treatment, 11 Dental Imaging, 13 Follow-up,
--          14 Pediatric Check-up
-- ============================================================
SET IDENTITY_INSERT Appointments ON;
INSERT INTO Appointments
    (appointment_id, patient_id, doctor_id, academic_id, clinic_id, record_id, appointment_type_id,
     appointment_start_time, appointment_end_time, status, booked_by, arrival_status, arrived_at)
VALUES
-- Dr. Ahmed (employee 2) with student Saleh (academic 1)
(1,  1,  2, 1,    1, 1,  1,  dbo.seed_at(-120, '09:00'), dbo.seed_at(-120, '09:30'), 'Completed', 6, 'On Time', dbo.seed_at(-120, '08:55')),
(2,  1,  2, 1,    1, 1,  4,  dbo.seed_at(-105, '10:00'), dbo.seed_at(-105, '11:00'), 'Completed', 6, 'Late',    dbo.seed_at(-105, '10:12')),
(3,  6,  2, NULL, 1, 6,  9,  dbo.seed_at(-95,  '11:00'), dbo.seed_at(-95,  '11:30'), 'Completed', 6, 'On Time', dbo.seed_at(-95,  '10:58')),
(4,  4,  2, 1,    3, 4,  2,  dbo.seed_at(-88,  '09:30'), dbo.seed_at(-88,  '09:50'), 'No Show',   6, 'No Show', NULL),
(5,  8,  2, NULL, 1, 8,  5,  dbo.seed_at(-80,  '13:00'), dbo.seed_at(-80,  '13:45'), 'Completed', 6, 'On Time', dbo.seed_at(-80,  '12:58')),
(6,  6,  2, NULL, 1, 6,  9,  dbo.seed_at(-65,  '11:00'), dbo.seed_at(-65,  '11:30'), 'Completed', 6, 'On Time', dbo.seed_at(-65,  '11:00')),
(7,  1,  2, 1,    1, 1,  6,  dbo.seed_at(-50,  '09:00'), dbo.seed_at(-50,  '10:30'), 'Completed', 6, 'Late',    dbo.seed_at(-50,  '09:08')),
(8,  10, 2, NULL, 3, 10, 1,  dbo.seed_at(-40,  '10:30'), dbo.seed_at(-40,  '11:00'), 'Canceled',  6, NULL,      NULL),
(9,  6,  2, NULL, 1, 6,  9,  dbo.seed_at(-35,  '11:00'), dbo.seed_at(-35,  '11:30'), 'Completed', 6, 'On Time', dbo.seed_at(-35,  '10:56')),
(10, 4,  2, 1,    1, 4,  4,  dbo.seed_at(-30,  '12:00'), dbo.seed_at(-30,  '13:00'), 'Completed', 6, 'On Time', dbo.seed_at(-30,  '11:57')),
(11, 10, 2, NULL, 3, 10, 7,  dbo.seed_at(-21,  '10:00'), dbo.seed_at(-21,  '11:00'), 'Completed', 6, 'Late',    dbo.seed_at(-21,  '10:15')),
(12, 8,  2, NULL, 1, 8,  13, dbo.seed_at(-14,  '14:00'), dbo.seed_at(-14,  '14:20'), 'No Show',   6, 'No Show', NULL),
(13, 4,  2, 1,    1, 4,  13, dbo.seed_at(-7,   '13:30'), dbo.seed_at(-7,   '13:50'), 'Completed', 6, 'On Time', dbo.seed_at(-7,   '13:29')),
(14, 12, 2, 1,    1, 12, 1,  dbo.seed_at(-5,   '09:00'), dbo.seed_at(-5,   '09:30'), 'Completed', 6, 'On Time', dbo.seed_at(-5,   '09:00')),
-- Dr. Noura (employee 3) with student Mona (academic 2)
(15, 2,  3, NULL, 2, 2,  3,  dbo.seed_at(-115, '10:00'), dbo.seed_at(-115, '10:45'), 'Completed', 6, 'On Time', dbo.seed_at(-115, '10:00')),
(16, 5,  3, 2,    2, 5,  10, dbo.seed_at(-100, '09:00'), dbo.seed_at(-100, '10:00'), 'Completed', 6, 'On Time', dbo.seed_at(-100, '08:56')),
(17, 3,  3, 2,    2, 3,  1,  dbo.seed_at(-92,  '11:00'), dbo.seed_at(-92,  '11:30'), 'Completed', 6, 'Late',    dbo.seed_at(-92,  '11:10')),
(18, 7,  3, NULL, 2, 7,  3,  dbo.seed_at(-85,  '13:00'), dbo.seed_at(-85,  '13:45'), 'Completed', 6, 'On Time', dbo.seed_at(-85,  '13:00')),
(19, 5,  3, 2,    2, 5,  10, dbo.seed_at(-70,  '09:00'), dbo.seed_at(-70,  '10:00'), 'Completed', 6, 'On Time', dbo.seed_at(-70,  '09:00')),
(20, 9,  3, NULL, 2, 9,  14, dbo.seed_at(-55,  '10:00'), dbo.seed_at(-55,  '10:30'), 'Completed', 6, 'On Time', dbo.seed_at(-55,  '09:54')),
(21, 3,  3, 2,    2, 3,  5,  dbo.seed_at(-45,  '12:00'), dbo.seed_at(-45,  '12:45'), 'Completed', 6, 'On Time', dbo.seed_at(-45,  '12:00')),
(22, 2,  3, NULL, 2, 2,  2,  dbo.seed_at(-38,  '09:30'), dbo.seed_at(-38,  '09:50'), 'No Show',   6, 'No Show', NULL),
(23, 7,  3, NULL, 2, 7,  10, dbo.seed_at(-25,  '13:00'), dbo.seed_at(-25,  '14:00'), 'Canceled',  6, NULL,      NULL),
(24, 11, 3, 2,    2, 11, 1,  dbo.seed_at(-18,  '11:00'), dbo.seed_at(-18,  '11:30'), 'Completed', 6, 'On Time', dbo.seed_at(-18,  '11:00')),
(25, 5,  3, 2,    2, 5,  13, dbo.seed_at(-10,  '10:00'), dbo.seed_at(-10,  '10:20'), 'Completed', 6, 'Late',    dbo.seed_at(-10,  '10:20')),
(26, 2,  3, NULL, 2, 2,  3,  dbo.seed_at(-3,   '09:00'), dbo.seed_at(-3,   '09:45'), 'Completed', 6, 'On Time', dbo.seed_at(-3,   '09:00')),
-- Today
(27, 6,  2, NULL, 1, 6,  9,  dbo.seed_at(0, '08:30'), dbo.seed_at(0, '09:00'), 'Completed',   6, 'On Time', dbo.seed_at(0, '08:25')),
(28, 1,  2, 1,    1, 1,  7,  dbo.seed_at(0, '09:30'), dbo.seed_at(0, '10:30'), 'In Progress', 6, 'Late',    dbo.seed_at(0, '09:37')),
(29, 4,  2, 1,    1, 4,  13, dbo.seed_at(0, '11:00'), dbo.seed_at(0, '11:20'), 'In Progress', 6, 'On Time', dbo.seed_at(0, '10:50')),
(30, 12, 2, NULL, 3, 12, 11, dbo.seed_at(0, '12:30'), dbo.seed_at(0, '12:45'), 'Scheduled',   6, NULL,      NULL),
(31, 8,  2, 1,    1, 8,  4,  dbo.seed_at(0, '14:00'), dbo.seed_at(0, '15:00'), 'Scheduled',   6, NULL,      NULL),
(32, 7,  3, NULL, 2, 7,  10, dbo.seed_at(0, '09:00'), dbo.seed_at(0, '10:00'), 'Completed',   6, 'On Time', dbo.seed_at(0, '09:00')),
(33, 5,  3, 2,    2, 5,  10, dbo.seed_at(0, '10:30'), dbo.seed_at(0, '11:30'), 'In Progress', 6, 'Late',    dbo.seed_at(0, '10:42')),
(34, 3,  3, 2,    2, 3,  13, dbo.seed_at(0, '12:00'), dbo.seed_at(0, '12:20'), 'Scheduled',   6, NULL,      NULL),
(35, 9,  3, NULL, 2, 9,  14, dbo.seed_at(0, '13:30'), dbo.seed_at(0, '14:00'), 'Scheduled',   6, NULL,      NULL),
(36, 11, 3, 2,    2, 11, 4,  dbo.seed_at(0, '15:00'), dbo.seed_at(0, '16:00'), 'Scheduled',   6, NULL,      NULL),
-- Upcoming
(37, 1,  2, 1,    1, 1,  13, dbo.seed_at(2,  '09:00'), dbo.seed_at(2,  '09:20'), 'Scheduled', 6, NULL, NULL),
(38, 10, 2, NULL, 3, 10, 13, dbo.seed_at(3,  '10:30'), dbo.seed_at(3,  '10:50'), 'Scheduled', 6, NULL, NULL),
(39, 6,  2, NULL, 1, 6,  9,  dbo.seed_at(7,  '11:00'), dbo.seed_at(7,  '11:30'), 'Scheduled', 6, NULL, NULL),
(40, 4,  2, 1,    1, 4,  4,  dbo.seed_at(9,  '13:00'), dbo.seed_at(9,  '14:00'), 'Scheduled', 6, NULL, NULL),
(41, 2,  3, NULL, 2, 2,  2,  dbo.seed_at(1,  '09:30'), dbo.seed_at(1,  '09:50'), 'Scheduled', 6, NULL, NULL),
(42, 5,  3, 2,    2, 5,  13, dbo.seed_at(4,  '10:00'), dbo.seed_at(4,  '10:20'), 'Scheduled', 6, NULL, NULL),
(43, 7,  3, NULL, 2, 7,  3,  dbo.seed_at(6,  '12:00'), dbo.seed_at(6,  '12:45'), 'Scheduled', 6, NULL, NULL),
(44, 3,  3, 2,    2, 3,  1,  dbo.seed_at(11, '11:00'), dbo.seed_at(11, '11:30'), 'Scheduled', 6, NULL, NULL);
SET IDENTITY_INSERT Appointments OFF;

-- ============================================================
-- CLINICAL NOTES
-- Doctor-authored notes are approved on insert (reviewed_by = author).
-- Student notes go to the supervising doctor's review queue.
-- ============================================================

SET IDENTITY_INSERT Prescriptions ON;
INSERT INTO Prescriptions (prescription_id, record_id, medicine_name, dosage, duration, cost) VALUES
(1, 8, 'Amoxicillin 500 mg',              'One capsule three times daily',  '5 days',  25.00),
(2, 1, 'Ibuprofen 400 mg',                'One tablet every 8 hours as needed', '3 days', 12.50),
(3, 5, 'Chlorhexidine 0.12% mouth rinse', '15 ml twice daily',              '14 days', 18.00),
(4, 3, 'Amoxicillin 500 mg',              'One capsule three times daily',  '5 days',  25.00);
SET IDENTITY_INSERT Prescriptions OFF;

SET IDENTITY_INSERT Diagnosis ON;
INSERT INTO Diagnosis
    (diagnosis_id, record_id, appointment_id, authored_by_student, authored_by_doctor, reviewed_by, tooth_number,
     diagnosis_type, clinical_findings, radiographic_findings, progress_note,
     status, doctor_feedback, revision_count, submitted_at, reviewed_at, created_at)
VALUES
(1,  1,  1,  1,    NULL, 2, '46', 'Cavity',
     'Deep occlusal caries on 46, sharp pain to cold that fades within seconds.',
     'Radiolucency close to the pulp horn of 46; no periapical changes.',
     'Composite restoration planned; patient informed RCT may be needed if symptoms persist.',
     'Approved', 'Good description of the lesion depth.', 0, dbo.seed_at(-120, '09:40'), dbo.seed_at(-119, '10:00'), dbo.seed_at(-120, '09:40')),
(2,  8,  5,  NULL, 2,    2, '38', 'Fracture',
     'Vertical fracture of 38 with a mobile buccal fragment.',
     'Fracture line through the crown into the distal root on the periapical film.',
     'Tooth not restorable; surgical extraction performed today.',
     'Approved', NULL, 0, dbo.seed_at(-80, '13:40'), dbo.seed_at(-80, '13:40'), dbo.seed_at(-80, '13:40')),
(3,  1,  7,  1,    NULL, 2, '46', 'Periapical lesion',
     'Lingering pain on 46 after the filling, tender to percussion.',
     'Widened PDL space and small periapical radiolucency at the mesial root of 46.',
     'Root canal treatment started and completed in one visit.',
     'Approved', 'Correct diagnosis; radiographic findings well documented.', 0, dbo.seed_at(-50, '10:40'), dbo.seed_at(-49, '09:30'), dbo.seed_at(-50, '10:40')),
(4,  4,  10, 1,    NULL, 2, '36', 'Cavity',
     'Mesial caries on 36, sensitive to cold and sweets.',
     'Interproximal radiolucency into dentine on the bitewing.',
     'Class II composite restoration placed.',
     'Approved', NULL, 0, dbo.seed_at(-30, '12:55'), dbo.seed_at(-29, '10:15'), dbo.seed_at(-30, '12:55')),
(5,  10, 11, NULL, 2,    2, '16', 'Fracture',
     'Cracked palatal cusp on 16 with pain on release of biting.',
     'No periapical pathology; large existing amalgam restoration.',
     'Full-coverage crown placed to protect the remaining cusps.',
     'Approved', NULL, 0, dbo.seed_at(-21, '10:55'), dbo.seed_at(-21, '10:55'), dbo.seed_at(-21, '10:55')),
(6,  4,  13, 1,    NULL, 2, '36', 'Treated',
     'Restoration on 36 intact, no marginal gaps.',
     'No new radiographic findings.',
     'Patient reports reduced sensitivity.',
     'Revision_Requested', 'Please record the shade used and the result of the post-operative sensitivity test.', 1,
     dbo.seed_at(-7, '13:50'), dbo.seed_at(-6, '09:00'), dbo.seed_at(-7, '13:50')),
(7,  12, 14, 1,    NULL, 2, '26', 'Cavity',
     'Food impaction between 25 and 26; caries on the mesial surface of 26.',
     'Interproximal radiolucency on 26 reaching dentine.',
     'Class II restoration proposed; patient to return for treatment.',
     'Submitted', NULL, 0, dbo.seed_at(-5, '09:35'), NULL, dbo.seed_at(-5, '09:35')),
(8,  2,  15, NULL, 3,    3, '31', 'Gingivitis',
     'Generalised marginal gingivitis, bleeding on probing, calculus on lower anteriors.',
     'No bone loss.',
     'Full-mouth scaling and oral hygiene instructions given.',
     'Approved', NULL, 0, dbo.seed_at(-115, '10:40'), dbo.seed_at(-115, '10:40'), dbo.seed_at(-115, '10:40')),
(9,  5,  16, 2,    NULL, 3, '16', 'Gingivitis',
     'Bleeding on probing with 5 mm pockets on 16 and 26.',
     'Horizontal bone loss in the upper molar region.',
     'Non-surgical periodontal therapy started.',
     'Approved', 'Thorough charting.', 0, dbo.seed_at(-100, '09:55'), dbo.seed_at(-99, '11:00'), dbo.seed_at(-100, '09:55')),
(10, 3,  17, 2,    NULL, 3, '47', 'Cavity',
     'Distal caries on 47 next to a partially erupted 48.',
     'Mesioangular impaction of 48 and distal radiolucency on 47.',
     'Referred for extraction of 48 before restoring 47.',
     'Approved', NULL, 0, dbo.seed_at(-92, '11:30'), dbo.seed_at(-91, '10:00'), dbo.seed_at(-92, '11:30')),
(11, 9,  20, NULL, 3,    3, '36', 'Cavity',
     'Occlusal caries on 36, child cooperative.',
     'Lesion limited to dentine.',
     'Composite restoration placed; fluoride varnish applied.',
     'Approved', NULL, 0, dbo.seed_at(-55, '10:25'), dbo.seed_at(-55, '10:25'), dbo.seed_at(-55, '10:25')),
(12, 11, 24, 2,    NULL, 3, '13', 'Healthy',
     'Crowding in the upper arch with a buccally placed 13; teeth and gums healthy.',
     'All permanent teeth present; no caries.',
     'Referred to the orthodontics section for assessment.',
     'Submitted', NULL, 0, dbo.seed_at(-18, '11:25'), NULL, dbo.seed_at(-18, '11:25')),
(13, 5,  25, 2,    NULL, 3, '16', 'Gingivitis',
     'Pockets on 16 reduced to 3 mm; minimal bleeding.',
     'No change since the last radiograph.',
     'Maintenance visits every three months.',
     'Approved', 'Excellent follow-up note.', 0, dbo.seed_at(-10, '10:15'), dbo.seed_at(0, '08:10'), dbo.seed_at(-10, '10:15')),
(14, 1,  28, 1,    NULL, 2, '46', 'Treated',
     'Root-treated 46 prepared for a full crown; zirconia crown try-in.',
     'Well-condensed root filling, no periapical lesion.',
     'Crown cemented; occlusion checked.',
     'Submitted', NULL, 0, dbo.seed_at(0, '10:20'), NULL, dbo.seed_at(0, '10:20')),
(15, 7,  32, NULL, 3,    3, '31', 'Gingivitis',
     'Swollen, bleeding gingiva around the lower incisors.',
     'Early crestal bone loss around 31 and 41.',
     'Scaling and root planing of the lower anterior sextant.',
     'Approved', NULL, 0, dbo.seed_at(0, '09:50'), dbo.seed_at(0, '09:50'), dbo.seed_at(0, '09:50'));
SET IDENTITY_INSERT Diagnosis OFF;

SET IDENTITY_INSERT Treatment ON;
INSERT INTO Treatment
    (treatment_id, record_id, appointment_id, prescription_id, authored_by_student, authored_by_doctor, approved_by_doctor,
     treatment_type, treatment_note, doctor_feedback, status, revision_count, submitted_at, reviewed_at)
VALUES
(1,  1,  2,  NULL, 1,    NULL, 2,    'Filling',    'Class I composite restoration on 46 under rubber dam.',                      'Good isolation.', 'Approved', 0, dbo.seed_at(-105, '10:55'), dbo.seed_at(-104, '09:00')),
(2,  6,  3,  NULL, NULL, 2,    2,    'Review',     'Brackets bonded on the upper arch; 0.014 NiTi archwire placed.',              NULL, 'Approved', 0, dbo.seed_at(-95, '11:25'), dbo.seed_at(-95, '11:25')),
(3,  8,  5,  1,    NULL, 2,    2,    'Extraction', 'Surgical extraction of 38 under local anaesthesia; two sutures placed.',      NULL, 'Approved', 0, dbo.seed_at(-80, '13:45'), dbo.seed_at(-80, '13:45')),
(4,  6,  6,  NULL, NULL, 2,    2,    'Review',     'Archwire changed to 0.016 NiTi; alignment progressing.',                      NULL, 'Approved', 0, dbo.seed_at(-65, '11:25'), dbo.seed_at(-65, '11:25')),
(5,  1,  7,  2,    1,    NULL, 2,    'RCT',        'Root canal treatment of 46: three canals shaped, irrigated and obturated.',    'Clean obturation.', 'Approved', 0, dbo.seed_at(-50, '10:45'), dbo.seed_at(-49, '09:35')),
(6,  6,  9,  NULL, NULL, 2,    2,    'Review',     'Archwire changed to 0.018 NiTi; spaces closing well.',                        NULL, 'Approved', 0, dbo.seed_at(-35, '11:25'), dbo.seed_at(-35, '11:25')),
(7,  4,  10, NULL, 1,    NULL, 2,    'Filling',    'Class II composite restoration on 36 with sectional matrix.',                 NULL, 'Approved', 0, dbo.seed_at(-30, '13:00'), dbo.seed_at(-29, '10:20')),
(8,  10, 11, NULL, NULL, 2,    2,    'Crown',      'PFM crown cemented on 16; occlusion adjusted.',                               NULL, 'Approved', 0, dbo.seed_at(-21, '11:00'), dbo.seed_at(-21, '11:00')),
(9,  2,  15, NULL, NULL, 3,    3,    'Scaling',    'Full-mouth supragingival scaling and polishing.',                             NULL, 'Approved', 0, dbo.seed_at(-115, '10:45'), dbo.seed_at(-115, '10:45')),
(10, 5,  16, 3,    2,    NULL, 3,    'Scaling',    'Scaling and root planing of the upper right sextant.',                        NULL, 'Approved', 0, dbo.seed_at(-100, '10:00'), dbo.seed_at(-99, '11:05')),
(11, 7,  18, NULL, NULL, 3,    3,    'Scaling',    'Supragingival scaling; oral hygiene instructions.',                           NULL, 'Approved', 0, dbo.seed_at(-85, '13:45'), dbo.seed_at(-85, '13:45')),
(12, 5,  19, NULL, 2,    NULL, 3,    'Scaling',    'Root planing of the upper left sextant.',                                     'Pocket depths were not charted. Re-examine and document them before resubmitting.', 'Rejected', 0, dbo.seed_at(-70, '10:00'), dbo.seed_at(-69, '09:30')),
(13, 9,  20, NULL, NULL, 3,    3,    'Filling',    'Occlusal composite restoration on 36.',                                       NULL, 'Approved', 0, dbo.seed_at(-55, '10:30'), dbo.seed_at(-55, '10:30')),
(14, 3,  21, 4,    2,    NULL, 3,    'Extraction', 'Surgical removal of the impacted 48; socket irrigated and sutured.',          'Well executed.', 'Approved', 0, dbo.seed_at(-45, '12:45'), dbo.seed_at(-44, '10:00')),
(15, 2,  26, NULL, NULL, 3,    3,    'Scaling',    'Routine scaling and polishing.',                                              NULL, 'Approved', 0, dbo.seed_at(-3, '09:45'), dbo.seed_at(-3, '09:45')),
(16, 6,  27, NULL, NULL, 2,    2,    'Review',     'Archwire changed to 0.019x0.025 stainless steel for space closure.',          NULL, 'Approved', 0, dbo.seed_at(0, '09:00'), dbo.seed_at(0, '09:00')),
(17, 1,  28, NULL, 1,    NULL, NULL, 'Crown',      'Zirconia crown from the lab tried in and cemented on 46.',                    NULL, 'Submitted', 0, dbo.seed_at(0, '10:25'), NULL),
(18, 7,  32, NULL, NULL, 3,    3,    'Scaling',    'Scaling and root planing of the lower anterior sextant.',                     NULL, 'Approved', 0, dbo.seed_at(0, '10:00'), dbo.seed_at(0, '10:00'));
SET IDENTITY_INSERT Treatment OFF;

-- One chart note per tooth with a (non-healthy) diagnosis, as the visit form writes it.
INSERT INTO Dental_Chart (record_id, appointment_id, tooth_number, tooth_note, authored_by_student, authored_by_doctor, created_at, updated_at) VALUES
(1,  1,  '46', 'Cavity',            1,    NULL, dbo.seed_at(-120, '09:40'), dbo.seed_at(-120, '09:40')),
(8,  5,  '38', 'Fracture',          NULL, 2,    dbo.seed_at(-80,  '13:40'), dbo.seed_at(-80,  '13:40')),
(1,  7,  '46', 'Periapical lesion', 1,    NULL, dbo.seed_at(-50,  '10:40'), dbo.seed_at(-50,  '10:40')),
(4,  10, '36', 'Cavity',            1,    NULL, dbo.seed_at(-30,  '12:55'), dbo.seed_at(-30,  '12:55')),
(10, 11, '16', 'Fracture',          NULL, 2,    dbo.seed_at(-21,  '10:55'), dbo.seed_at(-21,  '10:55')),
(4,  13, '36', 'Treated',           1,    NULL, dbo.seed_at(-7,   '13:50'), dbo.seed_at(-7,   '13:50')),
(12, 14, '26', 'Cavity',            1,    NULL, dbo.seed_at(-5,   '09:35'), dbo.seed_at(-5,   '09:35')),
(2,  15, '31', 'Gingivitis',        NULL, 3,    dbo.seed_at(-115, '10:40'), dbo.seed_at(-115, '10:40')),
(5,  16, '16', 'Gingivitis',        2,    NULL, dbo.seed_at(-100, '09:55'), dbo.seed_at(-100, '09:55')),
(3,  17, '47', 'Cavity',            2,    NULL, dbo.seed_at(-92,  '11:30'), dbo.seed_at(-92,  '11:30')),
(9,  20, '36', 'Cavity',            NULL, 3,    dbo.seed_at(-55,  '10:25'), dbo.seed_at(-55,  '10:25')),
(5,  25, '16', 'Gingivitis',        2,    NULL, dbo.seed_at(-10,  '10:15'), dbo.seed_at(-10,  '10:15')),
(1,  28, '46', 'Treated',           1,    NULL, dbo.seed_at(0,    '10:20'), dbo.seed_at(0,    '10:20')),
(7,  32, '31', 'Gingivitis',        NULL, 3,    dbo.seed_at(0,    '09:50'), dbo.seed_at(0,    '09:50'));

-- One entry per review decision. Like the API, approvals and rejections are
-- logged with the current revision_count (0 here) and a revision request
-- with revision_count + 1.
INSERT INTO Review_History (submission_type, submission_id, round_number, reviewed_by, action, feedback, created_at) VALUES
('Diagnosis', 1,  0, 2, 'Approved',           'Good description of the lesion depth.',                                                      dbo.seed_at(-119, '10:00')),
('Treatment', 1,  0, 2, 'Approved',           'Good isolation.',                                                                            dbo.seed_at(-104, '09:00')),
('Diagnosis', 3,  0, 2, 'Approved',           'Correct diagnosis; radiographic findings well documented.',                                  dbo.seed_at(-49,  '09:30')),
('Treatment', 5,  0, 2, 'Approved',           'Clean obturation.',                                                                          dbo.seed_at(-49,  '09:35')),
('Diagnosis', 4,  0, 2, 'Approved',           NULL,                                                                                         dbo.seed_at(-29,  '10:15')),
('Treatment', 7,  0, 2, 'Approved',           NULL,                                                                                         dbo.seed_at(-29,  '10:20')),
('Diagnosis', 6,  1, 2, 'Revision_Requested', 'Please record the shade used and the result of the post-operative sensitivity test.',        dbo.seed_at(-6,   '09:00')),
('Diagnosis', 9,  0, 3, 'Approved',           'Thorough charting.',                                                                         dbo.seed_at(-99,  '11:00')),
('Treatment', 10, 0, 3, 'Approved',           NULL,                                                                                         dbo.seed_at(-99,  '11:05')),
('Diagnosis', 10, 0, 3, 'Approved',           NULL,                                                                                         dbo.seed_at(-91,  '10:00')),
('Treatment', 12, 0, 3, 'Rejected',           'Pocket depths were not charted. Re-examine and document them before resubmitting.',          dbo.seed_at(-69,  '09:30')),
('Treatment', 14, 0, 3, 'Approved',           'Well executed.',                                                                             dbo.seed_at(-44,  '10:00')),
('Diagnosis', 13, 0, 3, 'Approved',           'Excellent follow-up note.',                                                                  dbo.seed_at(0,    '08:10'));

-- Grades (0-10) for approved student submissions. student_id = academic_id.
INSERT INTO Student_Grades (submission_type, submission_id, student_id, graded_by, grade, feedback_note, graded_at) VALUES
('Diagnosis', 1,  1, 2, 8,  'Accurate findings.',                   DATEADD(DAY, -119, GETDATE())),
('Treatment', 1,  1, 2, 7,  'Contact point could be tighter.',      DATEADD(DAY, -104, GETDATE())),
('Diagnosis', 3,  1, 2, 9,  NULL,                                   DATEADD(DAY, -49,  GETDATE())),
('Treatment', 5,  1, 2, 9,  'Very good canal shaping.',             DATEADD(DAY, -49,  GETDATE())),
('Diagnosis', 4,  1, 2, 8,  NULL,                                   DATEADD(DAY, -29,  GETDATE())),
('Treatment', 7,  1, 2, 8,  NULL,                                   DATEADD(DAY, -29,  GETDATE())),
('Diagnosis', 9,  2, 3, 9,  'Complete periodontal charting.',       DATEADD(DAY, -99,  GETDATE())),
('Treatment', 10, 2, 3, 8,  NULL,                                   DATEADD(DAY, -99,  GETDATE())),
('Diagnosis', 10, 2, 3, 8,  NULL,                                   DATEADD(DAY, -91,  GETDATE())),
('Treatment', 14, 2, 3, 9,  'Good surgical technique.',             DATEADD(DAY, -44,  GETDATE())),
('Diagnosis', 13, 2, 3, 10, NULL,                                   DATEADD(HOUR, -2,  GETDATE()));

-- ============================================================
-- DENTAL LAB
-- employee_id = requesting or supervising doctor; assigned_to = lab technician (employee 5)
-- ============================================================
SET IDENTITY_INSERT Lab_Requests ON;
INSERT INTO Lab_Requests
    (lab_request_id, employee_id, student_id, patient_id, appointment_id, approved_by, tooth_number, request_note,
     request_status, request_timestamp, supervisor_feedback, reviewed_at, assigned_to, assigned_at)
VALUES
(1, 2, 1,    1,  7,    2, '46', 'Zirconia crown for 46 after root canal treatment. Shade A2.',
    'Delivered',   dbo.seed_at(-49, '11:00'), 'Approved. The scan margins look good.', dbo.seed_at(-48, '09:00'), 5, dbo.seed_at(-47, '08:30')),
(2, 3, NULL, 5,  25,   3, NULL, 'Upper night guard. Patient reports clenching at night.',
    'In Progress', dbo.seed_at(-10, '11:00'), NULL, NULL, 5, dbo.seed_at(-9, '09:00')),
(3, 3, 2,    3,  NULL, 3, NULL, 'Upper and lower bleaching trays.',
    'Pending',     dbo.seed_at(-1, '14:00'), NULL, NULL, NULL, NULL),
(4, 2, NULL, 12, 14,   2, '26', 'Composite onlay for 26.',
    'Pending',     dbo.seed_at(-4, '10:00'), NULL, NULL, NULL, NULL),
(5, 2, 1,    4,  10,   2, NULL, 'Upper retainer after orthodontic consultation.',
    'Rejected',    dbo.seed_at(-30, '13:30'), 'Take a new impression first; the current one has voids.', dbo.seed_at(-29, '10:00'), NULL, NULL),
(6, 2, NULL, 10, NULL, 2, '16', 'PFM crown for 16. Shade A3.',
    'Delivered',   dbo.seed_at(-35, '09:00'), NULL, NULL, 5, dbo.seed_at(-34, '08:45'));
SET IDENTITY_INSERT Lab_Requests OFF;

INSERT INTO Lab_Response (lab_request_id, response_note, created_at) VALUES
(1, 'Zirconia crown for 46 is ready for try-in (shade A2).', dbo.seed_at(-40, '13:00')),
(6, 'PFM crown for 16 delivered to Clinic C-07 (shade A3).',  dbo.seed_at(-24, '12:00'));

-- ============================================================
-- RADIOLOGY: screening requests waiting for the radiologist (employee 8)
-- ============================================================
SET IDENTITY_INSERT Screening_Requests ON;
INSERT INTO Screening_Requests
    (request_id, record_id, patient_id, appointment_id, requested_by_user_id, assigned_radiologist_id, request_status, requested_at)
VALUES
(1, 12, 12, 30, 2, 8, 'Pending', dbo.seed_at(0, '08:05')),
(2, 3,  3,  34, 5, 8, 'Pending', dbo.seed_at(0, '08:20'));
SET IDENTITY_INSERT Screening_Requests OFF;

-- ============================================================
-- INVENTORY
-- Stock lives in batches; transactions are the audit trail of deposits,
-- withdrawals and rejected requests. User 9 is the inventory manager.
-- ============================================================
SET IDENTITY_INSERT Inventory_Items ON;
INSERT INTO Inventory_Items (item_id, item_name, category, low_stock_limit, supplier, unit_cost, register_date, assigned_by) VALUES
(1,  'Nitrile Gloves (M)',           'Consumables',   50,  'Gulf Medical Supplies', 45.00,  DATEADD(DAY, -200, CAST(GETDATE() AS DATE)), 9),
(2,  'Surgical Masks',               'Consumables',   30,  'Gulf Medical Supplies', 28.50,  DATEADD(DAY, -200, CAST(GETDATE() AS DATE)), 9),
(3,  'Lidocaine 2% Cartridges',      'Anesthesia',    20,  'Dentsply Sirona',       135.00, DATEADD(DAY, -180, CAST(GETDATE() AS DATE)), 9),
(4,  'Composite Resin A2',           'Restorative',   10,  'Dentsply Sirona',       220.00, DATEADD(DAY, -180, CAST(GETDATE() AS DATE)), 9),
(5,  'Dental Mirrors',               'Instruments',   5,   'Hu-Friedy',             15.00,  DATEADD(DAY, -300, CAST(GETDATE() AS DATE)), 9),
(6,  'Explorer Probes',              'Instruments',   5,   'Hu-Friedy',             18.00,  DATEADD(DAY, -300, CAST(GETDATE() AS DATE)), 9),
(7,  'Extraction Forceps #150',      'Surgical',      3,   'Hu-Friedy',             310.00, DATEADD(DAY, -300, CAST(GETDATE() AS DATE)), 9),
(8,  'Ultrasonic Scaler Tips',       'Instruments',   10,  'Dentsply Sirona',       95.00,  DATEADD(DAY, -150, CAST(GETDATE() AS DATE)), 9),
(9,  'Round Burs (Assorted)',        'Consumables',   15,  'Komet',                 60.00,  DATEADD(DAY, -150, CAST(GETDATE() AS DATE)), 9),
(10, 'Alginate Impression Material', 'Restorative',   10,  'Zhermack',              48.00,  DATEADD(DAY, -220, CAST(GETDATE() AS DATE)), 9),
(11, 'Suture Kit 4-0',               'Surgical',      5,   'Ethicon',               75.00,  DATEADD(DAY, -150, CAST(GETDATE() AS DATE)), 9),
(12, 'Bonding Agent',                'Restorative',   8,   'Ivoclar Vivadent',      180.00, DATEADD(DAY, -120, CAST(GETDATE() AS DATE)), 9),
(13, 'Gutta-Percha Points',          'Endodontic',    10,  'Dentsply Sirona',       55.00,  DATEADD(DAY, -100, CAST(GETDATE() AS DATE)), 9),
(14, 'Sterilization Pouches',        'Sterilization', 100, 'Gulf Medical Supplies', 0.35,   DATEADD(DAY, -130, CAST(GETDATE() AS DATE)), 9),
(15, 'Chlorhexidine 0.12% Rinse',    'Medications',   10,  'Saudi Pharma Co.',      18.00,  DATEADD(DAY, -90,  CAST(GETDATE() AS DATE)), 9),
(16, 'Phosphor Imaging Plates',      'Imaging',       2,   'Carestream Dental',     420.00, DATEADD(DAY, -250, CAST(GETDATE() AS DATE)), 9),
-- 17 and 18 were deleted later (see Removed_Inventory_Items below)
(17, 'Prophy Angles (Disposable)',   'Consumables',   20,  'Gulf Medical Supplies', 0.90,   DATEADD(DAY, -260, CAST(GETDATE() AS DATE)), 9),
(18, 'Fluoride Varnish',             'Medications',   5,   'Saudi Pharma Co.',      65.00,  DATEADD(DAY, -260, CAST(GETDATE() AS DATE)), 9);
SET IDENTITY_INSERT Inventory_Items OFF;

-- Low stock: 8 (6 left) and 11 (3 left). Out of stock: 15 (no batches).
-- Expiring within 30 days: batches 4 and 17. Expired: batch 13.
SET IDENTITY_INSERT Item_Batches ON;
INSERT INTO Item_Batches (batch_id, item_id, quantity_initial, quantity_remaining, expire_date, deposited_by, deposited_at) VALUES
(1,  1,  200, 150, DATEADD(DAY, 400, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-90,  '09:00')),
(2,  1,  100, 100, DATEADD(DAY, 500, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-20,  '09:00')),
(3,  2,  150, 120, DATEADD(DAY, 300, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-80,  '09:15')),
(4,  3,  50,  35,  DATEADD(DAY, 20,  CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-100, '09:30')),
(5,  3,  30,  30,  DATEADD(DAY, 200, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-60,  '09:30')),
(6,  4,  40,  22,  DATEADD(DAY, 250, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-70,  '10:00')),
(7,  5,  30,  30,  NULL,                                        9, dbo.seed_at(-150, '10:00')),
(8,  6,  25,  24,  NULL,                                        9, dbo.seed_at(-150, '10:05')),
(9,  7,  12,  12,  NULL,                                        9, dbo.seed_at(-150, '10:10')),
(10, 8,  15,  6,   NULL,                                        9, dbo.seed_at(-100, '10:00')),
(11, 9,  60,  41,  DATEADD(DAY, 700, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-90,  '10:30')),
(12, 10, 25,  25,  DATEADD(DAY, 60,  CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-40,  '11:00')),
(13, 10, 10,  4,   DATEADD(DAY, -5,  CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-200, '11:00')),
(14, 11, 10,  3,   DATEADD(DAY, 180, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-110, '11:30')),
(15, 12, 35,  30,  DATEADD(DAY, 150, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-50,  '12:00')),
(16, 13, 40,  33,  DATEADD(DAY, 900, CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-45,  '12:00')),
(17, 14, 500, 260, DATEADD(DAY, 10,  CAST(GETDATE() AS DATE)), 9, dbo.seed_at(-120, '12:30')),
(18, 16, 4,   4,   NULL,                                        9, dbo.seed_at(-250, '12:30'));
SET IDENTITY_INSERT Item_Batches OFF;

-- requested_by: 7 = lab technician, 8 = dental assistant; approved_by = inventory manager (user 9)
SET IDENTITY_INSERT Inventory_Requests ON;
INSERT INTO Inventory_Requests
    (request_id, item_id, requested_by, quantity, approved_quantity, status, notes, rejection_feedback, approved_by, created_at, modified_at, processed_at)
VALUES
(1,  1,  8, 30, 30,   'Approved', 'Gloves for Clinic C-03',                         NULL, 9,    dbo.seed_at(-31, '10:00'), dbo.seed_at(-30, '09:00'), dbo.seed_at(-30, '09:00')),
(2,  3,  8, 15, 15,   'Approved', 'Anaesthetic for the oral surgery list',          NULL, 9,    dbo.seed_at(-26, '10:00'), dbo.seed_at(-25, '09:00'), dbo.seed_at(-25, '09:00')),
(3,  4,  7, 10, 8,    'Approved', 'Composite for lab repairs',                      NULL, 9,    dbo.seed_at(-16, '10:00'), dbo.seed_at(-15, '09:00'), dbo.seed_at(-15, '09:00')),
(4,  8,  8, 9,  9,    'Approved', 'Replacement scaler tips for the perio clinic',   NULL, 9,    dbo.seed_at(-13, '10:00'), dbo.seed_at(-12, '09:00'), dbo.seed_at(-12, '09:00')),
(5,  11, 8, 7,  7,    'Approved', 'Sutures for extraction cases',                   NULL, 9,    dbo.seed_at(-9,  '10:00'), dbo.seed_at(-8,  '09:00'), dbo.seed_at(-8,  '09:00')),
(6,  14, 8, 40, 40,   'Approved', 'Pouches for the sterilization room',             NULL, 9,    dbo.seed_at(-5,  '10:00'), dbo.seed_at(-4,  '09:00'), dbo.seed_at(-4,  '09:00')),
(7,  7,  8, 2,  NULL, 'Rejected', 'Extra forceps for Clinic C-05',
     'Forceps are reusable; please send the current set for sterilization.',  NULL, dbo.seed_at(-7,  '10:00'), dbo.seed_at(-6,  '09:00'), dbo.seed_at(-6,  '09:00')),
(8,  1,  7, 50, NULL, 'Pending',  'The lab is running low on gloves',               NULL, NULL, dbo.seed_at(-1,  '13:00'), NULL, NULL),
(9,  10, 8, 10, NULL, 'Pending',  'Alginate for tomorrow''s impressions',           NULL, NULL, DATEADD(HOUR, -2, GETUTCDATE()), NULL, NULL),
(10, 15, 8, 5,  NULL, 'Pending',  'Chlorhexidine rinse for periodontal patients',   NULL, NULL, dbo.seed_at(-2,  '11:00'), NULL, NULL);
SET IDENTITY_INSERT Inventory_Requests OFF;

INSERT INTO Stock_Transactions (item_id, user_id, transaction_type, quantity, notes, time_stamp) VALUES
-- deposits (one per batch)
(1,  9, 'Deposit',  200, 'Manual deposit',      dbo.seed_at(-90,  '09:00')),
(1,  9, 'Deposit',  100, 'Manual deposit',      dbo.seed_at(-20,  '09:00')),
(2,  9, 'Deposit',  150, 'Manual deposit',      dbo.seed_at(-80,  '09:15')),
(3,  9, 'Deposit',  50,  'Manual deposit',      dbo.seed_at(-100, '09:30')),
(3,  9, 'Deposit',  30,  'Manual deposit',      dbo.seed_at(-60,  '09:30')),
(4,  9, 'Deposit',  40,  'Manual deposit',      dbo.seed_at(-70,  '10:00')),
(5,  9, 'Deposit',  30,  'Manual deposit',      dbo.seed_at(-150, '10:00')),
(6,  9, 'Deposit',  25,  'Manual deposit',      dbo.seed_at(-150, '10:05')),
(7,  9, 'Deposit',  12,  'Manual deposit',      dbo.seed_at(-150, '10:10')),
(8,  9, 'Deposit',  15,  'Manual deposit',      dbo.seed_at(-100, '10:00')),
(9,  9, 'Deposit',  60,  'Manual deposit',      dbo.seed_at(-90,  '10:30')),
(10, 9, 'Deposit',  25,  'Manual deposit',      dbo.seed_at(-40,  '11:00')),
(10, 9, 'Deposit',  10,  'Manual deposit',      dbo.seed_at(-200, '11:00')),
(11, 9, 'Deposit',  10,  'Manual deposit',      dbo.seed_at(-110, '11:30')),
(12, 9, 'Deposit',  35,  'Manual deposit',      dbo.seed_at(-50,  '12:00')),
(13, 9, 'Deposit',  40,  'Manual deposit',      dbo.seed_at(-45,  '12:00')),
(14, 9, 'Deposit',  500, 'Manual deposit',      dbo.seed_at(-120, '12:30')),
(16, 9, 'Deposit',  4,   'Manual deposit',      dbo.seed_at(-250, '12:30')),
-- manual withdrawals
(1,  9, 'Withdraw', 20,  'Manual withdrawal',   dbo.seed_at(-60,  '14:00')),
(2,  9, 'Withdraw', 30,  'Manual withdrawal',   dbo.seed_at(-50,  '14:00')),
(4,  9, 'Withdraw', 10,  'Manual withdrawal',   dbo.seed_at(-40,  '14:00')),
(6,  9, 'Withdraw', 1,   'Manual withdrawal',   dbo.seed_at(-100, '14:00')),
(9,  9, 'Withdraw', 19,  'Manual withdrawal',   dbo.seed_at(-45,  '14:00')),
(10, 9, 'Withdraw', 6,   'Manual withdrawal',   dbo.seed_at(-30,  '14:00')),
(12, 9, 'Withdraw', 5,   'Manual withdrawal',   dbo.seed_at(-20,  '14:00')),
(13, 9, 'Withdraw', 7,   'Manual withdrawal',   dbo.seed_at(-10,  '14:00')),
(14, 9, 'Withdraw', 200, 'Manual withdrawal',   dbo.seed_at(-60,  '14:30')),
-- approved and rejected requests
(1,  9, 'Withdraw', 30,  'Request #1 approved', dbo.seed_at(-30,  '09:00')),
(3,  9, 'Withdraw', 15,  'Request #2 approved', dbo.seed_at(-25,  '09:00')),
(4,  9, 'Withdraw', 8,   'Request #3 approved', dbo.seed_at(-15,  '09:00')),
(8,  9, 'Withdraw', 9,   'Request #4 approved', dbo.seed_at(-12,  '09:00')),
(11, 9, 'Withdraw', 7,   'Request #5 approved', dbo.seed_at(-8,   '09:00')),
(14, 9, 'Withdraw', 40,  'Request #6 approved', dbo.seed_at(-4,   '09:00')),
(7,  9, 'Reject',   0,   'Request #7 rejected', dbo.seed_at(-6,   '09:00'));

-- Items 17 and 18 were removed from the catalogue. Deleting them keeps the
-- identity counter past 18, so new items never reuse a removed item's id.
INSERT INTO Removed_Inventory_Items (item_id, item_name, category, removed_by, removal_reason, quantity_removed, removed_at) VALUES
(17, 'Prophy Angles (Disposable)', 'Consumables', 9, 'Expired',      25, dbo.seed_at(-15, '15:00')),
(18, 'Fluoride Varnish',           'Medications', 9, 'Out of Stock', 0,  dbo.seed_at(-40, '15:00'));
DELETE FROM Inventory_Items WHERE item_id IN (17, 18);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================
SET IDENTITY_INSERT Tickets ON;
INSERT INTO Tickets (ticket_id, user_id, ticket_type_id, details, status, created_at, updated_at) VALUES
(1, 2, 1, N'The dental chart takes several seconds to load for patients with a long visit history.',        'In Progress', DATEADD(DAY, -6,  GETDATE()), DATEADD(DAY, -5,  GETDATE())),
(2, 8, 3, N'How do I request an item that is currently out of stock?',                                       'Resolved',    DATEADD(DAY, -12, GETDATE()), DATEADD(DAY, -11, GETDATE())),
(3, 4, 2, N'My write access to patient file 10004 expired before I finished my notes. Can it be extended?',  'Open',        DATEADD(DAY, -1,  GETDATE()), DATEADD(DAY, -1,  GETDATE())),
(4, 6, 5, N'Could the system send SMS reminders to patients the day before their appointment?',              'Open',        DATEADD(DAY, -3,  GETDATE()), DATEADD(DAY, -3,  GETDATE())),
(5, 7, 5, N'Please add "Bleaching tray" to the list of lab services.',                                       'Resolved',    DATEADD(DAY, -22, GETDATE()), DATEADD(DAY, -21, GETDATE()));
SET IDENTITY_INSERT Tickets OFF;

INSERT INTO Ticket_Messages (ticket_id, sender_user_id, message_text, is_resolution_note, created_at) VALUES
(1, 1, N'Thanks for the report. We can reproduce it and are optimizing the query.',                                                   0, DATEADD(DAY, -5,  GETDATE())),
(2, 1, N'Open Inventory > Request Item and choose the item. The inventory manager is notified even when the stock is zero.',          1, DATEADD(DAY, -11, GETDATE())),
(5, 1, N'Done. "Bleaching tray" is now available in the lab service list.',                                                            1, DATEADD(DAY, -21, GETDATE()));

-- ============================================================
-- NOTIFICATIONS (a few unread ones for every role)
-- ============================================================
INSERT INTO Notifications (user_id, type, title, message, link_to, related_entity_type, related_entity_id, is_read, read_at, created_at) VALUES
(1,  'ticket.created',                         N'New support ticket',            N'A new access request ticket was submitted.',                        N'/admin/tickets/3',                              N'Tickets',            3,  0, NULL,                         DATEADD(DAY, -1, GETDATE())),
(1,  'ticket.created',                         N'New support ticket',            N'A new feature request ticket was submitted.',                       N'/admin/tickets/4',                              N'Tickets',            4,  1, DATEADD(DAY, -2, GETDATE()),  DATEADD(DAY, -3, GETDATE())),
(2,  'academic.submission.new',                N'New submission to review',      N'Saleh Al-Amri submitted a diagnosis and a treatment for review.',   N'/doctor/evaluations',                           N'Diagnosis',          14, 0, NULL,                         DATEADD(MINUTE, -60, GETDATE())),
(2,  'appointment.checked_in',                 N'Patient checked in',            N'Your patient has arrived and been checked in.',                     N'/doctor/appointments',                          N'Appointments',       29, 0, NULL,                         DATEADD(MINUTE, -30, GETDATE())),
(2,  'lab.response.posted',                    N'Lab response posted',           N'The lab posted a response to your request #1.',                     N'/doctor/lab/requests/1',                        N'Lab_Requests',       1,  1, DATEADD(DAY, -40, GETDATE()), DATEADD(DAY, -40, GETDATE())),
(3,  'academic.submission.new',                N'New submission to review',      N'Mona Al-Zahrani submitted a diagnosis for review.',                 N'/doctor/evaluations',                           N'Diagnosis',          12, 0, NULL,                         DATEADD(DAY, -18, GETDATE())),
(3,  'appointment.checked_in',                 N'Patient checked in',            N'Your patient has arrived and been checked in.',                     N'/doctor/appointments',                          N'Appointments',       33, 0, NULL,                         DATEADD(MINUTE, -20, GETDATE())),
(4,  'academic.submission.revision_requested', N'Revision requested',            N'Dr. Ahmed Al-Qahtani asked for changes to your diagnosis.',         N'/student/notes',                                N'Diagnosis',          6,  0, NULL,                         DATEADD(DAY, -6, GETDATE())),
(4,  'academic.submission.approved',           N'Submission approved',           N'Your root canal treatment note was approved.',                      N'/student/notes',                                N'Treatment',          5,  1, DATEADD(DAY, -49, GETDATE()), DATEADD(DAY, -49, GETDATE())),
(5,  'academic.submission.approved',           N'Submission approved',           N'Your follow-up diagnosis was approved.',                            N'/student/notes',                                N'Diagnosis',          13, 0, NULL,                         DATEADD(HOUR, -2, GETDATE())),
(5,  'academic.submission.rejected',           N'Submission rejected',           N'Your scaling treatment note was rejected. See the feedback.',       N'/student/notes',                                N'Treatment',          12, 1, DATEADD(DAY, -69, GETDATE()), DATEADD(DAY, -69, GETDATE())),
(6,  'appointment.no_show',                    N'Appointment no-show recorded',  N'A patient did not attend their scheduled appointment.',             N'/receptionist/appointments',                    N'Appointments',       12, 1, DATEADD(DAY, -14, GETDATE()), DATEADD(DAY, -14, GETDATE())),
(7,  'lab.request.created',                    N'New lab request submitted',     N'A new lab request requires your attention.',                        N'/lab/requests/4',                               N'Lab_Requests',       4,  0, NULL,                         DATEADD(DAY, -4, GETDATE())),
(7,  'lab.request.created',                    N'New lab request submitted',     N'A new lab request requires your attention.',                        N'/lab/requests/3',                               N'Lab_Requests',       3,  0, NULL,                         DATEADD(DAY, -1, GETDATE())),
(8,  'inventory.request.approved',             N'Inventory request approved',    N'Your request for Sterilization Pouches was approved.',              NULL,                                             N'Inventory_Requests', 6,  1, DATEADD(DAY, -4, GETDATE()),  DATEADD(DAY, -4, GETDATE())),
(8,  'inventory.request.rejected',             N'Inventory request rejected',    N'Your request for Extraction Forceps #150 was rejected.',            NULL,                                             N'Inventory_Requests', 7,  0, NULL,                         DATEADD(DAY, -6, GETDATE())),
(9,  'inventory.request.created',              N'New inventory request',         N'A new item request is waiting for your approval.',                  N'/inventory-manager/requests',                   N'Inventory_Requests', 8,  0, NULL,                         DATEADD(DAY, -1, GETDATE())),
(9,  'inventory.request.created',              N'New inventory request',         N'A new item request is waiting for your approval.',                  N'/inventory-manager/requests',                   N'Inventory_Requests', 9,  0, NULL,                         DATEADD(HOUR, -2, GETDATE())),
(9,  'inventory.low_stock',                    N'Low stock',                     N'Suture Kit 4-0 is below its low-stock limit.',                      N'/inventory-manager/inventory?filter=low-stock', N'Inventory_Items',    11, 0, NULL,                         DATEADD(DAY, -8, GETDATE())),
(9,  'inventory.item_expiring',                N'Item expiring soon',            N'A batch of Sterilization Pouches expires within 30 days.',          N'/inventory-manager/inventory?filter=expiring',  N'Inventory_Items',    14, 0, NULL,                         DATEADD(DAY, -2, GETDATE())),
(10, 'screening.request.created',              N'New screening request',         N'A radiograph was requested for a patient seen today.',              N'/radiologist/patients/12',                      N'ScreeningRequest',   1,  0, NULL,                         DATEADD(HOUR, -3, GETDATE())),
(10, 'screening.request.created',              N'New screening request',         N'A radiograph was requested for a patient seen today.',              N'/radiologist/patients/3',                       N'ScreeningRequest',   2,  0, NULL,                         DATEADD(HOUR, -3, GETDATE()));

-- ============================================================
-- SELF-REGISTRATIONS waiting for admin approval
-- ============================================================
SET IDENTITY_INSERT Pending_Registrations ON;
INSERT INTO Pending_Registrations
    (registration_id, first_name, middle_name, last_name, civil_id, requested_role_id, password_hash, status,
     submitted_at, reviewed_by, reviewed_at, rejection_reason)
VALUES
(1, 'Faisal', 'Omar',  'Al-Mutairi',  '1099887766', 3, @pw, 'Pending',  DATEADD(DAY, -1, GETUTCDATE()),   NULL, NULL, NULL),
(2, 'Nora',   'Saleh', 'Al-Qahtani',  '1088776655', 6, @pw, 'Pending',  DATEADD(HOUR, -3, GETUTCDATE()),  NULL, NULL, NULL),
(3, 'Majed',  'Ali',   'Al-Zahrani',  '1077665544', 2, @pw, 'Rejected', DATEADD(DAY, -12, GETUTCDATE()),  1,    DATEADD(DAY, -10, GETUTCDATE()),
    'Doctor accounts are created by the college administration.');
SET IDENTITY_INSERT Pending_Registrations OFF;

INSERT INTO Pending_Registration_Contacts (registration_id, contact_type, value, is_primary) VALUES
(1, 'Email',  'faisal.mutairi@example.com', 1),
(1, 'Mobile', '0500004001',                 0),
(2, 'Email',  'nora.qahtani@example.com',   1),
(2, 'Mobile', '0500004002',                 0),
(3, 'Email',  'majed.zahrani@example.com',  1);

-- ============================================================
-- AUDIT LOG (recent activity for the admin history page)
-- ============================================================
INSERT INTO Audit_Log (user_id, patient_id, event_type, event_description, details, operation_status, [timestamp]) VALUES
(7,  NULL, 'Login',                 'User logged in',                      'Samer Al-Ghamdi (LabTechnician) logged in successfully',   'Success', dbo.seed_at(-1,   '08:05')),
(9,  NULL, 'Login',                 'User logged in',                      'Fahad Al-Malki (InventoryManager) logged in successfully', 'Success', dbo.seed_at(-1,   '08:10')),
(1,  NULL, 'Ticket_Update',         'Ticket resolved',                     'Ticket #5 resolved',                                       'Success', dbo.seed_at(-21,  '10:00')),
(1,  NULL, 'Ticket_Update',         'Ticket resolved',                     'Ticket #2 resolved',                                       'Success', dbo.seed_at(-11,  '10:00')),
(1,  NULL, 'REGISTRATION_REJECTED', 'Admin rejected pending registration', 'Admin rejected pending registration',                      'Success', dbo.seed_at(-10,  '11:00')),
(2,  NULL, 'Academic_Review',       'Doctor reviewed student submission',  'Diagnosis #6 Revision_Requested',                          'Success', dbo.seed_at(-6,   '09:00')),
(6,  12,   'Patient_Create',        'New patient registered',              'New patient registered: Yousef Al-Anazi (File #10012)',    'Success', dbo.seed_at(-5,   '08:40')),
(6,  NULL, 'Appointment_Create',    'Appointment scheduled',               'Appointment scheduled for patient #12',                    'Success', dbo.seed_at(-5,   '08:45')),
(4,  12,   'Diagnosis_Create',      'Diagnosis submitted',                 'Diagnosis for patient #12: Cavity',                        'Success', dbo.seed_at(-5,   '09:35')),
(6,  NULL, 'Ticket_Create',         'Ticket submitted',                    'New ticket submitted by user #6',                          'Success', dbo.seed_at(-3,   '12:00')),
(6,  NULL, 'Patient_Update',        'Patient phone number updated',        'Patient #10 phone number updated',                         'Failure', dbo.seed_at(-2,   '13:15')),
(4,  NULL, 'Ticket_Create',         'Ticket submitted',                    'New ticket submitted by user #4',                          'Success', dbo.seed_at(-1,   '16:00')),
(6,  NULL, 'Login',                 'User logged in',                      'Reem Al-Shahrani (Receptionist) logged in successfully',   'Success', dbo.seed_at(0,    '07:45')),
(1,  NULL, 'Login',                 'User logged in',                      'Sara Al-Otaibi (Admin) logged in successfully',            'Success', dbo.seed_at(0,    '07:55')),
(2,  NULL, 'Login',                 'User logged in',                      'Ahmed Al-Qahtani (Doctor) logged in successfully',         'Success', dbo.seed_at(0,    '08:02')),
(3,  NULL, 'Academic_Review',       'Doctor reviewed student submission',  'Diagnosis #13 Approved',                                   'Success', dbo.seed_at(0,    '08:10')),
(6,  NULL, 'APPT_ARRIVAL_MARKED',   'Patient arrival status recorded',     'Appointment #27 arrival set to On Time',                   'Success', dbo.seed_at(0,    '08:25')),
(6,  NULL, 'APPT_ARRIVAL_MARKED',   'Patient arrival status recorded',     'Appointment #32 arrival set to On Time',                   'Success', dbo.seed_at(0,    '09:00')),
(6,  NULL, 'APPT_ARRIVAL_MARKED',   'Patient arrival status recorded',     'Appointment #28 arrival set to Late',                      'Success', dbo.seed_at(0,    '09:37')),
(6,  NULL, 'APPT_ARRIVAL_MARKED',   'Patient arrival status recorded',     'Appointment #33 arrival set to Late',                      'Success', dbo.seed_at(0,    '10:42')),
(6,  NULL, 'APPT_ARRIVAL_MARKED',   'Patient arrival status recorded',     'Appointment #29 arrival set to On Time',                   'Success', dbo.seed_at(0,    '10:50'));

COMMIT TRANSACTION;
GO

DROP FUNCTION dbo.seed_at;
GO
