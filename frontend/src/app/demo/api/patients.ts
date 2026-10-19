// /patients — mirrors patient.routes.ts and patient.repository.ts.
import { DemoRouter, ok, created, badRequest, conflict, notFound, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { activeRecord, audit, like, name3 } from '../helpers';

export function patientPhone(db: DemoDb, patientId: number): string | null {
  return db.tables.Contact_Information
    .filter(c => c.patient_id === patientId && c.owner_type === 'Patient')
    .sort((a, b) => a.contact_id - b.contact_id)[0]?.phone_number ?? null;
}

function matchesSearch(p: Row, search: string, withNationalId = true): boolean {
  return like(name3(p), search) || like(p.file_number, search) || (withNationalId && like(p.national_id, search));
}

function listRow(db: DemoDb, p: Row, withRecordId: boolean, withNames: boolean): Row {
  const record = activeRecord(db, p.patient_id);
  return {
    patient_id: p.patient_id,
    file_number: p.file_number,
    national_id: p.national_id,
    gender: p.gender,
    date_of_birth: p.date_of_birth,
    ...(withNames ? { first_name: p.first_name, middle_name: p.middle_name, last_name: p.last_name } : {}),
    full_name: name3(p),
    phone_number: patientPhone(db, p.patient_id),
    ...(withRecordId ? { record_id: record?.record_id ?? null } : {}),
    chief_complaint: record?.chief_complaint ?? null,
    chronic_diseases: record?.chronic_diseases ?? null,
  };
}

export function registerPatients(r: DemoRouter): void {
  r.get('/patients/search', ['Admin', 'Receptionist'], ({ query, db }) => {
    const q = String(query['q'] ?? '').trim();
    const limit = Math.min(parseInt(query['limit'] ?? '50', 10) || 50, 100);
    const rows = db.tables.Patients
      .filter(p => !p.deleted_at && (!q || matchesSearch(p, q, false)))
      .sort((a, b) => a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name))
      .slice(0, limit)
      .map(p => ({
        patient_id: p.patient_id,
        file_number: p.file_number,
        academic_id: p.academic_id,
        full_name: name3(p),
        gender: p.gender,
        date_of_birth: p.date_of_birth,
      }));
    return ok(rows);
  });

  r.post('/patients', ['Admin', 'Receptionist'], (req) => {
    const { body, db } = req;
    const errors = validatePatient(body);
    if (errors.length) return badRequest(errors.join(', '));
    if (db.tables.Patients.some(p => p.file_number === body.fileNumber || p.national_id === body.nationalId)) {
      return conflict('A patient with this file number or national ID already exists');
    }
    const patient = db.insert('Patients', {
      file_number: body.fileNumber,
      national_id: body.nationalId,
      first_name: body.firstName,
      middle_name: body.middleName,
      last_name: body.lastName,
      date_of_birth: `${body.dateOfBirth}T00:00:00.000Z`,
      gender: body.gender,
    });
    if (body.phoneNumber || body.email) {
      db.insert('Contact_Information', {
        patient_id: patient.patient_id,
        owner_type: 'Patient',
        phone_number: body.phoneNumber ?? null,
        email: body.email ?? null,
        contact_type: 'Personal',
      });
    }
    audit(db, req.user, 'Patient_Create', 'New patient registered',
      `New patient registered: ${body.firstName ?? ''} ${body.lastName ?? ''} (File #${body.fileNumber ?? ''})`);
    return created({ patientId: patient.patient_id }, 'Patient registered successfully');
  });

  r.get('/patients', ['Admin', 'Doctor', 'Receptionist', 'DentalAssistant'], ({ query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = String(query['search'] ?? '');
    const all = db.tables.Patients
      .filter(p => !p.deleted_at && matchesSearch(p, search))
      .sort((a, b) => a.patient_id - b.patient_id);
    const rows = all.slice(offset, offset + limit).map(p => listRow(db, p, false, true));
    return ok({ rows, total: all.length, page, limit });
  });

  r.get('/patients/my', ['Student'], ({ user, query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = String(query['search'] ?? '');
    if (!user.academicId) return ok({ rows: [], total: 0, page, limit });
    const ids = new Set(db.tables.Appointments
      .filter(a => a.academic_id === user.academicId && !a.deleted_at)
      .map(a => a.patient_id));
    const all = db.tables.Patients
      .filter(p => !p.deleted_at && ids.has(p.patient_id) && matchesSearch(p, search))
      .sort((a, b) => a.patient_id - b.patient_id);
    const rows = all.slice(offset, offset + limit).map(p => listRow(db, p, true, false));
    return ok({ rows, total: all.length, page, limit });
  });

  r.get('/patients/:id', ['Admin', 'Doctor', 'Receptionist', 'DentalAssistant', 'Student'], ({ params, db }) => {
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid patient ID');
    const p = db.tables.Patients.find(x => x.patient_id === id && !x.deleted_at);
    if (!p) return notFound('Patient not found');
    return ok(listRow(db, p, true, false));
  });

  r.patch('/patients/:id/phone', ['Admin', 'Receptionist'], (req) => {
    const { params, body, db } = req;
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound('Invalid patient ID');
    if (typeof body?.phoneNumber !== 'string' || body.phoneNumber.length > 20) {
      return badRequest('Expected string, received ' + typeof body?.phoneNumber);
    }
    const rows = db.tables.Contact_Information.filter(c => c.patient_id === id && c.owner_type === 'Patient');
    if (rows.length) rows.forEach(c => (c.phone_number = body.phoneNumber));
    else db.insert('Contact_Information', { patient_id: id, owner_type: 'Patient', phone_number: body.phoneNumber, contact_type: 'Personal' });
    db.save();
    audit(db, req.user, 'Patient_Update', 'Patient phone number updated', `Patient #${params['id']} phone number updated`);
    return ok(null, 'Phone number updated');
  });
}

// createPatientSchema (patient.routes.ts)
function validatePatient(b: any): string[] {
  const errors: string[] = [];
  const posInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
  const name = (v: unknown) => typeof v === 'string' && v.length >= 1 && v.length <= 100;
  if (!posInt(b?.fileNumber)) errors.push('File number must be a positive whole number');
  if (!posInt(b?.nationalId)) errors.push('National ID must be a positive whole number');
  if (!name(b?.firstName) || !name(b?.middleName) || !name(b?.lastName)) errors.push('First, middle and last name are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b?.dateOfBirth ?? ''))) errors.push('Use YYYY-MM-DD format');
  if (b?.gender !== 'Male' && b?.gender !== 'Female') errors.push("Invalid enum value. Expected 'Male' | 'Female'");
  if (b?.phoneNumber !== undefined && (typeof b.phoneNumber !== 'string' || b.phoneNumber.length > 20)) errors.push('Invalid phone number');
  if (b?.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) errors.push('Invalid email');
  return errors;
}
