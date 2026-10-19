// /diagnosis — mirrors diagnosis.routes.ts, diagnosis.service.ts and diagnosis.repository.ts.
import { DemoRouter, ok, created, badRequest, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { now } from '../data/time';
import { activeRecord, audit, employeeById, name2, name3, patientById, recordById, studentById } from '../helpers';

function patientOf(db: DemoDb, d: Row): Row | undefined {
  return patientById(db, recordById(db, d.record_id)?.patient_id);
}

export function registerDiagnosis(r: DemoRouter): void {
  r.get('/diagnosis/student-submissions', ['Doctor'], ({ user, query, db }) => {
    const { limit, offset, page } = pagination(query);
    if (!user.employeeId) return badRequest('Employee ID required');
    const all = db.tables.Diagnosis
      .filter(d => d.authored_by_student !== null && d.reviewed_by === user.employeeId && !d.deleted_at)
      .filter(d => studentById(db, d.authored_by_student) && patientOf(db, d))
      .sort((a, b) => (a.status === 'Submitted' ? 0 : 1) - (b.status === 'Submitted' ? 0 : 1) || b.diagnosis_id - a.diagnosis_id);
    const rows = all.slice(offset, offset + limit).map(d => {
      const s = studentById(db, d.authored_by_student)!;
      const p = patientOf(db, d)!;
      return {
        diagnosis_id: d.diagnosis_id,
        diagnosis_type: d.diagnosis_type,
        clinical_findings: d.clinical_findings,
        radiographic_findings: d.radiographic_findings,
        progress_note: d.progress_note,
        status: d.status,
        doctor_feedback: d.doctor_feedback,
        created_at: d.created_at ?? now(),
        student_name: name2(s),
        university_id: s.academic_id,
        patient_name: name3(p),
        file_number: p.file_number,
      };
    });
    return ok({ rows, total: all.length, page, limit });
  });

  r.get('/diagnosis/my-notes', ['Student'], ({ user, query, db }) => {
    const { limit, offset, page } = pagination(query);
    if (!user.academicId) return badRequest('Academic ID required');
    const patientId = query['patientId'] ? parseInt(query['patientId'], 10) : undefined;
    const all = db.tables.Diagnosis
      .filter(d => d.authored_by_student === user.academicId && !d.deleted_at && patientOf(db, d))
      .filter(d => !patientId || recordById(db, d.record_id)?.patient_id === patientId)
      .sort((a, b) => b.diagnosis_id - a.diagnosis_id);
    const rows = all.slice(offset, offset + limit).map(d => {
      const p = patientOf(db, d)!;
      return {
        diagnosis_id: d.diagnosis_id,
        diagnosis_type: d.diagnosis_type,
        clinical_findings: d.clinical_findings,
        radiographic_findings: d.radiographic_findings,
        progress_note: d.progress_note,
        status: d.status,
        doctor_feedback: d.doctor_feedback,
        created_at: d.created_at ?? now(),
        patient_name: name3(p),
        file_number: p.file_number,
        supervisor_name: name2(employeeById(db, d.reviewed_by)) ?? 'Pending Review',
      };
    });
    return ok({ rows, total: all.length, page, limit });
  });

  r.post('/diagnosis/submit', ['Student', 'Doctor'], ({ user, body, db }) => {
    const errors: string[] = [];
    if (!Number.isInteger(body?.patientId) || body.patientId <= 0) errors.push('patientId is required');
    if (body?.appointmentId !== undefined && (!Number.isInteger(body.appointmentId) || body.appointmentId <= 0)) errors.push('Invalid appointmentId');
    if (body?.toothNumber !== undefined && (typeof body.toothNumber !== 'string' || body.toothNumber.length > 10)) errors.push('Invalid toothNumber');
    for (const f of ['diagnosisType', 'clinicalFindings', 'radiographicFindings', 'progressNote']) {
      if (typeof body?.[f] !== 'string' || !body[f]) errors.push(`${f} is required`);
    }
    if (errors.length) return badRequest(errors.join(', '));
    if (!user.academicId) return badRequest('Academic ID required');

    const supervisorId = studentById(db, user.academicId)?.employee_id;
    if (!supervisorId) return badRequest('No supervisor assigned to this student');
    const record = activeRecord(db, body.patientId);
    if (!record) return badRequest('No medical record found for this patient');

    const d = db.insert('Diagnosis', {
      record_id: record.record_id,
      authored_by_student: user.academicId,
      reviewed_by: supervisorId,
      tooth_number: body.toothNumber ?? null,
      diagnosis_type: body.diagnosisType,
      clinical_findings: body.clinicalFindings,
      radiographic_findings: body.radiographicFindings,
      progress_note: body.progressNote,
      status: 'Submitted',
      submitted_at: now(),
      appointment_id: body.appointmentId ?? null,
    });
    audit(db, user, 'Diagnosis_Create', 'Diagnosis submitted',
      `Diagnosis for patient #${body.patientId ?? ''}: ${body.diagnosisType ?? ''}`, body.patientId ?? null);
    return created({ diagnosis_id: d.diagnosis_id }, 'Diagnosis submitted for review');
  });

  r.patch('/diagnosis/:id/review', ['Doctor', 'Admin'], ({ user, params, body, db }) => {
    if (body?.status !== 'Approved' && body?.status !== 'Rejected') {
      return badRequest(`Invalid enum value. Expected 'Approved' | 'Rejected', received '${body?.status}'`);
    }
    if (typeof body?.feedback !== 'string' || !body.feedback) return badRequest('String must contain at least 1 character(s)');
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return badRequest('Invalid diagnosis ID');
    const d = db.tables.Diagnosis.find(x => x.diagnosis_id === id && !x.deleted_at);
    if (d) {
      d.status = body.status;
      d.doctor_feedback = body.feedback;
      db.save();
    }
    audit(db, user, 'Diagnosis_Update', 'Student diagnosis reviewed', `Diagnosis #${params['id']} ${body.status}`);
    return ok(null, `Diagnosis ${body.status.toLowerCase()}`);
  });
}
