import sql from 'mssql';
import { getPool } from '../config/db.config';

export type ContactOwnerType = 'Employee' | 'Student';

export interface ContactOwner {
  type: ContactOwnerType;
  id: number;
}

export interface ContactRow {
  contact_id: number;
  contact_type: string;
  email: string;
  phone_number: string;
}

function ownerCol(type: ContactOwnerType): string {
  return type === 'Employee' ? 'employee_id' : 'student_id';
}

export async function findContactsByOwner(owner: ContactOwner): Promise<ContactRow[]> {
  const pool = await getPool();
  const col = ownerCol(owner.type);
  const result = await pool
    .request()
    .input('ownerId', sql.Int, owner.id)
    .query<ContactRow>(
      `SELECT contact_id, contact_type, email, phone_number
       FROM Contact_Information
       WHERE ${col} = @ownerId`,
    );
  return result.recordset;
}

export async function insertContactForOwner(
  owner: ContactOwner,
  data: { contact_type: string; email: string; phone_number: string },
  transaction: sql.Transaction,
): Promise<ContactRow> {
  const col = ownerCol(owner.type);
  const result = await transaction
    .request()
    .input('ownerId', sql.Int, owner.id)
    .input('ownerType', sql.NVarChar(20), owner.type)
    .input('contact_type', sql.NVarChar(50), data.contact_type)
    .input('email', sql.NVarChar(255), data.email)
    .input('phone_number', sql.NVarChar(20), data.phone_number)
    .query<ContactRow>(
      `INSERT INTO Contact_Information (${col}, owner_type, contact_type, email, phone_number)
       OUTPUT INSERTED.contact_id, INSERTED.contact_type, INSERTED.email, INSERTED.phone_number
       VALUES (@ownerId, @ownerType, @contact_type, @email, @phone_number)`,
    );
  return result.recordset[0];
}

export async function updateContactForOwner(
  owner: ContactOwner,
  contactId: number,
  data: { contact_type: string; email: string; phone_number: string },
  transaction: sql.Transaction,
): Promise<ContactRow | null> {
  const col = ownerCol(owner.type);
  const result = await transaction
    .request()
    .input('contactId', sql.Int, contactId)
    .input('ownerId', sql.Int, owner.id)
    .input('contact_type', sql.NVarChar(50), data.contact_type)
    .input('email', sql.NVarChar(255), data.email)
    .input('phone_number', sql.NVarChar(20), data.phone_number)
    .query<ContactRow>(
      `UPDATE Contact_Information
       SET contact_type = @contact_type, email = @email, phone_number = @phone_number
       OUTPUT INSERTED.contact_id, INSERTED.contact_type, INSERTED.email, INSERTED.phone_number
       WHERE contact_id = @contactId AND ${col} = @ownerId`,
    );
  return result.recordset[0] ?? null;
}

export async function deleteContactsForOwner(
  owner: ContactOwner,
  contactIds: number[],
  transaction: sql.Transaction,
): Promise<number> {
  if (contactIds.length === 0) return 0;
  const col = ownerCol(owner.type);
  const req = transaction.request().input('ownerId', sql.Int, owner.id);
  const placeholders = contactIds
    .map((id, i) => { req.input(`cid${i}`, sql.Int, id); return `@cid${i}`; })
    .join(', ');
  const result = await req.query(
    `DELETE FROM Contact_Information
     WHERE ${col} = @ownerId AND contact_id IN (${placeholders})`,
  );
  return result.rowsAffected[0];
}
