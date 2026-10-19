import sql from 'mssql';
import { getPool } from '../config/db.config';
import type {
  VisitTimelineEntry,
  VisitContent,
  DiagnosisEntry,
  TreatmentEntry,
  ScreeningEntry,
  DentalChartEntry,
  ToothHistoryEntry,
  LabRequestDetail,
  AuthorshipInfo,
  TodaysAppointment,
} from '../types/patient-file.types';

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ─── Visit timeline ───────────────────────────────────────────────────────────

interface RawVisitRow {
  appointment_id:        number;
  appointment_start_time: Date;
  appointment_type:      string;
  status:                string;
  attending_doctor:      string | null;
  clinic_name:           string;
  diagnoses_count:       number;
  treatments_count:      number;
  screenings_count:      number;
  lab_requests_count:    number;
  dental_notes_count:    number;
  diagnosis_summary:     string;
}

export async function getVisitTimeline(patientId: number): Promise<VisitTimelineEntry[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<RawVisitRow>(`
      WITH
      -- Compute per-appointment counts in a single scan per table,
      -- then join them instead of running correlated subqueries per row.
      DiagCTE AS (
        SELECT d.appointment_id,
               COUNT(*) AS cnt,
               ISNULL(STUFF((
                 SELECT TOP 3 ', ' + d2.diagnosis_type
                           + ISNULL(' · ' + d2.tooth_number, '')
                   FROM Diagnosis d2
                  WHERE d2.appointment_id = d.appointment_id
                    AND d2.deleted_at IS NULL
                  ORDER BY d2.submitted_at ASC
                  FOR XML PATH('')
               ), 1, 2, ''), '') AS diagnosis_summary
        FROM   Diagnosis d
        WHERE  d.deleted_at IS NULL
        GROUP BY d.appointment_id
      ),
      TreatCTE AS (
        SELECT appointment_id, COUNT(*) AS cnt
        FROM   Treatment WHERE deleted_at IS NULL GROUP BY appointment_id
      ),
      ScreenCTE AS (
        SELECT appointment_id, COUNT(*) AS cnt
        FROM   Screening GROUP BY appointment_id
      ),
      LabCTE AS (
        SELECT appointment_id, COUNT(*) AS cnt
        FROM   Lab_Requests GROUP BY appointment_id
      ),
      ChartCTE AS (
        SELECT appointment_id, COUNT(*) AS cnt
        FROM   Dental_Chart GROUP BY appointment_id
      )
      SELECT
        a.appointment_id,
        a.appointment_start_time,
        at2.type_name                            AS appointment_type,
        a.status,
        e.first_name + ' ' + e.last_name         AS attending_doctor,
        ISNULL(c.clinic_name, 'Unknown Clinic')  AS clinic_name,
        ISNULL(dg.diagnosis_summary, '')         AS diagnosis_summary,
        ISNULL(dg.cnt,  0)                       AS diagnoses_count,
        ISNULL(tr.cnt,  0)                       AS treatments_count,
        ISNULL(sc.cnt,  0)                       AS screenings_count,
        ISNULL(lb.cnt,  0)                       AS lab_requests_count,
        ISNULL(ch.cnt,  0)                       AS dental_notes_count
      FROM Appointments a
      LEFT JOIN Employee         e   ON e.employee_id   = a.doctor_id
      LEFT JOIN Clinic            c   ON c.clinic_id     = a.clinic_id
      LEFT JOIN Appointment_Type at2  ON at2.type_id     = a.appointment_type_id
      LEFT JOIN DiagCTE          dg   ON dg.appointment_id = a.appointment_id
      LEFT JOIN TreatCTE         tr   ON tr.appointment_id = a.appointment_id
      LEFT JOIN ScreenCTE        sc   ON sc.appointment_id = a.appointment_id
      LEFT JOIN LabCTE           lb   ON lb.appointment_id = a.appointment_id
      LEFT JOIN ChartCTE         ch   ON ch.appointment_id = a.appointment_id
      WHERE a.patient_id = @patientId
        AND a.status NOT IN ('Canceled', 'No Show')
        AND a.deleted_at IS NULL
        AND (
             dg.appointment_id IS NOT NULL
          OR tr.appointment_id IS NOT NULL
          OR sc.appointment_id IS NOT NULL
          OR lb.appointment_id IS NOT NULL
          OR ch.appointment_id IS NOT NULL
          OR CAST(a.appointment_start_time AS DATE) = CAST(GETDATE() AS DATE)
        )
      ORDER BY a.appointment_start_time DESC
    `);

  const today = new Date();

  return result.recordset.map((row) => {
    const dt = new Date(row.appointment_start_time);
    const isToday =
      dt.getFullYear() === today.getFullYear() &&
      dt.getMonth()    === today.getMonth() &&
      dt.getDate()     === today.getDate();
    const totalCount =
      row.diagnoses_count + row.treatments_count +
      row.screenings_count + row.lab_requests_count + row.dental_notes_count;

    return {
      appointment_id:   row.appointment_id,
      appointment_date: dt.toISOString().slice(0, 10),
      appointment_time: dt.toTimeString().slice(0, 5),
      appointment_type: row.appointment_type,
      status:           row.status,
      attending_doctor: row.attending_doctor,
      clinic_name:      row.clinic_name,
      one_line_summary: row.diagnosis_summary || `${row.appointment_type} appointment`,
      entry_counts: {
        diagnoses:    row.diagnoses_count,
        treatments:   row.treatments_count,
        screenings:   row.screenings_count,
        lab_requests: row.lab_requests_count,
        dental_notes: row.dental_notes_count,
      },
      total_count:  totalCount,
      is_today:     isToday,
      is_read_only: !isToday || row.status === 'Completed',
    } satisfies VisitTimelineEntry;
  });
}

