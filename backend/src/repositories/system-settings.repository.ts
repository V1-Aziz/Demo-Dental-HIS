// Repository for System_Settings — global key/value configuration store.
// All SQL is here; no business logic. Callers are system-settings.service.ts only.
import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface SystemSetting {
  setting_key:   string;
  setting_value: string;
  description:   string;
  updated_by:    number | null;
  updated_at:    string;
}

export async function getAllSettings(): Promise<SystemSetting[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<SystemSetting>(
      `SELECT setting_key, setting_value, description, updated_by, updated_at
       FROM System_Settings
       ORDER BY setting_key`,
    );
  return result.recordset;
}

export async function getSettingByKey(key: string): Promise<SystemSetting | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('key', sql.VarChar(100), key)
    .query<SystemSetting>(
      `SELECT setting_key, setting_value, description, updated_by, updated_at
       FROM System_Settings
       WHERE setting_key = @key`,
    );
  return result.recordset.length ? result.recordset[0] : null;
}

export async function updateSetting(
  key:       string,
  value:     string,
  updatedBy: number,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('key',       sql.VarChar(100), key)
    .input('value',     sql.VarChar(500), value)
    .input('updatedBy', sql.Int,          updatedBy)
    .query(
      `UPDATE System_Settings
       SET setting_value = @value,
           updated_by    = @updatedBy,
           updated_at    = GETUTCDATE()
       WHERE setting_key = @key`,
    );
}
