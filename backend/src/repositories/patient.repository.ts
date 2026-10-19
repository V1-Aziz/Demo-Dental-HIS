import sql from 'mssql';
import { getPool, withPool } from '../config/db.config';

export interface CreatePatientInput {
  fileNumber: number;
  nationalId: number;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phoneNumber?: string;
  email?: string;
}

// Creates a Patients row and (if a phone/email was supplied) a matching row
// in Contact_Information — both inside one transaction so a DB error on the
// contact insert rolls back the patient too. `owner_type = 'Patient'` is the
// discriminator because Contact_Information is shared with Employee/Student.
export async function createPatient(data: CreatePatientInput): Promise<unknown> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const patientResult = await new sql.Request(transaction)
      .input('fileNumber',  sql.Int,          data.fileNumber)
      .input('nationalId',  sql.BigInt,        data.nationalId)
      .input('firstName',   sql.NVarChar(100), data.firstName)
      .input('middleName',  sql.NVarChar(100), data.middleName)
      .input('lastName',    sql.NVarChar(100), data.lastName)
      .input('dateOfBirth', sql.Date,          data.dateOfBirth)
      .input('gender',      sql.NVarChar(10),  data.gender)
      .query<{ patient_id: number }>(
        `INSERT INTO Patients (file_number, national_id, first_name, middle_name, last_name, date_of_birth, gender)
         OUTPUT INSERTED.patient_id
         VALUES (@fileNumber, @nationalId, @firstName, @middleName, @lastName, @dateOfBirth, @gender)`,
      );

    const patientId = patientResult.recordset[0].patient_id;

    if (data.phoneNumber || data.email) {
      await new sql.Request(transaction)
        .input('patientId',   sql.Int,          patientId)
        .input('phoneNumber', sql.NVarChar(20),  data.phoneNumber ?? null)
        .input('email',       sql.NVarChar(255), data.email ?? null)
        .query(
          `INSERT INTO Contact_Information (patient_id, owner_type, phone_number, email, contact_type)
           VALUES (@patientId, 'Patient', @phoneNumber, @email, 'Personal')`,
        );
    }

    await transaction.commit();
    return { patientId };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function getPatients(
  search: string,
  limit: number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  return withPool(async (pool) => {
    const likeSearch = `%${search}%`;

    const countResult = await pool
      .request()
      .input('search', sql.NVarChar(255), likeSearch)
      .query<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM Patients
         WHERE deleted_at IS NULL
           AND (
             first_name + ' ' + middle_name + ' ' + last_name LIKE @search
             OR CAST(file_number AS VARCHAR) LIKE @search
             OR CAST(national_id AS VARCHAR) LIKE @search
           )`,
      );

    const rows = await pool
      .request()
      .input('search', sql.NVarChar(255), likeSearch)
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset)
      .query(
        `SELECT p.patient_id, p.file_number, p.national_id, p.gender, p.date_of_birth,
                p.first_name, p.middle_name, p.last_name,
                p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS full_name,
                (SELECT TOP 1 phone_number FROM Contact_Information WHERE patient_id = p.patient_id AND owner_type = 'Patient') AS phone_number,
                (SELECT TOP 1 chief_complaint  FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS chief_complaint,
                (SELECT TOP 1 chronic_diseases FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS chronic_diseases
         FROM Patients p
         WHERE p.deleted_at IS NULL
           AND (
             p.first_name + ' ' + p.middle_name + ' ' + p.last_name LIKE @search
             OR CAST(p.file_number AS VARCHAR) LIKE @search
             OR CAST(p.national_id AS VARCHAR) LIKE @search
           )
         ORDER BY p.patient_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      );

    return { rows: rows.recordset, total: countResult.recordset[0].total };
  });
}

// UPSERT pattern for phone: a patient created without contact info won't
// have a Contact_Information row yet, so we can't just UPDATE. IF EXISTS
// avoids a round-trip SELECT from JS and keeps the whole thing atomic.
export async function updatePatientPhone(patientId: number, phoneNumber: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('patientId',   sql.Int,          patientId)
    .input('phoneNumber', sql.NVarChar(20),  phoneNumber)
    .query(
      `IF EXISTS (SELECT 1 FROM Contact_Information WHERE patient_id = @patientId AND owner_type = 'Patient')
         UPDATE Contact_Information SET phone_number = @phoneNumber
         WHERE patient_id = @patientId AND owner_type = 'Patient'
       ELSE
         INSERT INTO Contact_Information (patient_id, owner_type, phone_number, contact_type)
         VALUES (@patientId, 'Patient', @phoneNumber, 'Personal')`,
    );
}

export async function getPatientById(patientId: number): Promise<unknown | null> {
  const pool = await getPool();

  const patientResult = await pool
    .request()
    .input('patientId', sql.Int, patientId)
    .query(
      `SELECT p.patient_id, p.file_number, p.national_id, p.gender, p.date_of_birth,
              p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS full_name,
              (SELECT TOP 1 phone_number FROM Contact_Information WHERE patient_id = p.patient_id AND owner_type = 'Patient') AS phone_number,
              (SELECT TOP 1 record_id        FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS record_id,
              (SELECT TOP 1 chief_complaint  FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS chief_complaint,
              (SELECT TOP 1 chronic_diseases FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS chronic_diseases
       FROM Patients p
       WHERE p.patient_id = @patientId AND p.deleted_at IS NULL`,
    );

  if (!patientResult.recordset.length) return null;
  return patientResult.recordset[0];
}

export async function searchPatients(
  q: string,
  limit: number,
  offset: number,
): Promise<unknown[]> {
  const pool = await getPool();
  const likeSearch = q ? `%${q}%` : '%';
  const rows = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(
      `SELECT p.patient_id, p.file_number, p.academic_id,
              p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS full_name,
              p.gender, p.date_of_birth
       FROM Patients p
       WHERE p.deleted_at IS NULL
         AND (
           p.first_name + ' ' + p.middle_name + ' ' + p.last_name LIKE @search
           OR CAST(p.file_number AS VARCHAR) LIKE @search
         )
       ORDER BY p.first_name, p.last_name
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );
  return rows.recordset;
}

// Students can only see patients they have appointments with. The JOIN/IN
// subquery on Appointments.academic_id enforces this at the DB level — do
// NOT widen to the full Patients table for student roles in the frontend.
export async function getPatientsByStudentId(
  studentId: number,
  search: string,
  limit: number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  return withPool(async (pool) => {
    const likeSearch = `%${search}%`;

    const countResult = await pool
      .request()
      .input('studentId', sql.Int, studentId)
      .input('search', sql.NVarChar(255), likeSearch)
      .query<{ total: number }>(
        `SELECT COUNT(DISTINCT p.patient_id) AS total
         FROM Patients p
         JOIN Appointments a ON a.patient_id = p.patient_id AND a.deleted_at IS NULL
         WHERE a.academic_id = @studentId
           AND p.deleted_at IS NULL
           AND (
             p.first_name + ' ' + p.middle_name + ' ' + p.last_name LIKE @search
             OR CAST(p.file_number AS VARCHAR) LIKE @search
             OR CAST(p.national_id AS VARCHAR) LIKE @search
           )`,
      );

    const rows = await pool
      .request()
      .input('studentId', sql.Int, studentId)
      .input('search', sql.NVarChar(255), likeSearch)
      .input('limit', sql.Int, limit)
      .input('offset', sql.Int, offset)
      .query(
        `SELECT p.patient_id, p.file_number, p.national_id, p.gender, p.date_of_birth,
                p.first_name + ' ' + p.middle_name + ' ' + p.last_name AS full_name,
                (SELECT TOP 1 phone_number FROM Contact_Information WHERE patient_id = p.patient_id AND owner_type = 'Patient') AS phone_number,
                (SELECT TOP 1 record_id       FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS record_id,
                (SELECT TOP 1 chief_complaint  FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS chief_complaint,
                (SELECT TOP 1 chronic_diseases FROM Medical_Records WHERE patient_id = p.patient_id AND deleted_at IS NULL) AS chronic_diseases
         FROM Patients p
         WHERE p.deleted_at IS NULL
           AND p.patient_id IN (
             SELECT DISTINCT a.patient_id FROM Appointments a
             WHERE a.academic_id = @studentId AND a.deleted_at IS NULL
           )
           AND (
             p.first_name + ' ' + p.middle_name + ' ' + p.last_name LIKE @search
             OR CAST(p.file_number AS VARCHAR) LIKE @search
             OR CAST(p.national_id AS VARCHAR) LIKE @search
           )
         ORDER BY p.patient_id
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      );

    return { rows: rows.recordset, total: countResult.recordset[0].total };
  });
}
