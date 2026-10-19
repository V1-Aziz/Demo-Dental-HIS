// /patients/:id/visits, /teeth, /lab-requests — mirrors patient-file.routes.ts,
// patient-file.service.ts and patient-file.repository.ts.
import { DemoRouter, ok, notFound } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { localDate, today } from '../data/time';
import { clinicById, employeeById, name2, name3, patientById, recordById, studentById, typeById } from '../helpers';

const ALL_VIEWERS = ['Admin', 'Doctor', 'Student', 'DentalAssistant'];
const CLINICIANS = ['Doctor', 'Student'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const hhmm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);

function authorship(db: DemoDb, row: Row, reviewerCol: string | null): Row {
  const s = studentById(db, row.authored_by_student);
  const author = s ? name2(s) : name2(employeeById(db, row.authored_by_doctor)) ?? 'Unknown';
  return {
    author_name: author,
    author_role: row.authored_by_student !== null ? 'Student' : 'Doctor',
    author_level: s?.academic_level ?? undefined,
    reviewer_name: reviewerCol ? name2(employeeById(db, row[reviewerCol])) ?? undefined : undefined,
    supervisor_name: s ? name2(employeeById(db, s.employee_id)) ?? undefined : undefined,
  };
}

export function visitTimeline(db: DemoDb, patientId: number): Row[] {
  const todayStr = today();
  const byAppt = (rows: Row[]) => {
    const m = new Map<number, number>();
    for (const r of rows) if (r.appointment_id !== null) m.set(r.appointment_id, (m.get(r.appointment_id) ?? 0) + 1);
    return m;
  };
  const diagnoses = db.tables.Diagnosis.filter(d => !d.deleted_at);
  const dx = byAppt(diagnoses);
  const tx = byAppt(db.tables.Treatment.filter(t => !t.deleted_at));
  const sc = byAppt(db.tables.Screening);
  const lb = byAppt(db.tables.Lab_Requests);
  const ch = byAppt(db.tables.Dental_Chart);

  return db.tables.Appointments
    .filter(a => a.patient_id === patientId && !a.deleted_at && !['Canceled', 'No Show'].includes(a.status))
    .filter(a => dx.has(a.appointment_id) || tx.has(a.appointment_id) || sc.has(a.appointment_id) ||
      lb.has(a.appointment_id) || ch.has(a.appointment_id) || localDate(a.appointment_start_time) === todayStr)
    .sort((a, b) => b.appointment_start_time.localeCompare(a.appointment_start_time))
    .map(a => {
      const id = a.appointment_id;
      const type = typeById(db, a.appointment_type_id)?.type_name ?? null;
      const summary = diagnoses
        .filter(d => d.appointment_id === id)
        .sort((x, y) => x.submitted_at.localeCompare(y.submitted_at))
        .slice(0, 3)
        .map(d => d.diagnosis_type + (d.tooth_number ? ` · ${d.tooth_number}` : ''))
        .join(', ');
      const counts = {
        diagnoses: dx.get(id) ?? 0,
        treatments: tx.get(id) ?? 0,
        screenings: sc.get(id) ?? 0,
        lab_requests: lb.get(id) ?? 0,
        dental_notes: ch.get(id) ?? 0,
      };
      const isToday = localDate(a.appointment_start_time) === todayStr;
      return {
        appointment_id: id,
        appointment_date: localDate(a.appointment_start_time),
        appointment_time: hhmm(a.appointment_start_time),
        appointment_type: type,
        status: a.status,
        attending_doctor: name2(employeeById(db, a.doctor_id)),
        clinic_name: clinicById(db, a.clinic_id)?.clinic_name ?? 'Unknown Clinic',
        one_line_summary: summary || `${type} appointment`,
        entry_counts: counts,
        total_count: Object.values(counts).reduce((s, n) => s + n, 0),
        is_today: isToday,
        is_read_only: !isToday || a.status === 'Completed',
      };
    });
}

