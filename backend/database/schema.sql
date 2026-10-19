-- ============================================================
-- Dental HIS: database schema (Microsoft SQL Server, T-SQL)
--
-- Creates every table, constraint and index in an empty database.
-- Run it with `npm run db:reset` (see database/reset-db.js), or
-- manually against an empty database followed by the seed files.
-- Tables are ordered so that every foreign key points backwards.
-- ============================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================
-- 1. ACCESS CONTROL: roles, users, sessions
-- ============================================================

CREATE TABLE Roles (
    role_id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    role_name        VARCHAR(100)      NOT NULL CONSTRAINT UQ_Roles_Name UNIQUE,
    role_description VARCHAR(255)      NOT NULL
);
GO

CREATE TABLE Users (
    user_id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    role_id        INT               NOT NULL,
    email          VARCHAR(255)      NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    password       VARCHAR(255)      NOT NULL, -- bcrypt hash
    created_at     DATETIME          NOT NULL CONSTRAINT DF_Users_created_at DEFAULT GETUTCDATE(),
    last_login     DATETIME          NOT NULL,
    account_status VARCHAR(20)       NOT NULL,

    CONSTRAINT FK_Users_Roles         FOREIGN KEY (role_id) REFERENCES Roles(role_id),
    CONSTRAINT CK_Users_AccountStatus CHECK (account_status IN ('Active', 'Inactive', 'Suspended'))
);
GO

