import sql from 'mssql';
import { getPool } from '../config/db.config';

export async function getAuditLogs(
  search: string,
  role: string,
  action: string,
  date: string,
  limit: number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();
  const likeSearch = `%${search}%`;
  const likeAction = action ? `%${action}%` : null;

  const baseQuery = `
    FROM Audit_Log al
    JOIN Users u ON u.user_id = al.user_id
    JOIN Roles r ON r.role_id = u.role_id
    WHERE (al.event_type LIKE @search OR al.event_description LIKE @search OR al.details LIKE @search)
      AND (@role IS NULL OR r.role_name = @role)
      AND (@action IS NULL OR al.event_type LIKE @action)
      AND (@date IS NULL OR CAST(al.timestamp AS DATE) = @date)
  `;

  const countResult = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .input('role', sql.NVarChar(50), role || null)
    .input('action', sql.NVarChar(255), likeAction)
    .input('date', sql.Date, date || null)
    .query<{ total: number }>(`SELECT COUNT(*) AS total ${baseQuery}`);

  const rows = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .input('role', sql.NVarChar(50), role || null)
    .input('action', sql.NVarChar(255), likeAction)
    .input('date', sql.Date, date || null)
    .input('limit', sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(
      `SELECT al.event_id, al.event_type, al.event_description, al.details,
              al.operation_status, al.timestamp,
              u.email AS user_email, r.role_name,
              al.patient_id
       ${baseQuery}
       ORDER BY al.timestamp DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}
