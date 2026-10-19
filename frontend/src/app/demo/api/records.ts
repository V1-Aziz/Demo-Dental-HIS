// /records — mirrors record.routes.ts, record.service.ts and record.repository.ts.
import { DemoRouter, ok, created, badRequest, notFound } from '../router';
import { activeRecord, audit, employeeById, employeeByUser, name2 } from '../helpers';

export function registerRecords(r: DemoRouter): void {
  r.get('/records/patient/:patientId', ['Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'], ({ params, db }) => {
    const patientId = parseInt(params['patientId'], 10);
    if (isNaN(patientId)) return notFound('Invalid patient ID');
    const record = activeRecord(db, patientId);
    if (!record) return notFound('Medical record not found for this patient');

    const diagnoses = db.tables.Diagnosis
      .filter(d => d.record_id === record.record_id && !d.deleted_at)
      .sort((a, b) => b.diagnosis_id - a.diagnosis_id)
      .map(d => ({
        diagnosis_id: d.diagnosis_id,
        diagnosis_type: d.diagnosis_type,
        clinical_findings: d.clinical_findings,
        radiographic_findings: d.radiographic_findings,
        progress_note: d.progress_note,
        authored_by_name: name2(employeeById(db, d.authored_by_doctor)),
      }));
    const treatments = db.tables.Treatment
      .filter(t => t.record_id === record.record_id && !t.deleted_at)
      .sort((a, b) => b.treatment_id - a.treatment_id)
      .map(t => {
        const p = db.tables.Prescriptions.find(x => x.prescription_id === t.prescription_id);
        return {
          treatment_id: t.treatment_id,
          treatment_type: t.treatment_type,
          treatment_note: t.treatment_note,
          doctor_feedback: t.doctor_feedback,
          authored_by_name: name2(employeeById(db, t.authored_by_doctor)),
          medicine_name: p?.medicine_name ?? null,
          dosage: p?.dosage ?? null,
          duration: p?.duration ?? null,
          cost: p?.cost ?? null,
        };
      });
    return ok({
      record_id: record.record_id,
      patient_id: record.patient_id,
      chief_complaint: record.chief_complaint,
      chronic_diseases: record.chronic_diseases,
      diagnoses,
      treatments,
    });
  });

  r.patch('/records/:id', ['Admin', 'Doctor'], (req) => {
    const { params, body, db } = req;
    if (typeof body?.chiefComplaint !== 'string' || body.chiefComplaint.length > 5000 ||
        typeof body?.chronicDiseases !== 'string' || body.chronicDiseases.length > 100) {
      return badRequest('chiefComplaint and chronicDiseases are required');
    }
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid record ID');
    const record = db.tables.Medical_Records.find(x => x.record_id === id && !x.deleted_at);
    if (record) {
      record.chief_complaint = body.chiefComplaint;
      record.chronic_diseases = body.chronicDiseases;
      db.save();
    }
    audit(db, req.user, 'Record_Update', 'Clinical record updated', `Clinical record #${params['id']} updated`);
    return ok(null, 'Medical record updated');
  });

  r.post('/records/:id/procedure-notes', ['Student'], ({ params, body, user, db }) => {
    const errors = noteErrors(body);
    if (!Number.isInteger(body?.supervisorEmployeeId) || body.supervisorEmployeeId <= 0) errors.push('supervisorEmployeeId is required');
    if (errors.length) return badRequest(errors.join(', '));
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid record ID');
    if (!user.academicId) return badRequest('Student academic ID not found in token');
    const d = db.insert('Diagnosis', {
      record_id: id,
      authored_by_student: user.academicId,
      reviewed_by: body.supervisorEmployeeId,
      diagnosis_type: body.diagnosisType,
      clinical_findings: body.clinicalFindings,
      radiographic_findings: body.radiographicFindings,
      progress_note: body.progressNote,
    });
    return created({ diagnosis_id: d.diagnosis_id }, 'Procedure note added');
  });

  r.post('/records/:id/diagnoses', ['Admin', 'Doctor'], (req) => {
    const { params, body, user, db } = req;
    const errors = noteErrors(body);
    if (errors.length) return badRequest(errors.join(', '));
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid record ID');
    const employee = employeeByUser(db, user.userId);
    if (!employee) return badRequest('Employee record not found for this user');
    const d = db.insert('Diagnosis', {
      record_id: id,
      authored_by_doctor: employee.employee_id,
      reviewed_by: employee.employee_id,
      diagnosis_type: body.diagnosisType,
      clinical_findings: body.clinicalFindings,
      radiographic_findings: body.radiographicFindings,
      progress_note: body.progressNote,
      status: 'Approved',
    });
    audit(db, user, 'Record_Update', 'Diagnosis added to clinical record',
      `Diagnosis added to record #${params['id']}: ${body.diagnosisType ?? ''}`);
    return created({ diagnosis_id: d.diagnosis_id }, 'Diagnosis added');
  });

  r.post('/records/:id/treatments', ['Admin', 'Doctor', 'Student'], (req) => {
    const { params, body, user, db } = req;
    const errors: string[] = [];
    const str = (v: unknown, max = Infinity) => typeof v === 'string' && v.length >= 1 && v.length <= max;
    if (!str(body?.treatmentType, 100)) errors.push('treatmentType is required');
    if (!str(body?.treatmentNote)) errors.push('treatmentNote is required');
    if (!str(body?.medicineName, 255)) errors.push('medicineName is required');
    if (!str(body?.dosage, 100)) errors.push('dosage is required');
    if (!str(body?.duration, 100)) errors.push('duration is required');
    if (typeof body?.cost !== 'number' || body.cost < 0) errors.push('cost must be a non-negative number');
    if (errors.length) return badRequest(errors.join(', '));
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid record ID');
    const employee = employeeByUser(db, user.userId);
    if (!employee) return badRequest('Employee record not found for this user');
    const prescription = db.insert('Prescriptions', {
      record_id: id,
      medicine_name: body.medicineName,
      dosage: body.dosage,
      duration: body.duration,
      cost: body.cost,
    });
    const t = db.insert('Treatment', {
      record_id: id,
      prescription_id: prescription.prescription_id,
      authored_by_doctor: employee.employee_id,
      approved_by_doctor: employee.employee_id,
      treatment_type: body.treatmentType,
      treatment_note: body.treatmentNote,
    });
    audit(db, user, 'Record_Update', 'Treatment added to clinical record',
      `Treatment added to record #${params['id']}: ${body.treatmentType ?? ''}`);
    return created({ treatment_id: t.treatment_id }, 'Treatment added');
  });
}

function noteErrors(b: any): string[] {
  const errors: string[] = [];
  if (typeof b?.diagnosisType !== 'string' || !b.diagnosisType || b.diagnosisType.length > 100) errors.push('diagnosisType is required');
  if (typeof b?.clinicalFindings !== 'string' || !b.clinicalFindings) errors.push('clinicalFindings is required');
  if (typeof b?.radiographicFindings !== 'string' || !b.radiographicFindings) errors.push('radiographicFindings is required');
  if (typeof b?.progressNote !== 'string' || !b.progressNote) errors.push('progressNote is required');
  return errors;
}