-- One row per login; the refresh token is stored only as a SHA-256 hash.
CREATE TABLE User_Sessions (
    session_id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_User_Sessions PRIMARY KEY,
    user_id            INT               NOT NULL,
    refresh_token_hash VARCHAR(255)      NOT NULL,
    last_activity_at   DATETIME          NOT NULL CONSTRAINT DF_UserSessions_LastActivity DEFAULT GETUTCDATE(),
    expires_at         DATETIME          NOT NULL,
    ip_address         VARCHAR(45)       NULL,
    user_agent         VARCHAR(500)      NULL,
    revoked_at         DATETIME          NULL, -- NULL = active; set on logout
    created_at         DATETIME          NOT NULL CONSTRAINT DF_UserSessions_CreatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT FK_UserSessions_User FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_UserSessions_Active ON User_Sessions(last_activity_at, revoked_at) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IX_UserSessions_TokenHash ON User_Sessions(refresh_token_hash);
CREATE INDEX IX_UserSessions_UserId ON User_Sessions(user_id);
GO

-- ============================================================
-- 2. STAFF, STUDENTS AND CLINICS
-- ============================================================

CREATE TABLE Employee (
    employee_id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employee PRIMARY KEY,
    user_id          INT               NOT NULL,
    first_name       VARCHAR(100)      NOT NULL,
    middle_name      VARCHAR(100)      NOT NULL,
    last_name        VARCHAR(100)      NOT NULL,
    specialization   VARCHAR(100)      NOT NULL,
    hire_date        DATE              NOT NULL,
    termination_date DATE              NULL,
    deleted_at       DATETIME          NULL,

    CONSTRAINT FK_Employee_Users FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
GO

-- A user has at most one active (not soft-deleted) employee profile.
CREATE UNIQUE INDEX UX_Employee_UserId_Active ON Employee(user_id) WHERE deleted_at IS NULL;
GO

CREATE TABLE Manager (
    manager_id  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Manager PRIMARY KEY,
    employee_id INT               NOT NULL,
    start_date  DATE              NOT NULL,
    end_date    DATE              NULL, -- NULL = current manager

    CONSTRAINT FK_Manager_Employee FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
);
GO

CREATE TABLE Clinic (
    clinic_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Clinic PRIMARY KEY,
    manager_id  INT               NOT NULL,
    clinic_name VARCHAR(150)      NOT NULL CONSTRAINT UQ_Clinic_Name UNIQUE,

    CONSTRAINT FK_Clinic_Manager FOREIGN KEY (manager_id) REFERENCES Manager(manager_id)
);
GO

-- Dental students; employee_id is the supervising doctor.
CREATE TABLE Student (
    academic_id    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Student PRIMARY KEY,
    user_id        INT               NOT NULL,
    employee_id    INT               NOT NULL,
    first_name     VARCHAR(100)      NOT NULL,
    middle_name    VARCHAR(100)      NOT NULL,
    last_name      VARCHAR(100)      NOT NULL,
    academic_level INT               NOT NULL,

    CONSTRAINT FK_Student_Users    FOREIGN KEY (user_id)     REFERENCES Users(user_id),
    CONSTRAINT FK_Student_Employee FOREIGN KEY (employee_id) REFERENCES Employee(employee_id)
);
GO

-- Clinical divisions of the college (Orthodontics, Endodontics, ...).
CREATE TABLE Sections (
    section_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Sections PRIMARY KEY,
    section_name VARCHAR(100)      NOT NULL CONSTRAINT UQ_Sections_Name UNIQUE,
    description  VARCHAR(500)      NULL,
    is_active    BIT               NOT NULL CONSTRAINT DF_Sections_IsActive DEFAULT 1
);
GO

-- Many-to-many: an employee can belong to several sections.
CREATE TABLE Employee_Section (
    employee_id INT NOT NULL,
    section_id  INT NOT NULL,
    is_primary  BIT NOT NULL CONSTRAINT DF_EmpSec_IsPrimary DEFAULT 0,

    CONSTRAINT PK_Employee_Section PRIMARY KEY (employee_id, section_id),
    CONSTRAINT FK_EmpSec_Employee  FOREIGN KEY (employee_id) REFERENCES Employee(employee_id),
    CONSTRAINT FK_EmpSec_Section   FOREIGN KEY (section_id)  REFERENCES Sections(section_id)
);
GO

CREATE INDEX IX_EmpSec_Section ON Employee_Section(section_id);
GO

-- Weekly working hours per doctor (day_of_week: 0 = Sunday ... 6 = Saturday).
CREATE TABLE Doctor_Availability (
    availability_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Doctor_Availability PRIMARY KEY,
    doctor_id       INT               NOT NULL,
    day_of_week     TINYINT           NOT NULL,
    start_time      TIME              NOT NULL,
    end_time        TIME              NOT NULL,
    is_active       BIT               NOT NULL CONSTRAINT DF_DocAvail_IsActive DEFAULT 1,

    CONSTRAINT FK_DocAvail_Employee  FOREIGN KEY (doctor_id) REFERENCES Employee(employee_id),
    CONSTRAINT UQ_DocAvail_DayDoctor UNIQUE (doctor_id, day_of_week),
    CONSTRAINT CK_DocAvail_DayOfWeek CHECK (day_of_week BETWEEN 0 AND 6)
);
GO

-- ============================================================
-- 3. PATIENTS AND CONTACT DETAILS
-- ============================================================

CREATE TABLE Patients (
    patient_id    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Patients PRIMARY KEY,
    file_number   INT               NOT NULL CONSTRAINT UQ_Patients_FileNumber UNIQUE,
    academic_id   INT               NULL, -- optional assigned student (unique when set, see index below)
    national_id   INT               NOT NULL CONSTRAINT UQ_Patients_NationalId UNIQUE,
    first_name    VARCHAR(100)      NOT NULL,
    middle_name   VARCHAR(100)      NOT NULL,
    last_name     VARCHAR(100)      NOT NULL,
    date_of_birth DATE              NOT NULL,
    gender        VARCHAR(10)       NOT NULL,
    created_at    DATETIME          NOT NULL CONSTRAINT DF_Patients_CreatedAt DEFAULT GETDATE(),
    deleted_at    DATETIME          NULL,

    CONSTRAINT CK_Patients_Gender CHECK (gender IN ('Male', 'Female'))
);
GO

CREATE UNIQUE INDEX UX_Patients_AcademicId ON Patients(academic_id) WHERE academic_id IS NOT NULL;
GO

-- Phone/email rows owned by exactly one employee, student or patient.
CREATE TABLE Contact_Information (
    contact_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Contact_Information PRIMARY KEY,
    employee_id  INT               NULL,
    student_id   INT               NULL, -- Student.academic_id
    patient_id   INT               NULL,
    owner_type   VARCHAR(20)       NOT NULL,
    phone_number VARCHAR(20)       NULL,
    email        VARCHAR(255)      NULL,
    contact_type VARCHAR(50)       NOT NULL,

    CONSTRAINT FK_Contact_Employee FOREIGN KEY (employee_id) REFERENCES Employee(employee_id),
    CONSTRAINT FK_Contact_Student  FOREIGN KEY (student_id)  REFERENCES Student(academic_id),
    CONSTRAINT FK_Contact_Patient  FOREIGN KEY (patient_id)  REFERENCES Patients(patient_id),
    CONSTRAINT CK_Contact_OwnerType CHECK (owner_type IN ('Employee', 'Student', 'Patient')),
    CONSTRAINT CHK_Contact_Owner CHECK (
        employee_id IS NOT NULL OR
        student_id  IS NOT NULL OR
        patient_id  IS NOT NULL
    )
);
GO

-- Uniqueness is scoped per owner: one owner cannot list the same email or
-- phone twice, but family members may share them. NULLs are excluded so an
-- owner can have several rows that leave the email or the phone empty.
CREATE UNIQUE INDEX UX_Contact_Employee_Email ON Contact_Information(employee_id, email)        WHERE employee_id IS NOT NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX UX_Contact_Student_Email  ON Contact_Information(student_id, email)         WHERE student_id  IS NOT NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX UX_Contact_Patient_Email  ON Contact_Information(patient_id, email)         WHERE patient_id  IS NOT NULL AND email IS NOT NULL;
CREATE UNIQUE INDEX UX_Contact_Employee_Phone ON Contact_Information(employee_id, phone_number) WHERE employee_id IS NOT NULL AND phone_number IS NOT NULL;
CREATE UNIQUE INDEX UX_Contact_Student_Phone  ON Contact_Information(student_id, phone_number)  WHERE student_id  IS NOT NULL AND phone_number IS NOT NULL;
CREATE UNIQUE INDEX UX_Contact_Patient_Phone  ON Contact_Information(patient_id, phone_number)  WHERE patient_id  IS NOT NULL AND phone_number IS NOT NULL;
GO

-- The patient's file. Every appointment and clinical note hangs off a record.
CREATE TABLE Medical_Records (
    record_id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Medical_Records PRIMARY KEY,
    patient_id       INT               NOT NULL,
    chief_complaint  TEXT              NULL,
    chronic_diseases VARCHAR(500)      NULL,
    pain_score       TINYINT           NULL, -- 0-10, captured at intake
    allergies        VARCHAR(500)      NULL,
    deleted_at       DATETIME          NULL,

    CONSTRAINT FK_MedicalRecords_Patients  FOREIGN KEY (patient_id) REFERENCES Patients(patient_id),
    CONSTRAINT CK_MedicalRecords_PainScore CHECK (pain_score BETWEEN 0 AND 10)
);
GO

-- ============================================================
-- 4. SCHEDULING
-- ============================================================

CREATE TABLE Appointment_Type (
    type_id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Appointment_Type PRIMARY KEY,
    type_name     VARCHAR(100)      NOT NULL,
    duration      INT               NOT NULL, -- minutes
    section_id    INT               NULL,
    is_active     BIT               NOT NULL CONSTRAINT DF_ApptType_IsActive DEFAULT 1,
    display_order INT               NOT NULL CONSTRAINT DF_ApptType_DisplayOrder DEFAULT 0,

    CONSTRAINT FK_ApptType_Section FOREIGN KEY (section_id) REFERENCES Sections(section_id)
);
GO

CREATE INDEX IX_AppointmentType_Active_Order ON Appointment_Type(is_active, display_order);
GO

CREATE TABLE Appointments (
    appointment_id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Appointments PRIMARY KEY,
    patient_id             INT               NOT NULL,
    doctor_id              INT               NOT NULL, -- Employee.employee_id
    academic_id            INT               NULL,     -- treating student, if any
    clinic_id              INT               NULL,
    record_id              INT               NOT NULL,
    appointment_type_id    INT               NOT NULL,
    appointment_start_time DATETIME          NOT NULL, -- stored in UTC
    appointment_end_time   DATETIME          NOT NULL,
    status                 VARCHAR(20)       NOT NULL,
    booked_by              INT               NULL,     -- Users.user_id
    arrival_status         VARCHAR(20)       NULL,     -- set at check-in
    arrived_at             DATETIME          NULL,
    deleted_at             DATETIME          NULL,

    CONSTRAINT FK_Appt_Patient  FOREIGN KEY (patient_id)          REFERENCES Patients(patient_id),
    CONSTRAINT FK_Appt_Doctor   FOREIGN KEY (doctor_id)           REFERENCES Employee(employee_id),
    CONSTRAINT FK_Appt_Student  FOREIGN KEY (academic_id)         REFERENCES Student(academic_id),
    CONSTRAINT FK_Appt_Clinic   FOREIGN KEY (clinic_id)           REFERENCES Clinic(clinic_id),
    CONSTRAINT FK_Appt_Record   FOREIGN KEY (record_id)           REFERENCES Medical_Records(record_id),
    CONSTRAINT FK_Appt_Type     FOREIGN KEY (appointment_type_id) REFERENCES Appointment_Type(type_id),
    CONSTRAINT FK_Appt_BookedBy FOREIGN KEY (booked_by)           REFERENCES Users(user_id),
    CONSTRAINT CK_Appointments_Status CHECK (status IN ('Scheduled', 'Checked-In', 'In Progress', 'Completed', 'Canceled', 'No Show')),
    CONSTRAINT CHK_Appt_ArrivalStatus CHECK (arrival_status IN ('On Time', 'Late', 'No Show'))
);
GO

-- ============================================================
-- 5. CLINICAL RECORDS
-- ============================================================

-- Radiographs and photos uploaded by the radiologist.
CREATE TABLE Screening (
    image_id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Screening PRIMARY KEY,
    record_id      INT               NOT NULL,
    image_path     VARCHAR(500)      NOT NULL CONSTRAINT UQ_Screening_ImagePath UNIQUE,
    image_type     VARCHAR(100)      NOT NULL,
    tooth_numbers  VARCHAR(50)       NULL,
    notes          NVARCHAR(500)     NULL,
    uploaded_by    INT               NULL,
    appointment_id INT               NULL,
    uploaded_at    DATETIME          NOT NULL CONSTRAINT DF_Screening_uploaded_at DEFAULT GETUTCDATE(),
    deleted_at     DATETIME          NULL,

    CONSTRAINT FK_Screening_Records     FOREIGN KEY (record_id)      REFERENCES Medical_Records(record_id),
    CONSTRAINT FK_Screening_UploadedBy  FOREIGN KEY (uploaded_by)    REFERENCES Users(user_id),
    CONSTRAINT FK_Screening_Appointment FOREIGN KEY (appointment_id) REFERENCES Appointments(appointment_id),
    CONSTRAINT CK_Screening_ImageType CHECK (image_type IN (
        'Panoramic (OPG)', 'Periapical (PA)', 'Bitewing (BW)', 'Occlusal',
        'Cephalometric', 'CBCT', 'Intraoral Photo', 'Extraoral Photo'
    ))
);
GO

CREATE INDEX IX_Screening_Appointment ON Screening(appointment_id);
CREATE INDEX IX_Screening_Record_NotDeleted ON Screening(record_id, uploaded_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IX_Screening_Uploader_Date ON Screening(uploaded_by, uploaded_at);
GO

-- Doctors/students request images; requests are routed to a radiologist.
CREATE TABLE Screening_Requests (
    request_id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Screening_Requests PRIMARY KEY,
    record_id               INT               NOT NULL,
    patient_id              INT               NOT NULL,
    appointment_id          INT               NULL,
    requested_by_user_id    INT               NOT NULL,
    assigned_radiologist_id INT               NOT NULL, -- Employee.employee_id
    request_status          VARCHAR(20)       NOT NULL CONSTRAINT DF_ScrReq_Status DEFAULT 'Pending',
    requested_at            DATETIME          NOT NULL CONSTRAINT DF_ScrReq_RequestedAt DEFAULT GETUTCDATE(),
    completed_at            DATETIME          NULL,
    fulfilled_image_id      INT               NULL,

    CONSTRAINT FK_ScrReq_Record      FOREIGN KEY (record_id)               REFERENCES Medical_Records(record_id),
    CONSTRAINT FK_ScrReq_Patient     FOREIGN KEY (patient_id)              REFERENCES Patients(patient_id),
    CONSTRAINT FK_ScrReq_Appointment FOREIGN KEY (appointment_id)          REFERENCES Appointments(appointment_id),
    CONSTRAINT FK_ScrReq_Requester   FOREIGN KEY (requested_by_user_id)    REFERENCES Users(user_id),
    CONSTRAINT FK_ScrReq_Radiologist FOREIGN KEY (assigned_radiologist_id) REFERENCES Employee(employee_id),
    CONSTRAINT FK_ScrReq_Image       FOREIGN KEY (fulfilled_image_id)      REFERENCES Screening(image_id),
    CONSTRAINT CHK_ScrReq_Status CHECK (request_status IN ('Pending', 'Completed', 'Cancelled'))
);
GO

CREATE INDEX IX_ScrReq_Radiologist_Status_Date ON Screening_Requests(assigned_radiologist_id, request_status, requested_at);
GO

-- Student diagnoses start as 'Submitted' and go through supervisor review;
-- doctor-authored diagnoses are inserted as 'Approved'.
CREATE TABLE Diagnosis (
    diagnosis_id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Diagnosis PRIMARY KEY,
    record_id             INT               NOT NULL,
    appointment_id        INT               NULL,
    authored_by_student   INT               NULL, -- Student.academic_id
    authored_by_doctor    INT               NULL, -- Employee.employee_id
    reviewed_by           INT               NULL, -- Employee.employee_id
    tooth_number          VARCHAR(10)       NULL,
    diagnosis_type        VARCHAR(100)      NOT NULL,
    clinical_findings     TEXT              NOT NULL,
    radiographic_findings TEXT              NOT NULL,
    progress_note         TEXT              NOT NULL,
    status                VARCHAR(20)       NOT NULL CONSTRAINT DF_Diagnosis_Status DEFAULT 'Submitted',
    doctor_feedback       TEXT              NULL,
    revision_count        INT               NOT NULL CONSTRAINT DF_Diagnosis_RevisionCount DEFAULT 0,
    submitted_at          DATETIME          NOT NULL CONSTRAINT DF_Diagnosis_SubmittedAt DEFAULT GETUTCDATE(),
    reviewed_at           DATETIME          NULL,
    created_at            DATETIME          NULL CONSTRAINT DF_Diagnosis_CreatedAt DEFAULT GETUTCDATE(),
    deleted_at            DATETIME          NULL,

    CONSTRAINT FK_Diagnosis_Record       FOREIGN KEY (record_id)           REFERENCES Medical_Records(record_id),
    CONSTRAINT FK_Diagnosis_Appointment  FOREIGN KEY (appointment_id)      REFERENCES Appointments(appointment_id),
    CONSTRAINT FK_Diagnosis_Student      FOREIGN KEY (authored_by_student) REFERENCES Student(academic_id),
    CONSTRAINT FK_Diagnosis_AuthorDoctor FOREIGN KEY (authored_by_doctor)  REFERENCES Employee(employee_id),
    CONSTRAINT FK_Diagnosis_ReviewedBy   FOREIGN KEY (reviewed_by)         REFERENCES Employee(employee_id),
    CONSTRAINT CK_Diagnosis_Status CHECK (status IN ('Submitted', 'Approved', 'Rejected', 'Revision_Requested'))
);
GO

CREATE INDEX IX_Diagnosis_Queue ON Diagnosis(status, authored_by_student, submitted_at) WHERE deleted_at IS NULL;
CREATE INDEX IX_Diagnosis_Appointment ON Diagnosis(appointment_id) WHERE deleted_at IS NULL;
GO

CREATE TABLE Prescriptions (
    prescription_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Prescriptions PRIMARY KEY,
    record_id       INT               NOT NULL,
    medicine_name   VARCHAR(255)      NOT NULL,
    dosage          VARCHAR(100)      NOT NULL,
    duration        VARCHAR(100)      NOT NULL,
    cost            DECIMAL(10,2)     NOT NULL,

    CONSTRAINT FK_Prescriptions_Record FOREIGN KEY (record_id) REFERENCES Medical_Records(record_id)
);
GO

-- Same review workflow as Diagnosis.
CREATE TABLE Treatment (
    treatment_id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Treatment PRIMARY KEY,
    record_id           INT               NOT NULL,
    appointment_id      INT               NULL,
    prescription_id     INT               NULL,
    authored_by_student INT               NULL, -- Student.academic_id
    authored_by_doctor  INT               NULL, -- Employee.employee_id
    approved_by_doctor  INT               NULL, -- Employee.employee_id, set on review
    treatment_type      VARCHAR(100)      NOT NULL,
    treatment_note      TEXT              NOT NULL,
    doctor_feedback     TEXT              NULL,
    status              VARCHAR(20)       NOT NULL CONSTRAINT DF_Treatment_Status DEFAULT 'Submitted',
    revision_count      INT               NOT NULL CONSTRAINT DF_Treatment_RevisionCount DEFAULT 0,
    submitted_at        DATETIME          NOT NULL CONSTRAINT DF_Treatment_SubmittedAt DEFAULT GETUTCDATE(),
    reviewed_at         DATETIME          NULL,
    deleted_at          DATETIME          NULL,

    CONSTRAINT FK_Treatment_Record         FOREIGN KEY (record_id)           REFERENCES Medical_Records(record_id),
    CONSTRAINT FK_Treatment_Appointment    FOREIGN KEY (appointment_id)      REFERENCES Appointments(appointment_id),
    CONSTRAINT FK_Treatment_Prescription   FOREIGN KEY (prescription_id)     REFERENCES Prescriptions(prescription_id),
    CONSTRAINT FK_Treatment_Student        FOREIGN KEY (authored_by_student) REFERENCES Student(academic_id),
    CONSTRAINT FK_Treatment_AuthorDoctor   FOREIGN KEY (authored_by_doctor)  REFERENCES Employee(employee_id),
    CONSTRAINT FK_Treatment_ApprovedDoctor FOREIGN KEY (approved_by_doctor)  REFERENCES Employee(employee_id),
    CONSTRAINT CK_Treatment_Status CHECK (status IN ('Submitted', 'Approved', 'Rejected', 'Revision_Requested'))
);
GO

CREATE INDEX IX_Treatment_Queue ON Treatment(status, authored_by_student, submitted_at) WHERE deleted_at IS NULL;
CREATE INDEX IX_Treatment_Appointment ON Treatment(appointment_id) WHERE deleted_at IS NULL;
GO

-- One note per tooth per visit, FDI notation (11-48).
CREATE TABLE Dental_Chart (
    note_id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Dental_Chart PRIMARY KEY,
    record_id           INT               NOT NULL,
    appointment_id      INT               NULL,
    tooth_number        VARCHAR(10)       NOT NULL,
    tooth_note          TEXT              NOT NULL,
    authored_by_student INT               NULL,
    authored_by_doctor  INT               NULL,
    created_at          DATETIME          NOT NULL CONSTRAINT DF_DentalChart_CreatedAt DEFAULT GETUTCDATE(),
    updated_at          DATETIME          NOT NULL CONSTRAINT DF_DentalChart_UpdatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT FK_DentalChart_Record      FOREIGN KEY (record_id)           REFERENCES Medical_Records(record_id),
    CONSTRAINT FK_DentalChart_Appointment FOREIGN KEY (appointment_id)      REFERENCES Appointments(appointment_id),
    CONSTRAINT FK_DentalChart_Student     FOREIGN KEY (authored_by_student) REFERENCES Student(academic_id),
    CONSTRAINT FK_DentalChart_Doctor      FOREIGN KEY (authored_by_doctor)  REFERENCES Employee(employee_id),
    CONSTRAINT CK_DentalChart_ToothNumber CHECK (tooth_number IN (
        '11','12','13','14','15','16','17','18',
        '21','22','23','24','25','26','27','28',
        '31','32','33','34','35','36','37','38',
        '41','42','43','44','45','46','47','48'
    ))
);
GO

CREATE INDEX IX_DentalChart_Appointment ON Dental_Chart(appointment_id);
GO

-- ============================================================
-- 6. ACADEMIC SUPERVISION
-- ============================================================

-- Append-only log of every review round on a student submission.
CREATE TABLE Review_History (
    history_id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Review_History PRIMARY KEY,
    submission_type VARCHAR(20)       NOT NULL,
    submission_id   INT               NOT NULL, -- Diagnosis or Treatment id
    round_number    INT               NOT NULL,
    reviewed_by     INT               NOT NULL,
    action          VARCHAR(20)       NOT NULL,
    feedback        TEXT              NULL,
    created_at      DATETIME          NOT NULL CONSTRAINT DF_ReviewHistory_CreatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT FK_ReviewHistory_Employee FOREIGN KEY (reviewed_by) REFERENCES Employee(employee_id),
    CONSTRAINT CK_ReviewHistory_Type   CHECK (submission_type IN ('Diagnosis', 'Treatment')),
    CONSTRAINT CK_ReviewHistory_Action CHECK (action IN ('Approved', 'Rejected', 'Revision_Requested', 'Resubmitted'))
);
GO

CREATE INDEX IX_ReviewHistory_Submission ON Review_History(submission_type, submission_id);
GO

-- One grade (0-10) per approved student submission.
CREATE TABLE Student_Grades (
    grade_id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_StudentGrades PRIMARY KEY,
    submission_type VARCHAR(20)       NOT NULL,
    submission_id   INT               NOT NULL,
    student_id      INT               NOT NULL, -- Student.academic_id
    graded_by       INT               NOT NULL, -- Employee.employee_id
    grade           INT               NOT NULL,
    feedback_note   NVARCHAR(500)     NULL,
    graded_at       DATETIME2         NOT NULL CONSTRAINT DF_StudentGrades_GradedAt DEFAULT GETDATE(),

    CONSTRAINT FK_StudentGrades_Student    FOREIGN KEY (student_id) REFERENCES Student(academic_id),
    CONSTRAINT FK_StudentGrades_GradedBy   FOREIGN KEY (graded_by)  REFERENCES Employee(employee_id),
    CONSTRAINT UQ_StudentGrades_Submission UNIQUE (submission_type, submission_id),
    CONSTRAINT CK_StudentGrades_Type  CHECK (submission_type IN ('Diagnosis', 'Treatment')),
    CONSTRAINT CK_StudentGrades_Grade CHECK (grade >= 0 AND grade <= 10)
);
GO

CREATE INDEX IX_StudentGrades_Student ON Student_Grades(student_id);
GO

-- 24-hour write access for a student to one patient file.
CREATE TABLE Student_Assignments (
    assignment_id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Student_Assignments PRIMARY KEY,
    student_id              INT               NOT NULL, -- Users.user_id of the student
    patient_id              INT               NOT NULL,
    assigned_at             DATETIME          NOT NULL CONSTRAINT DF_StudentAssignments_AssignedAt DEFAULT GETUTCDATE(),
    write_access_expires_at DATETIME          NOT NULL,
    access_type             VARCHAR(10)       NOT NULL CONSTRAINT DF_StudentAssignments_AccessType DEFAULT 'write',
    is_expired              BIT               NOT NULL CONSTRAINT DF_StudentAssignments_IsExpired DEFAULT 0,

    CONSTRAINT FK_StudentAssignments_User    FOREIGN KEY (student_id) REFERENCES Users(user_id),
    CONSTRAINT FK_StudentAssignments_Patient FOREIGN KEY (patient_id) REFERENCES Patients(patient_id),
    CONSTRAINT UQ_StudentAssignments_StudentPatient UNIQUE (student_id, patient_id),
    CONSTRAINT CK_StudentAssignments_AccessType CHECK (access_type IN ('write', 'read'))
);
GO

CREATE INDEX IX_StudentAssignments_Student ON Student_Assignments(student_id);
CREATE INDEX IX_StudentAssignments_Expiry ON Student_Assignments(write_access_expires_at) WHERE is_expired = 0;
GO

-- ============================================================
-- 7. DENTAL LAB
-- ============================================================

-- employee_id is the requesting (or supervising) doctor; student requests
-- wait for that doctor's approval before the lab can claim them.
CREATE TABLE Lab_Requests (
    lab_request_id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Lab_Requests PRIMARY KEY,
    employee_id         INT               NOT NULL,
    student_id          INT               NULL,
    patient_id          INT               NULL,
    appointment_id      INT               NULL,
    approved_by         INT               NOT NULL,
    tooth_number        NVARCHAR(20)      NULL,
    request_note        VARCHAR(500)      NOT NULL,
    request_status      VARCHAR(20)       NOT NULL,
    request_timestamp   DATETIME          NOT NULL CONSTRAINT DF_Lab_Requests_request_timestamp DEFAULT GETUTCDATE(),
    supervisor_feedback NVARCHAR(500)     NULL,
    reviewed_at         DATETIME          NULL,
    assigned_to         INT               NULL, -- lab technician who claimed it
    assigned_at         DATETIME          NULL,

    CONSTRAINT FK_LabReq_Employee        FOREIGN KEY (employee_id)    REFERENCES Employee(employee_id),
    CONSTRAINT FK_LabReq_Student         FOREIGN KEY (student_id)     REFERENCES Student(academic_id),
    CONSTRAINT FK_LabReq_Patient         FOREIGN KEY (patient_id)     REFERENCES Patients(patient_id),
    CONSTRAINT FK_LabRequests_Appointment FOREIGN KEY (appointment_id) REFERENCES Appointments(appointment_id),
    CONSTRAINT FK_LabReq_ApprovedBy      FOREIGN KEY (approved_by)    REFERENCES Employee(employee_id),
    CONSTRAINT FK_LabReq_AssignedTo      FOREIGN KEY (assigned_to)    REFERENCES Employee(employee_id),
    CONSTRAINT CHK_LabReq_Status CHECK (request_status IN ('Pending', 'Approved', 'Rejected', 'In Progress', 'Delivered'))
);
GO

CREATE INDEX IX_LabRequests_Appointment ON Lab_Requests(appointment_id);
CREATE INDEX IX_LabReq_AssignedTo ON Lab_Requests(assigned_to, request_status);
GO

CREATE TABLE Lab_Response (
    lab_response_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Lab_Response PRIMARY KEY,
    lab_request_id  INT               NOT NULL,
    response_note   VARCHAR(500)      NOT NULL,
    created_at      DATETIME          NOT NULL CONSTRAINT DF_LabResponse_CreatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT FK_LabResp_LabRequest FOREIGN KEY (lab_request_id) REFERENCES Lab_Requests(lab_request_id)
);
GO

-- ============================================================
-- 8. INVENTORY
-- ============================================================

-- Quantity on hand is not stored here: it is the sum of the item's batches.
CREATE TABLE Inventory_Items (
    item_id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Inventory_Items PRIMARY KEY,
    item_name       VARCHAR(255)      NOT NULL,
    category        VARCHAR(100)      NOT NULL,
    low_stock_limit INT               NOT NULL,
    supplier        VARCHAR(255)      NULL,
    unit_cost       DECIMAL(10,2)     NULL,
    register_date   DATE              NULL CONSTRAINT DF_Inventory_RegisterDate DEFAULT CAST(GETUTCDATE() AS DATE),
    assigned_by     INT               NULL,

    CONSTRAINT FK_Inventory_AssignedBy FOREIGN KEY (assigned_by) REFERENCES Users(user_id)
);
GO

-- Each deposit is a batch with its own expiry; withdrawals consume batches
-- first-expiring-first-out.
CREATE TABLE Item_Batches (
    batch_id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Item_Batches PRIMARY KEY,
    item_id            INT               NOT NULL,
    quantity_initial   INT               NOT NULL,
    quantity_remaining INT               NOT NULL,
    expire_date        DATE              NULL,
    deposited_by       INT               NOT NULL,
    deposited_at       DATETIME          NOT NULL CONSTRAINT DF_Batch_DepositedAt DEFAULT GETUTCDATE(),
    notes              VARCHAR(500)      NULL,

    CONSTRAINT FK_Batch_Item    FOREIGN KEY (item_id)      REFERENCES Inventory_Items(item_id) ON DELETE CASCADE,
    CONSTRAINT FK_Batch_User    FOREIGN KEY (deposited_by) REFERENCES Users(user_id),
    CONSTRAINT CHK_Batch_Initial  CHECK (quantity_initial > 0),
    CONSTRAINT CHK_Batch_NonNeg   CHECK (quantity_remaining >= 0),
    CONSTRAINT CHK_Batch_Remain   CHECK (quantity_remaining <= quantity_initial)
);
GO

CREATE INDEX IX_Batch_Item_Expire ON Item_Batches(item_id, expire_date) WHERE quantity_remaining > 0;
GO

-- transaction_type: 'Deposit', 'Withdraw' or 'Reject' (a rejected request, quantity 0).
CREATE TABLE Stock_Transactions (
    transaction_id   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Stock_Transactions PRIMARY KEY,
    item_id          INT               NOT NULL,
    user_id          INT               NOT NULL,
    transaction_type VARCHAR(50)       NOT NULL,
    quantity         INT               NOT NULL,
    notes            NVARCHAR(500)     NULL,
    time_stamp       DATETIME          NOT NULL CONSTRAINT DF_Stock_Transactions_time_stamp DEFAULT GETUTCDATE(),

    CONSTRAINT FK_StockTrans_Item FOREIGN KEY (item_id) REFERENCES Inventory_Items(item_id) ON DELETE CASCADE,
    CONSTRAINT FK_StockTrans_User FOREIGN KEY (user_id) REFERENCES Users(user_id)
);
GO

-- Item requests from assistants and lab technicians, approved by the inventory manager.
CREATE TABLE Inventory_Requests (
    request_id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Inventory_Requests PRIMARY KEY,
    item_id            INT               NOT NULL,
    requested_by       INT               NOT NULL,
    quantity           INT               NOT NULL,
    approved_quantity  INT               NULL,
    status             VARCHAR(20)       NOT NULL CONSTRAINT DF_InvReq_Status DEFAULT 'Pending',
    notes              NVARCHAR(500)     NULL,
    rejection_feedback NVARCHAR(500)     NULL,
    approved_by        INT               NULL,
    created_at         DATETIME          NOT NULL CONSTRAINT DF_InvReq_CreatedAt DEFAULT GETUTCDATE(),
    modified_at        DATETIME          NULL,
    processed_at       DATETIME          NULL,

    CONSTRAINT FK_InvReq_Item       FOREIGN KEY (item_id)      REFERENCES Inventory_Items(item_id) ON DELETE CASCADE,
    CONSTRAINT FK_InvReq_User       FOREIGN KEY (requested_by) REFERENCES Users(user_id),
    CONSTRAINT FK_InvReq_ApprovedBy FOREIGN KEY (approved_by)  REFERENCES Users(user_id),
    CONSTRAINT CK_InvReq_Status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);
GO

-- Snapshot of deleted items. No FK on item_id: the item row is gone by then.
CREATE TABLE Removed_Inventory_Items (
    removal_id       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Removed_Inventory_Items PRIMARY KEY,
    item_id          INT               NOT NULL,
    item_name        VARCHAR(255)      NOT NULL,
    category         VARCHAR(100)      NOT NULL,
    removed_by       INT               NOT NULL,
    removal_reason   VARCHAR(50)       NOT NULL,
    quantity_removed INT               NULL,
    removed_at       DATETIME          NOT NULL CONSTRAINT DF_removed_at DEFAULT GETUTCDATE(),

    CONSTRAINT FK_removed_items_user FOREIGN KEY (removed_by) REFERENCES Users(user_id),
    CONSTRAINT CHK_removal_reason CHECK (removal_reason IN ('Expired', 'Out of Stock'))
);
GO

-- ============================================================
-- 9. SUPPORT TICKETS, NOTIFICATIONS AND AUDIT
-- ============================================================

CREATE TABLE Ticket_Type (
    ticket_type_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ticket_Type PRIMARY KEY,
    type_name      VARCHAR(100)      NOT NULL CONSTRAINT UQ_TicketType_Name UNIQUE,
    description    VARCHAR(255)      NULL,
    is_active      BIT               NOT NULL CONSTRAINT DF_TicketType_IsActive DEFAULT 1,
    display_order  INT               NOT NULL CONSTRAINT DF_TicketType_DisplayOrder DEFAULT 0
);
GO

CREATE INDEX IX_TicketType_Active_Order ON Ticket_Type(is_active, display_order);
GO

CREATE TABLE Tickets (
    ticket_id      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Tickets PRIMARY KEY,
    user_id        INT               NOT NULL,
    ticket_type_id INT               NOT NULL,
    details        NVARCHAR(MAX)     NOT NULL,
    status         VARCHAR(20)       NOT NULL CONSTRAINT DF_Tickets_Status DEFAULT 'Open',
    created_at     DATETIME2         NOT NULL CONSTRAINT DF_Tickets_CreatedAt DEFAULT GETDATE(),
    updated_at     DATETIME2         NOT NULL CONSTRAINT DF_Tickets_UpdatedAt DEFAULT GETDATE(),

    CONSTRAINT FK_Tickets_User       FOREIGN KEY (user_id)        REFERENCES Users(user_id),
    CONSTRAINT FK_Tickets_TicketType FOREIGN KEY (ticket_type_id) REFERENCES Ticket_Type(ticket_type_id),
    CONSTRAINT CK_Tickets_Status CHECK (status IN ('Open', 'In Progress', 'Resolved'))
);
GO

CREATE TABLE Ticket_Messages (
    message_id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Ticket_Messages PRIMARY KEY,
    ticket_id          INT               NOT NULL,
    sender_user_id     INT               NOT NULL,
    message_text       NVARCHAR(MAX)     NOT NULL,
    is_resolution_note BIT               NOT NULL CONSTRAINT DF_TicketMsg_IsResolution DEFAULT 0,
    created_at         DATETIME2         NOT NULL CONSTRAINT DF_TicketMsg_CreatedAt DEFAULT GETDATE(),

    CONSTRAINT FK_TicketMsg_Ticket FOREIGN KEY (ticket_id)      REFERENCES Tickets(ticket_id),
    CONSTRAINT FK_TicketMsg_User   FOREIGN KEY (sender_user_id) REFERENCES Users(user_id)
);
GO

-- In-app notifications. read_at is the source of truth; is_read is kept for
-- older polling code.
CREATE TABLE Notifications (
    notification_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY,
    user_id             INT               NOT NULL,
    type                NVARCHAR(50)      NOT NULL CONSTRAINT DF_Notifications_Type DEFAULT 'info',
    title               NVARCHAR(120)     NULL,
    message             NVARCHAR(500)     NOT NULL,
    link_to             NVARCHAR(255)     NULL,
    related_entity_type NVARCHAR(50)      NULL,
    related_entity_id   INT               NULL,
    is_read             BIT               NOT NULL CONSTRAINT DF_Notifications_IsRead DEFAULT 0,
    read_at             DATETIME          NULL,
    created_at          DATETIME          NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT GETDATE(),

    CONSTRAINT FK_Notifications_User FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_Notifications_user_id ON Notifications(user_id);
CREATE INDEX IX_Notifications_User_Unread ON Notifications(user_id, read_at, created_at);
GO

CREATE TABLE Audit_Log (
    event_id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Audit_Log PRIMARY KEY,
    user_id           INT               NOT NULL,
    patient_id        INT               NULL,
    event_type        VARCHAR(50)       NOT NULL,
    event_description VARCHAR(255)      NOT NULL,
    details           VARCHAR(500)      NOT NULL,
    operation_status  VARCHAR(20)       NOT NULL,
    [timestamp]       DATETIME          NOT NULL CONSTRAINT DF_Audit_Log_timestamp DEFAULT GETUTCDATE(),

    CONSTRAINT FK_AuditLog_User    FOREIGN KEY (user_id)    REFERENCES Users(user_id),
    CONSTRAINT FK_AuditLog_Patient FOREIGN KEY (patient_id) REFERENCES Patients(patient_id),
    CONSTRAINT CK_AuditLog_OperationStatus CHECK (operation_status IN ('Success', 'Failure'))
);
GO

-- ============================================================
-- 10. SELF-REGISTRATION AND ADMIN SETTINGS
-- ============================================================

-- Sign-ups waiting for admin approval. Approving one creates the
-- Users + Employee/Student + Contact_Information rows.
CREATE TABLE Pending_Registrations (
    registration_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Pending_Registrations PRIMARY KEY,
    first_name          VARCHAR(100)      NOT NULL,
    middle_name         VARCHAR(100)      NOT NULL,
    last_name           VARCHAR(100)      NOT NULL,
    civil_id            VARCHAR(20)       NOT NULL,
    requested_role_id   INT               NOT NULL,
    password_hash       VARCHAR(255)      NOT NULL,
    status              VARCHAR(20)       NOT NULL CONSTRAINT DF_PendReg_Status DEFAULT 'Pending',
    submitted_at        DATETIME          NOT NULL CONSTRAINT DF_PendReg_SubmittedAt DEFAULT GETUTCDATE(),
    reviewed_by         INT               NULL,
    reviewed_at         DATETIME          NULL,
    rejection_reason    VARCHAR(500)      NULL,
    created_user_id     INT               NULL,
    created_employee_id INT               NULL,
    created_academic_id INT               NULL,

    CONSTRAINT FK_PendReg_Role     FOREIGN KEY (requested_role_id)   REFERENCES Roles(role_id),
    CONSTRAINT FK_PendReg_Reviewer FOREIGN KEY (reviewed_by)         REFERENCES Users(user_id),
    CONSTRAINT FK_PendReg_User     FOREIGN KEY (created_user_id)     REFERENCES Users(user_id),
    CONSTRAINT FK_PendReg_Emp      FOREIGN KEY (created_employee_id) REFERENCES Employee(employee_id),
    CONSTRAINT FK_PendReg_Stu      FOREIGN KEY (created_academic_id) REFERENCES Student(academic_id),
    CONSTRAINT CK_PendReg_Status CHECK (status IN ('Pending', 'Approved', 'Rejected'))
);
GO

CREATE INDEX IX_PendReg_Status ON Pending_Registrations(status, submitted_at DESC);
GO

CREATE TABLE Pending_Registration_Contacts (
    pending_contact_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Pending_Registration_Contacts PRIMARY KEY,
    registration_id    INT               NOT NULL,
    contact_type       VARCHAR(50)       NOT NULL,
    value              VARCHAR(255)      NOT NULL,
    is_primary         BIT               NOT NULL CONSTRAINT DF_PendRegContact_IsPrimary DEFAULT 0,

    CONSTRAINT FK_PendRegContact_Reg FOREIGN KEY (registration_id) REFERENCES Pending_Registrations(registration_id) ON DELETE CASCADE
);
GO

CREATE INDEX IX_PendRegContact_Reg ON Pending_Registration_Contacts(registration_id);
GO

-- Admin-managed dropdown values (diagnosis types, inventory categories, ...).
-- Values are soft-deleted with is_active = 0.
CREATE TABLE System_Lookups (
    lookup_id     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_System_Lookups PRIMARY KEY,
    category_key  VARCHAR(60)       NOT NULL,
    value_label   VARCHAR(150)      NOT NULL,
    display_order INT               NOT NULL CONSTRAINT DF_SysLookup_DisplayOrder DEFAULT 0,
    is_active     BIT               NOT NULL CONSTRAINT DF_SysLookup_IsActive DEFAULT 1,
    created_at    DATETIME          NOT NULL CONSTRAINT DF_SysLookup_CreatedAt DEFAULT GETUTCDATE(),
    created_by    INT               NULL,
    updated_at    DATETIME          NOT NULL CONSTRAINT DF_SysLookup_UpdatedAt DEFAULT GETUTCDATE(),
    updated_by    INT               NULL,

    CONSTRAINT FK_SysLookup_CreatedBy FOREIGN KEY (created_by) REFERENCES Users(user_id),
    CONSTRAINT FK_SysLookup_UpdatedBy FOREIGN KEY (updated_by) REFERENCES Users(user_id),
    CONSTRAINT UQ_SysLookup_CategoryValue UNIQUE (category_key, value_label)
);
GO

CREATE INDEX IX_SysLookup_Category_Active_Order ON System_Lookups(category_key, is_active, display_order);
GO

-- Global key/value settings editable by admins.
CREATE TABLE System_Settings (
    setting_key   VARCHAR(100) NOT NULL CONSTRAINT PK_System_Settings PRIMARY KEY,
    setting_value VARCHAR(500) NOT NULL,
    description   VARCHAR(255) NOT NULL,
    updated_by    INT          NULL,
    updated_at    DATETIME     NOT NULL CONSTRAINT DF_SystemSettings_UpdatedAt DEFAULT GETUTCDATE(),

    CONSTRAINT FK_SystemSettings_UpdatedBy FOREIGN KEY (updated_by) REFERENCES Users(user_id)
);
GO