// ─── Visit content ────────────────────────────────────────────────────────────

export async function getVisitContent(
  patientId: number,
  appointmentId: number,
): Promise<VisitContent | null> {
  const pool = await getPool();

  // Verify appointment belongs to patient
  const apptResult = await pool
    .request()
    .input('apptId',    sql.Int, appointmentId)
    .input('patientId', sql.Int, patientId)
    .query<{ appointment_start_time: Date; appointment_type: string; attending_doctor: string | null; clinic_name: string }>(`
      SELECT
        a.appointment_start_time,
        at2.type_name                          AS appointment_type,
        e.first_name + ' ' + e.last_name       AS attending_doctor,
        ISNULL(c.clinic_name, 'Unknown')       AS clinic_name
      FROM Appointments a
      LEFT JOIN Employee e          ON e.employee_id  = a.doctor_id
      LEFT JOIN Clinic c            ON c.clinic_id    = a.clinic_id
      LEFT JOIN Appointment_Type at2 ON at2.type_id  = a.appointment_type_id
      WHERE a.appointment_id = @apptId AND a.patient_id = @patientId
    `);

  if (!apptResult.recordset.length) return null;
  const appt = apptResult.recordset[0];
  const dt   = new Date(appt.appointment_start_time);

  // Diagnoses
  const dxRows = await pool
    .request()
    .input('apptId', sql.Int, appointmentId)
    .query<any>(`
      SELECT
        d.diagnosis_id, d.diagnosis_type, d.tooth_number,
        d.clinical_findings, d.radiographic_findings, d.progress_note,
        d.status, d.doctor_feedback, d.submitted_at, d.revision_count,
        COALESCE(s.first_name + ' ' + s.last_name,
                 e_a.first_name + ' ' + e_a.last_name, 'Unknown') AS author_name,
        CASE WHEN d.authored_by_student IS NOT NULL THEN 'Student' ELSE 'Doctor' END AS author_role,
        s.academic_level                                            AS author_level,
        e_r.first_name + ' ' + e_r.last_name                       AS reviewer_name,
        e_s.first_name + ' ' + e_s.last_name                       AS supervisor_name
      FROM Diagnosis d
      LEFT JOIN Student  s    ON s.academic_id   = d.authored_by_student
      LEFT JOIN Employee e_a  ON e_a.employee_id = d.authored_by_doctor
      LEFT JOIN Employee e_r  ON e_r.employee_id = d.reviewed_by
      LEFT JOIN Employee e_s  ON e_s.employee_id = s.employee_id
      WHERE d.appointment_id = @apptId AND d.deleted_at IS NULL
      ORDER BY d.submitted_at ASC
    `);

  // Treatments
  const txRows = await pool
    .request()
    .input('apptId', sql.Int, appointmentId)
    .query<any>(`
      SELECT
        t.treatment_id, t.treatment_type, t.treatment_note,
        t.status, t.doctor_feedback, t.submitted_at, t.revision_count,
        COALESCE(s.first_name + ' ' + s.last_name,
                 e_a.first_name + ' ' + e_a.last_name, 'Unknown') AS author_name,
        CASE WHEN t.authored_by_student IS NOT NULL THEN 'Student' ELSE 'Doctor' END AS author_role,
        s.academic_level                                            AS author_level,
        e_r.first_name + ' ' + e_r.last_name                       AS reviewer_name,
        e_s.first_name + ' ' + e_s.last_name                       AS supervisor_name
      FROM Treatment t
      LEFT JOIN Student  s    ON s.academic_id   = t.authored_by_student
      LEFT JOIN Employee e_a  ON e_a.employee_id = t.authored_by_doctor
      LEFT JOIN Employee e_r  ON e_r.employee_id = t.approved_by_doctor
      LEFT JOIN Employee e_s  ON e_s.employee_id = s.employee_id
      WHERE t.appointment_id = @apptId AND t.deleted_at IS NULL
      ORDER BY t.submitted_at ASC
    `);

  // Screenings — uploaded_by is not tracked; use attending doctor as author
  const scRows = await pool
    .request()
    .input('apptId', sql.Int, appointmentId)
    .query<any>(`
      SELECT sc.image_id, sc.image_path, sc.image_type, sc.uploaded_at
      FROM Screening sc
      WHERE sc.appointment_id = @apptId
      ORDER BY sc.uploaded_at ASC
    `);

  // Dental chart notes
  const dcRows = await pool
    .request()
    .input('apptId', sql.Int, appointmentId)
    .query<any>(`
      SELECT
        dc.note_id, dc.tooth_number, dc.tooth_note, dc.created_at,
        COALESCE(s.first_name + ' ' + s.last_name,
                 e.first_name + ' ' + e.last_name, 'Unknown') AS author_name,
        CASE WHEN dc.authored_by_student IS NOT NULL THEN 'Student' ELSE 'Doctor' END AS author_role,
        s.academic_level AS author_level
      FROM Dental_Chart dc
      LEFT JOIN Student  s ON s.academic_id   = dc.authored_by_student
      LEFT JOIN Employee e ON e.employee_id   = dc.authored_by_doctor
      WHERE dc.appointment_id = @apptId
      ORDER BY dc.created_at ASC
    `);

  const buildAuthorship = (row: any): AuthorshipInfo => ({
    author_name:    row.author_name,
    author_role:    row.author_role,
    author_level:   row.author_level ?? undefined,
    reviewer_name:  row.reviewer_name ?? undefined,
    supervisor_name: row.supervisor_name ?? undefined,
  });

  const diagnoses: DiagnosisEntry[] = dxRows.recordset.map((r: any) => ({
    diagnosis_id:          r.diagnosis_id,
    diagnosis_type:        r.diagnosis_type,
    tooth_number:          r.tooth_number ?? undefined,
    clinical_findings:     r.clinical_findings,
    radiographic_findings: r.radiographic_findings,
    progress_note:         r.progress_note,
    status:                r.status,
    doctor_feedback:       r.doctor_feedback,
    submitted_at:          new Date(r.submitted_at).toISOString(),
    revision_count:        r.revision_count ?? 0,
    authorship:            buildAuthorship(r),
  }));

  const treatments: TreatmentEntry[] = txRows.recordset.map((r: any) => ({
    treatment_id:    r.treatment_id,
    treatment_type:  r.treatment_type,
    treatment_note:  r.treatment_note,
    status:          r.status,
    doctor_feedback: r.doctor_feedback,
    submitted_at:    new Date(r.submitted_at).toISOString(),
    revision_count:  r.revision_count ?? 0,
    authorship:      buildAuthorship(r),
  }));

  const screenings: ScreeningEntry[] = scRows.recordset.map((r: any) => ({
    image_id:    r.image_id,
    image_path:  r.image_path,
    image_type:  r.image_type,
    uploaded_at: new Date(r.uploaded_at).toISOString(),
    authorship:  { author_name: appt.attending_doctor ?? 'Unknown', author_role: 'Doctor' },
  }));

  const dentalNotes: DentalChartEntry[] = dcRows.recordset.map((r: any) => ({
    note_id:      r.note_id,
    tooth_number: r.tooth_number,
    tooth_note:   r.tooth_note,
    created_at:   new Date(r.created_at).toISOString(),
    authorship:   buildAuthorship(r),
  }));

  return {
    appointment_id:     appointmentId,
    appointment_date:   dt.toISOString().slice(0, 10),
    appointment_time:   dt.toTimeString().slice(0, 5),
    appointment_type:   appt.appointment_type,
    attending_doctor:   appt.attending_doctor,
    clinic_name:        appt.clinic_name,
    diagnoses,
    treatments,
    screenings,
    dental_chart_notes: dentalNotes,
  };
}

