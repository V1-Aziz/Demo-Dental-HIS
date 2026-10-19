import sql from 'mssql';
import { getPool } from '../config/db.config';

export async function getUsers(
  search: string,
  limit: number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();
  const likeSearch = `%${search}%`;

  const countResult = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM Users u
       JOIN Roles r ON r.role_id = u.role_id
       WHERE u.email LIKE @search
          OR r.role_name LIKE @search
          OR ISNULL(
               (SELECT TOP 1 first_name + ' ' + last_name FROM Employee WHERE user_id = u.user_id AND deleted_at IS NULL),
               ''
             ) LIKE @search`,
    );

  const rows = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .input('limit', sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(
      `SELECT u.user_id, u.email, u.account_status, u.created_at, u.last_login,
              r.role_name,
              ISNULL(
                (SELECT TOP 1 first_name + ' ' + last_name FROM Employee WHERE user_id = u.user_id AND deleted_at IS NULL),
                ''
              ) AS full_name
       FROM Users u
       JOIN Roles r ON r.role_id = u.role_id
       WHERE u.email LIKE @search
          OR r.role_name LIKE @search
          OR ISNULL(
               (SELECT TOP 1 first_name + ' ' + last_name FROM Employee WHERE user_id = u.user_id AND deleted_at IS NULL),
               ''
             ) LIKE @search
       ORDER BY u.user_id
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function getRoles(): Promise<{ role_id: number; role_name: string }[]> {
  const pool = await getPool();
  const result = await pool.request().query<{ role_id: number; role_name: string }>(
    `SELECT role_id, role_name FROM Roles ORDER BY role_id`,
  );
  return result.recordset;
}

export async function updateUserById(
  userId:        number,
  roleId:        number,
  accountStatus: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('userId',        sql.Int,          userId)
    .input('roleId',        sql.Int,          roleId)
    .input('accountStatus', sql.NVarChar(20), accountStatus)
    .query(
      `UPDATE Users
       SET role_id = @roleId, account_status = @accountStatus
       WHERE user_id = @userId`,
    );
}

export interface UserProfile {
  user_id: number;
  email: string;
  role_id: number;
  role_name: string;
  account_status: string;
  full_name: string;
  owner_type: 'Employee' | 'Student' | null;
  owner_id: number | null;
}

export async function getUserProfileById(userId: number): Promise<UserProfile | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query<UserProfile>(`
      SELECT u.user_id, u.email, u.role_id, r.role_name, u.account_status,
        COALESCE(
          (SELECT TOP 1 e.first_name + ' ' + e.last_name FROM Employee e WHERE e.user_id = u.user_id AND e.deleted_at IS NULL),
          (SELECT TOP 1 s.first_name + ' ' + s.last_name FROM Student  s WHERE s.user_id = u.user_id),
          u.email
        ) AS full_name,
        CASE
          WHEN EXISTS (SELECT 1 FROM Employee e WHERE e.user_id = u.user_id AND e.deleted_at IS NULL) THEN 'Employee'
          WHEN EXISTS (SELECT 1 FROM Student  s WHERE s.user_id = u.user_id)                         THEN 'Student'
          ELSE NULL
        END AS owner_type,
        CASE
          WHEN EXISTS (SELECT 1 FROM Employee e WHERE e.user_id = u.user_id AND e.deleted_at IS NULL) THEN
            (SELECT TOP 1 e.employee_id FROM Employee e WHERE e.user_id = u.user_id AND e.deleted_at IS NULL)
          WHEN EXISTS (SELECT 1 FROM Student s WHERE s.user_id = u.user_id) THEN
            (SELECT TOP 1 s.academic_id FROM Student s WHERE s.user_id = u.user_id)
          ELSE NULL
        END AS owner_id
      FROM Users u
      JOIN Roles r ON r.role_id = u.role_id
      WHERE u.user_id = @userId
    `);
  return result.recordset[0] ?? null;
}

export async function updateUserAccountById(
  userId: number,
  fields: { email?: string; roleId?: number; accountStatus?: string },
  transaction: sql.Transaction,
): Promise<void> {
  const sets: string[] = [];
  const req = transaction.request().input('userId', sql.Int, userId);

  if (fields.email !== undefined) {
    req.input('email', sql.NVarChar(255), fields.email);
    sets.push('email = @email');
  }
  if (fields.roleId !== undefined) {
    req.input('roleId', sql.Int, fields.roleId);
    sets.push('role_id = @roleId');
  }
  if (fields.accountStatus !== undefined) {
    req.input('accountStatus', sql.NVarChar(20), fields.accountStatus);
    sets.push('account_status = @accountStatus');
  }

  if (sets.length === 0) return;
  await req.query(`UPDATE Users SET ${sets.join(', ')} WHERE user_id = @userId`);
}

export async function getEmployees(search: string): Promise<unknown[]> {
  const pool = await getPool();
  const likeSearch = `%${search}%`;

  const rows = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .query(
      `SELECT u.user_id, MIN(e.employee_id) AS employee_id,
              e.first_name + ' ' + e.last_name AS full_name,
              r.role_name
       FROM Employee e
       JOIN Users u ON u.user_id = e.user_id
       JOIN Roles  r ON r.role_id = u.role_id
       WHERE e.deleted_at IS NULL
         AND u.account_status = 'Active'
         AND (e.first_name + ' ' + e.last_name LIKE @search OR r.role_name LIKE @search)
       GROUP BY u.user_id, e.first_name + ' ' + e.last_name, r.role_name
       ORDER BY e.first_name + ' ' + e.last_name`,
    );

  return rows.recordset;
}
