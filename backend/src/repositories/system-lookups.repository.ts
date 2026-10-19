import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface LookupRow {
  lookup_id:     number;
  category_key:  string;
  value_label:   string;
  display_order: number;
  is_active:     boolean;
}

export async function getLookupsByCategory(
  categoryKey: string,
  activeOnly = false,
): Promise<LookupRow[]> {
  const pool = await getPool();
  const activeFilter = activeOnly ? 'AND is_active = 1' : '';
  const result = await pool
    .request()
    .input('categoryKey', sql.VarChar(60), categoryKey)
    .query<LookupRow>(`
      SELECT lookup_id, category_key, value_label, display_order,
             CAST(is_active AS BIT) AS is_active
      FROM System_Lookups
      WHERE category_key = @categoryKey ${activeFilter}
      ORDER BY display_order, lookup_id
    `);
  return result.recordset;
}

export async function countLookupsByCategory(categoryKey: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('categoryKey', sql.VarChar(60), categoryKey)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM System_Lookups WHERE category_key = @categoryKey`,
    );
  return result.recordset[0].cnt;
}

export async function getLookupById(lookupId: number): Promise<LookupRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('lookupId', sql.Int, lookupId)
    .query<LookupRow>(`
      SELECT lookup_id, category_key, value_label, display_order,
             CAST(is_active AS BIT) AS is_active
      FROM System_Lookups WHERE lookup_id = @lookupId
    `);
  return result.recordset[0] ?? null;
}

export async function getMaxDisplayOrder(categoryKey: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('categoryKey', sql.VarChar(60), categoryKey)
    .query<{ maxOrder: number | null }>(
      `SELECT MAX(display_order) AS maxOrder FROM System_Lookups WHERE category_key = @categoryKey`,
    );
  return result.recordset[0].maxOrder ?? 0;
}

export async function insertLookupValue(data: {
  categoryKey:   string;
  valueLabel:    string;
  displayOrder:  number;
  createdBy:     number;
}): Promise<LookupRow> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('categoryKey',  sql.VarChar(60),  data.categoryKey)
    .input('valueLabel',   sql.VarChar(150), data.valueLabel)
    .input('displayOrder', sql.Int,          data.displayOrder)
    .input('createdBy',    sql.Int,          data.createdBy)
    .query<LookupRow>(`
      INSERT INTO System_Lookups (category_key, value_label, display_order, created_by, updated_by)
      OUTPUT INSERTED.lookup_id, INSERTED.category_key, INSERTED.value_label,
             INSERTED.display_order, CAST(INSERTED.is_active AS BIT) AS is_active
      VALUES (@categoryKey, @valueLabel, @displayOrder, @createdBy, @createdBy)
    `);
  return result.recordset[0];
}

export async function updateLookupValue(
  lookupId: number,
  data: {
    valueLabel?:   string;
    displayOrder?: number;
    isActive?:     boolean;
    updatedBy:     number;
  },
): Promise<LookupRow | null> {
  const sets: string[] = ['updated_at = GETUTCDATE()', 'updated_by = @updatedBy'];
  const pool = await getPool();
  const req  = pool.request()
    .input('lookupId',  sql.Int, lookupId)
    .input('updatedBy', sql.Int, data.updatedBy);

  if (data.valueLabel !== undefined) {
    req.input('valueLabel', sql.VarChar(150), data.valueLabel);
    sets.push('value_label = @valueLabel');
  }
  if (data.displayOrder !== undefined) {
    req.input('displayOrder', sql.Int, data.displayOrder);
    sets.push('display_order = @displayOrder');
  }
  if (data.isActive !== undefined) {
    req.input('isActive', sql.Bit, data.isActive ? 1 : 0);
    sets.push('is_active = @isActive');
  }

  const result = await req.query<LookupRow>(`
    UPDATE System_Lookups
    SET ${sets.join(', ')}
    OUTPUT INSERTED.lookup_id, INSERTED.category_key, INSERTED.value_label,
           INSERTED.display_order, CAST(INSERTED.is_active AS BIT) AS is_active
    WHERE lookup_id = @lookupId
  `);
  return result.recordset[0] ?? null;
}

export async function deleteLookupValue(lookupId: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('lookupId', sql.Int, lookupId)
    .query(`DELETE FROM System_Lookups OUTPUT DELETED.lookup_id WHERE lookup_id = @lookupId`);
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function reorderLookupValues(
  categoryKey: string,
  orderedIds: number[],
  updatedBy: number,
): Promise<void> {
  if (orderedIds.length === 0) return;
  const pool = await getPool();

  for (let i = 0; i < orderedIds.length; i++) {
    await pool
      .request()
      .input('lookupId',     sql.Int,         orderedIds[i])
      .input('displayOrder', sql.Int,         i + 1)
      .input('categoryKey',  sql.VarChar(60), categoryKey)
      .input('updatedBy',    sql.Int,         updatedBy)
      .query(
        `UPDATE System_Lookups
         SET display_order = @displayOrder, updated_by = @updatedBy, updated_at = GETUTCDATE()
         WHERE lookup_id = @lookupId AND category_key = @categoryKey`,
      );
  }
}

// ─── Delegation helpers for non-System_Lookups sources ──────────────────────

export async function getRoles(): Promise<{ id: number; label: string; isActive: boolean }[]> {
  const pool = await getPool();
  const result = await pool.request().query<{ role_id: number; role_name: string }>(
    `SELECT role_id, role_name FROM Roles ORDER BY role_id`,
  );
  return result.recordset.map(r => ({ id: r.role_id, label: r.role_name, isActive: true }));
}

export interface AppointmentTypeRow {
  type_id:       number;
  type_name:     string;
  duration:      number;
  is_active:     boolean;
  display_order: number;
}

export async function getAppointmentTypes(): Promise<AppointmentTypeRow[]> {
  const pool = await getPool();
  const result = await pool.request().query<AppointmentTypeRow>(
    `SELECT type_id, type_name, duration,
            CAST(is_active AS BIT) AS is_active,
            display_order
     FROM Appointment_Type
     ORDER BY display_order ASC, type_id ASC`,
  );
  return result.recordset;
}

export async function updateAppointmentType(
  id: number,
  data: { typeName?: string; duration?: number; isActive?: boolean; displayOrder?: number },
): Promise<void> {
  const sets: string[] = [];
  const pool = await getPool();
  const req = pool.request().input('id', sql.Int, id);

  if (data.typeName      !== undefined) { req.input('typeName',      sql.NVarChar(100), data.typeName);      sets.push('type_name = @typeName'); }
  if (data.duration      !== undefined) { req.input('duration',      sql.Int,           data.duration);      sets.push('duration = @duration'); }
  if (data.isActive      !== undefined) { req.input('isActive',      sql.Bit,           data.isActive ? 1:0);sets.push('is_active = @isActive'); }
  if (data.displayOrder  !== undefined) { req.input('displayOrder',  sql.Int,           data.displayOrder);  sets.push('display_order = @displayOrder'); }
  if (sets.length === 0) return;
  await req.query(`UPDATE Appointment_Type SET ${sets.join(', ')} WHERE type_id = @id`);
}

export async function reorderAppointmentTypes(orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const pool = await getPool();
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.request()
      .input('id',    sql.Int, orderedIds[i])
      .input('order', sql.Int, i + 1)
      .query(`UPDATE Appointment_Type SET display_order = @order WHERE type_id = @id`);
  }
}

export interface TicketTypeRow {
  ticket_type_id: number;
  type_name:      string;
  description:    string | null;
  is_active:      boolean;
  display_order:  number;
}

export async function getTicketTypes(): Promise<TicketTypeRow[]> {
  const pool = await getPool();
  const result = await pool.request().query<TicketTypeRow>(
    `SELECT ticket_type_id, type_name, description,
            CAST(is_active AS BIT) AS is_active,
            display_order
     FROM Ticket_Type
     ORDER BY display_order ASC, ticket_type_id ASC`,
  );
  return result.recordset;
}

export async function updateTicketType(
  id: number,
  data: { typeName?: string; description?: string; isActive?: boolean; displayOrder?: number },
): Promise<void> {
  const sets: string[] = [];
  const pool = await getPool();
  const req = pool.request().input('id', sql.Int, id);

  if (data.typeName      !== undefined) { req.input('typeName',      sql.NVarChar(100), data.typeName);      sets.push('type_name = @typeName'); }
  if (data.description   !== undefined) { req.input('description',   sql.VarChar(255),  data.description);   sets.push('description = @description'); }
  if (data.isActive      !== undefined) { req.input('isActive',      sql.Bit,           data.isActive ? 1:0);sets.push('is_active = @isActive'); }
  if (data.displayOrder  !== undefined) { req.input('displayOrder',  sql.Int,           data.displayOrder);  sets.push('display_order = @displayOrder'); }
  if (sets.length === 0) return;
  await req.query(`UPDATE Ticket_Type SET ${sets.join(', ')} WHERE ticket_type_id = @id`);
}

export async function reorderTicketTypes(orderedIds: number[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const pool = await getPool();
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.request()
      .input('id',    sql.Int, orderedIds[i])
      .input('order', sql.Int, i + 1)
      .query(`UPDATE Ticket_Type SET display_order = @order WHERE ticket_type_id = @id`);
  }
}