export function registerPatientFile(r: DemoRouter): void {
  r.get('/patients/:id/visits', ALL_VIEWERS, ({ params, db }) => {
    const visits = visitTimeline(db, parseInt(params['id'], 10));
    const byYear = new Map<number, Map<number, Row[]>>();
    for (const v of visits) {
      const [y, m] = v['appointment_date'].split('-').map(Number);
      if (!byYear.has(y)) byYear.set(y, new Map());
      const months = byYear.get(y)!;
      if (!months.has(m - 1)) months.set(m - 1, []);
      months.get(m - 1)!.push(v);
    }
    const grouped = [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, monthMap]) => {
        const months = [...monthMap.entries()]
          .sort(([a], [b]) => b - a)
          .map(([idx, list]) => ({ month: idx + 1, name: MONTH_NAMES[idx], count: list.length, visits: list }));
        return { year, count: months.reduce((s, m) => s + m.count, 0), months };
      });
    return ok({
      total_visits: visits.length,
      today_visit_id: visits.find(v => v['is_today'])?.['appointment_id'] ?? null,
      grouped,
    });
  });

  r.get('/patients/:id/visits/:appointmentId/content', ALL_VIEWERS, ({ params, db }) => {
    const patientId = parseInt(params['id'], 10);
    const apptId = parseInt(params['appointmentId'], 10);
    const a = db.tables.Appointments.find(x => x.appointment_id === apptId && x.patient_id === patientId);
    if (!a) return notFound('Visit not found');
    const doctorName = name2(employeeById(db, a.doctor_id));

    const diagnoses = db.tables.Diagnosis
      .filter(d => d.appointment_id === apptId && !d.deleted_at)
      .sort((x, y) => x.submitted_at.localeCompare(y.submitted_at))
      .map(d => ({
        diagnosis_id: d.diagnosis_id,
        diagnosis_type: d.diagnosis_type,
        tooth_number: d.tooth_number ?? undefined,
        clinical_findings: d.clinical_findings,
        radiographic_findings: d.radiographic_findings,
        progress_note: d.progress_note,
        status: d.status,
        doctor_feedback: d.doctor_feedback,
        submitted_at: new Date(d.submitted_at).toISOString(),
        revision_count: d.revision_count ?? 0,
        authorship: authorship(db, d, 'reviewed_by'),
      }));
    const treatments = db.tables.Treatment
      .filter(t => t.appointment_id === apptId && !t.deleted_at)
      .sort((x, y) => x.submitted_at.localeCompare(y.submitted_at))
      .map(t => ({
        treatment_id: t.treatment_id,
        treatment_type: t.treatment_type,
        treatment_note: t.treatment_note,
        status: t.status,
        doctor_feedback: t.doctor_feedback,
        submitted_at: new Date(t.submitted_at).toISOString(),
        revision_count: t.revision_count ?? 0,
        authorship: authorship(db, t, 'approved_by_doctor'),
      }));
    const screenings = db.tables.Screening
      .filter(s => s.appointment_id === apptId)
      .sort((x, y) => x.uploaded_at.localeCompare(y.uploaded_at))
      .map(s => ({
        image_id: s.image_id,
        image_path: s.image_path,
        image_type: s.image_type,
        uploaded_at: new Date(s.uploaded_at).toISOString(),
        authorship: { author_name: doctorName ?? 'Unknown', author_role: 'Doctor' },
      }));
    const notes = db.tables.Dental_Chart
      .filter(c => c.appointment_id === apptId)
      .sort((x, y) => x.created_at.localeCompare(y.created_at))
      .map(c => {
        const au = authorship(db, c, null);
        return {
          note_id: c.note_id,
          tooth_number: c.tooth_number,
          tooth_note: c.tooth_note,
          created_at: new Date(c.created_at).toISOString(),
          authorship: { author_name: au['author_name'], author_role: au['author_role'], author_level: au['author_level'] },
        };
      });
    return ok({
      appointment_id: apptId,
      appointment_date: localDate(a.appointment_start_time),
      appointment_time: hhmm(a.appointment_start_time),
      appointment_type: typeById(db, a.appointment_type_id)?.type_name ?? null,
      attending_doctor: doctorName,
      clinic_name: clinicById(db, a.clinic_id)?.clinic_name ?? 'Unknown',
      diagnoses,
      treatments,
      screenings,
      dental_chart_notes: notes,
    });
  });

  r.get('/patients/:id/visits/today', CLINICIANS, ({ params, db, user }) => {
    const patientId = parseInt(params['id'], 10);
    const assigned = user.role !== 'Student' || !user.academicId ||
      db.tables.Patients.some(p => p.patient_id === patientId && p.academic_id === user.academicId);
    const todayStr = today();
    const appointments = db.tables.Appointments
      .filter(a => a.patient_id === patientId && !a.deleted_at && ['Scheduled', 'In Progress'].includes(a.status) &&
        localDate(a.appointment_start_time) === todayStr)
      .sort((x, y) => x.appointment_start_time.localeCompare(y.appointment_start_time))
      .map(a => {
        const e = employeeById(db, a.doctor_id);
        return {
          appointment_id: a.appointment_id,
          appointment_time: hhmm(a.appointment_start_time),
          appointment_type: typeById(db, a.appointment_type_id)?.type_name ?? null,
          doctor_name: e ? `Dr. ${e.first_name} ${e.last_name}` : 'Unknown',
          clinic_name: clinicById(db, a.clinic_id)?.clinic_name ?? 'Unknown Clinic',
          status: a.status,
        };
      });
    return ok({ appointments, patient_is_assigned_to_user: assigned });
  });

  r.get('/patients/:id/teeth/:toothNumber/history', ALL_VIEWERS, ({ params, db }) => {
    const patientId = parseInt(params['id'], 10);
    const tooth = params['toothNumber'];
    const rows = db.tables.Dental_Chart
      .filter(c => c.tooth_number === tooth && recordById(db, c.record_id)?.patient_id === patientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(c => {
        const appt = db.tables.Appointments.find(a => a.appointment_id === c.appointment_id);
        const s = studentById(db, c.authored_by_student);
        return {
          note_id: c.note_id,
          recorded_at: new Date(c.created_at).toISOString(),
          visit_date: appt ? localDate(appt.appointment_start_time) : null,
          note: c.tooth_note,
          authored_by: s ? name2(s) : name2(employeeById(db, c.authored_by_doctor)) ?? 'Unknown',
        };
      });
    return ok(rows);
  });

  r.get('/patients/:id/lab-requests/:labRequestId', ALL_VIEWERS, ({ params, db }) => {
    const lr = db.tables.Lab_Requests.find(x => x.lab_request_id === parseInt(params['labRequestId'], 10));
    if (!lr) return notFound('Lab request not found');
    const response = db.tables.Lab_Response
      .filter(x => x.lab_request_id === lr.lab_request_id)
      .sort((a, b) => b.lab_response_id - a.lab_response_id)[0];
    return ok({
      lab_request_id: lr.lab_request_id,
      request_note: lr.request_note,
      request_status: lr.request_status,
      request_date: new Date(lr.request_timestamp).toISOString(),
      patient_name: name3(patientById(db, lr.patient_id)),
      submitter_name: name2(studentById(db, lr.student_id)) ?? name2(employeeById(db, lr.employee_id)),
      submitter_role: lr.student_id !== null ? 'Student' : 'Doctor',
      approver_name: name2(employeeById(db, lr.approved_by)),
      lab_specialist: null,
      response_note: response?.response_note ?? null,
      response_date: response ? new Date(response.created_at).toISOString() : null,
      appointment_id: lr.appointment_id ?? null,
    });
  });
}
