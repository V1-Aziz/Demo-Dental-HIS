import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface UserRow {
  user_id: number;
  email: string;
  password: string;
  role_name: string;
  account_status: string;
  full_name: string;
  employee_id: number | null;
  academic_id: number | null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('email', sql.VarChar(255), email)
    .query<UserRow>(
      `SELECT u.user_id, u.email, u.password, u.account_status, r.role_name,
              ISNULL(e.first_name + ' ' + e.last_name, u.email) AS full_name,
              e.employee_id,
              st.academic_id
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       LEFT JOIN Employee e ON e.user_id = u.user_id
       LEFT JOIN Student st ON st.user_id = u.user_id
       WHERE u.email = @email`
    );
  return result.recordset[0] ?? null;
}

export async function updateLastLogin(userId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(`UPDATE Users SET last_login = GETDATE() WHERE user_id = @userId`);
}