// ─── Today's active appointments (array; supports same-day multi-visit) ──────

export async function getTodaysAppointments(
  patientId: number,
): Promise<TodaysAppointment[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query<any>(`
      SELECT
        a.appointment_id,
        CONVERT(VARCHAR(5), a.appointment_start_time, 108) AS appointment_time,
        at2.type_name                           AS appointment_type,
        'Dr. ' + e.first_name + ' ' + e.last_name AS doctor_name,
        ISNULL(c.clinic_name, 'Unknown Clinic') AS clinic_name,
        a.status
      FROM Appointments a
      LEFT JOIN Employee         e   ON e.employee_id   = a.doctor_id
      LEFT JOIN Clinic           c   ON c.clinic_id     = a.clinic_id
      LEFT JOIN Appointment_Type at2 ON at2.type_id     = a.appointment_type_id
      WHERE a.patient_id = @patientId
        AND CAST(a.appointment_start_time AS DATE) = CAST(GETDATE() AS DATE)
        AND a.status IN ('Scheduled', 'In Progress')
        AND a.deleted_at IS NULL
      ORDER BY a.appointment_start_time ASC
    `);

  return result.recordset.map((r: any) => ({
    appointment_id:   r.appointment_id,
    appointment_time: r.appointment_time, // Formatted by SQL (HH:MM), no timezone conversion
    appointment_type: r.appointment_type,
    doctor_name:      r.doctor_name ?? 'Unknown',
    clinic_name:      r.clinic_name,
    status:           r.status,
  }));
}

