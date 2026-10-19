import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface DentalChartNoteInput {
  recordId:           number;
  toothNumber:        string;
  toothNote:          string;
  authoredByStudent?: number;
  authoredByDoctor?:  number;
  appointmentId?:     number;
}

export async function getDentalChartByRecord(recordId: number): Promise<unknown[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId', sql.Int, recordId)
    .query(`
      SELECT
        dc.note_id,
        dc.tooth_number,
        dc.tooth_note,
        dc.created_at,
        dc.appointment_id,
        COALESCE(s.first_name + ' ' + s.last_name,
                 e.first_name + ' ' + e.last_name, 'Unknown') AS author_name,
        CASE WHEN dc.authored_by_student IS NOT NULL THEN 'Student' ELSE 'Doctor' END AS author_role
      FROM Dental_Chart dc
      LEFT JOIN Student  s ON s.academic_id = dc.authored_by_student
      LEFT JOIN Employee e ON e.employee_id = dc.authored_by_doctor
      WHERE dc.record_id = @recordId
      ORDER BY dc.created_at DESC
    `);
  return result.recordset;
}

export async function addDentalChartNote(
  data: DentalChartNoteInput,
): Promise<{ note_id: number }> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('recordId',          sql.Int,         data.recordId)
    .input('toothNumber',       sql.VarChar(10),  data.toothNumber)
    .input('toothNote',         sql.NVarChar(sql.MAX), data.toothNote)
    .input('authoredByStudent', sql.Int,         data.authoredByStudent ?? null)
    .input('authoredByDoctor',  sql.Int,         data.authoredByDoctor  ?? null)
    .input('appointmentId',     sql.Int,         data.appointmentId     ?? null)
    .query<{ note_id: number }>(`
      INSERT INTO Dental_Chart
        (record_id, tooth_number, tooth_note, authored_by_student, authored_by_doctor, appointment_id)
      OUTPUT INSERTED.note_id
      VALUES
        (@recordId, @toothNumber, @toothNote, @authoredByStudent, @authoredByDoctor, @appointmentId)
    `);
  return result.recordset[0];
}

export async function deleteDentalChartNote(noteId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('noteId', sql.Int, noteId)
    .query(`DELETE FROM Dental_Chart WHERE note_id = @noteId`);
}

export async function getDentalChartNoteById(noteId: number): Promise<{ record_id: number; appointment_id: number | null } | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('noteId', sql.Int, noteId)
    .query<{ record_id: number; appointment_id: number | null }>(
      `SELECT record_id, appointment_id FROM Dental_Chart WHERE note_id = @noteId`,
    );
  return result.recordset[0] ?? null;
}
