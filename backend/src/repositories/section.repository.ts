// Parameterised SQL for the Sections and Employee_Section tables.
// No business logic here — orchestration lives in appointment.service.ts.
import sql from 'mssql';
import { getPool } from '../config/db.config';

/** Returns the user_ids of every active employee assigned to the given section.
 *  Used by the arrival notification fan-out to build the recipient set. */
export async function listUserIdsBySection(sectionId: number): Promise<number[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('sectionId', sql.Int, sectionId)
    .query<{ user_id: number }>(
      `SELECT e.user_id
       FROM Employee_Section es
       JOIN Employee e ON e.employee_id = es.employee_id
       JOIN Users    u ON u.user_id     = e.user_id
       WHERE es.section_id = @sectionId
         AND e.deleted_at  IS NULL
         AND u.account_status = 'Active'`,
    );
  return result.recordset.map(r => r.user_id);
}

export interface SectionRow {
  section_id:   number;
  section_name: string;
  description:  string | null;
  is_active:    boolean;
}

export async function listSections(): Promise<SectionRow[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .query<SectionRow>(
      `SELECT section_id, section_name, description, CAST(is_active AS BIT) AS is_active
       FROM Sections
       ORDER BY section_name`,
    );
  return result.recordset;
}