// ─── Tooth history ────────────────────────────────────────────────────────────

export async function getToothHistory(
  patientId: number,
  toothNumber: string,
): Promise<ToothHistoryEntry[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId',   sql.Int,        patientId)
    .input('toothNumber', sql.VarChar(10), toothNumber)
    .query<any>(`
      SELECT
        dc.note_id,
        dc.tooth_note,
        dc.created_at,
        a.appointment_start_time AS visit_date,
        COALESCE(s.first_name + ' ' + s.last_name,
                 e.first_name + ' ' + e.last_name, 'Unknown') AS authored_by
      FROM Dental_Chart dc
      JOIN Medical_Records mr ON mr.record_id = dc.record_id
      LEFT JOIN Appointments a ON a.appointment_id = dc.appointment_id
      LEFT JOIN Student  s ON s.academic_id = dc.authored_by_student
      LEFT JOIN Employee e ON e.employee_id = dc.authored_by_doctor
      WHERE mr.patient_id = @patientId
        AND dc.tooth_number = @toothNumber
      ORDER BY dc.created_at DESC
    `);

  return result.recordset.map((r: any) => ({
    note_id:     r.note_id,
    recorded_at: new Date(r.created_at).toISOString(),
    visit_date:  r.visit_date ? new Date(r.visit_date).toISOString().slice(0, 10) : null,
    note:        r.tooth_note,
    authored_by: r.authored_by,
  }));
}

// ─── Lab request detail ───────────────────────────────────────────────────────

export async function getLabRequestDetail(labRequestId: number): Promise<LabRequestDetail | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('labRequestId', sql.Int, labRequestId)
    .query<any>(`
      SELECT
        lr.lab_request_id,
        lr.request_note,
        lr.request_status,
        lr.request_timestamp,
        lr.appointment_id,
        p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS patient_name,
        ISNULL(s.first_name + ' ' + s.last_name,
               e_sub.first_name + ' ' + e_sub.last_name)        AS submitter_name,
        CASE WHEN lr.student_id IS NOT NULL THEN 'Student' ELSE 'Doctor' END AS submitter_role,
        e_ap.first_name + ' ' + e_ap.last_name                  AS approver_name,
        resp.response_note,
        resp.response_timestamp                                  AS response_date
      FROM Lab_Requests lr
      LEFT JOIN Patients  p     ON p.patient_id  = lr.patient_id
      LEFT JOIN Student   s     ON s.academic_id = lr.student_id
      LEFT JOIN Employee  e_sub ON e_sub.employee_id = lr.employee_id
      LEFT JOIN Employee  e_ap  ON e_ap.employee_id  = lr.approved_by
      LEFT JOIN (
        SELECT lab_request_id, response_note,
               MAX(lab_response_id) AS lab_response_id,
               MAX(created_at)      AS response_timestamp
          FROM Lab_Response
         GROUP BY lab_request_id, response_note
      ) resp ON resp.lab_request_id = lr.lab_request_id
      WHERE lr.lab_request_id = @labRequestId
    `);

  if (!result.recordset.length) return null;
  const r = result.recordset[0];

  return {
    lab_request_id: r.lab_request_id,
    request_note:   r.request_note,
    request_status: r.request_status,
    request_date:   new Date(r.request_timestamp).toISOString(),
    patient_name:   r.patient_name,
    submitter_name: r.submitter_name,
    submitter_role: r.submitter_role,
    approver_name:  r.approver_name,
    lab_specialist: null,
    response_note:  r.response_note ?? null,
    response_date:  r.response_date ? new Date(r.response_date).toISOString() : null,
    appointment_id: r.appointment_id ?? null,
  };
}

// ─── All visits content (paginated) ──────────────────────────────────────────

export async function getAllVisitsContent(
  patientId: number,
  limit:     number,
  offset:    number,
): Promise<{ rows: VisitTimelineEntry[]; total: number }> {
  const rows  = await getVisitTimeline(patientId);
  const total = rows.length;
  return { rows: rows.slice(offset, offset + limit), total };
}

// Export grouping helper for service layer
export { MONTH_NAMES };
