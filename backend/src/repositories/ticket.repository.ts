import sql from 'mssql';
import { getPool } from '../config/db.config';

/**
 * Correlated subqueries for every lookup table.
 * This guarantees exactly one row per ticket/message even when reference tables
 * (Roles, Ticket_Type, Employee, Student) contain duplicate rows from repeated
 * seed runs.
 */
const TYPE_NAME = `(SELECT TOP 1 type_name FROM Ticket_Type WHERE ticket_type_id = t.ticket_type_id)`;
const SUBMITTER_NAME = `
  ISNULL(
    (SELECT TOP 1 first_name + ' ' + last_name FROM Employee WHERE user_id = u.user_id),
    (SELECT TOP 1 first_name + ' ' + last_name FROM Student  WHERE user_id = u.user_id)
  )`;

/** Returns active ticket types for non-admin consumers (ticket creation form). */
export async function getTicketTypes(): Promise<{ ticket_type_id: number; type_name: string }[]> {
  const pool = await getPool();
  const result = await pool.request().query<{ ticket_type_id: number; type_name: string }>(
    `SELECT MIN(ticket_type_id) AS ticket_type_id, type_name
     FROM Ticket_Type
     WHERE is_active = 1
     GROUP BY type_name
     ORDER BY MIN(display_order), MIN(ticket_type_id)`,
  );
  return result.recordset;
}

export async function createTicket(
  userId: number,
  ticketTypeId: number,
  details: string,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('userId',       sql.Int,               userId)
    .input('ticketTypeId', sql.Int,               ticketTypeId)
    .input('details',      sql.NVarChar(sql.MAX), details)
    .query(
      `INSERT INTO Tickets (user_id, ticket_type_id, details)
       VALUES (@userId, @ticketTypeId, @details)`,
    );
}

export async function getTicketsByUser(
  userId: number,
  limit: number,
  offset: number,
  search?: string,
  statusFilter?: string,
  subjectFilter?: string,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();

  const conditions: string[] = [`t.user_id = @userId`];
  if (statusFilter  && statusFilter  !== 'All') conditions.push(`t.status = @statusFilter`);
  if (subjectFilter && subjectFilter !== 'All') conditions.push(`${TYPE_NAME} = @subjectFilter`);
  if (search) conditions.push(`(${TYPE_NAME} LIKE @search OR t.details LIKE @search OR CAST(t.ticket_id AS NVARCHAR) LIKE @search)`);
  const where = `WHERE ${conditions.join(' AND ')}`;

  const countReq = pool.request().input('userId', sql.Int, userId);
  if (statusFilter  && statusFilter  !== 'All') countReq.input('statusFilter',  sql.NVarChar(50),  statusFilter);
  if (subjectFilter && subjectFilter !== 'All') countReq.input('subjectFilter', sql.NVarChar(255), subjectFilter);
  if (search) countReq.input('search', sql.NVarChar(200), `%${search}%`);
  const countResult = await countReq.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM Tickets t ${where}`,
  );

  const dataReq = pool.request()
    .input('userId', sql.Int, userId)
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset);
  if (statusFilter  && statusFilter  !== 'All') dataReq.input('statusFilter',  sql.NVarChar(50),  statusFilter);
  if (subjectFilter && subjectFilter !== 'All') dataReq.input('subjectFilter', sql.NVarChar(255), subjectFilter);
  if (search) dataReq.input('search', sql.NVarChar(200), `%${search}%`);
  const rows = await dataReq.query(
    `SELECT t.ticket_id, t.details, ${TYPE_NAME} AS type_name,
            t.status, t.created_at, t.updated_at
     FROM Tickets t
     ${where}
     ORDER BY t.ticket_id DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function getAllTickets(
  limit: number,
  offset: number,
  search?: string,
  statusFilter?: string,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();

  const conditions: string[] = [];
  if (statusFilter && statusFilter !== 'All') {
    conditions.push(`t.status = @statusFilter`);
  }
  if (search) {
    conditions.push(`(
      ${TYPE_NAME} LIKE @search
      OR ${SUBMITTER_NAME} LIKE @search
      OR t.details LIKE @search
      OR CAST(t.ticket_id AS NVARCHAR) LIKE @search
    )`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countReq = pool.request();
  if (statusFilter && statusFilter !== 'All') countReq.input('statusFilter', sql.NVarChar(20), statusFilter);
  if (search) countReq.input('search', sql.NVarChar(200), `%${search}%`);
  const countResult = await countReq.query<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM Tickets t
     JOIN Users u ON u.user_id = t.user_id
     ${where}`,
  );

  const dataReq = pool.request()
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset);
  if (statusFilter && statusFilter !== 'All') dataReq.input('statusFilter', sql.NVarChar(20), statusFilter);
  if (search) dataReq.input('search', sql.NVarChar(200), `%${search}%`);
  const rows = await dataReq.query(
    `SELECT t.ticket_id, t.details,
            (SELECT TOP 1 type_name FROM Ticket_Type WHERE ticket_type_id = t.ticket_type_id) AS type_name,
            t.status, t.created_at, t.updated_at,
            ${SUBMITTER_NAME} AS submitted_by_name,
            (SELECT TOP 1 role_name FROM Roles WHERE role_id = u.role_id) AS role_name,
            u.user_id AS submitter_user_id
     FROM Tickets t
     JOIN Users u ON u.user_id = t.user_id
     ${where}
     ORDER BY t.ticket_id DESC
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
  );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function getTicketById(ticketId: number): Promise<unknown | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('ticketId', sql.Int, ticketId)
    .query(
      `SELECT t.ticket_id, t.details,
              (SELECT TOP 1 type_name FROM Ticket_Type WHERE ticket_type_id = t.ticket_type_id) AS type_name,
              t.status, t.created_at, t.updated_at,
              ${SUBMITTER_NAME} AS submitted_by_name,
              (SELECT TOP 1 role_name FROM Roles WHERE role_id = u.role_id) AS role_name,
              u.user_id AS submitter_user_id
       FROM Tickets t
       JOIN Users u ON u.user_id = t.user_id
       WHERE t.ticket_id = @ticketId`,
    );
  return result.recordset[0] ?? null;
}

export async function getTicketMessages(ticketId: number): Promise<unknown[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('ticketId', sql.Int, ticketId)
    .query(
      `SELECT tm.message_id, tm.message_text, tm.is_resolution_note, tm.created_at,
              tm.sender_user_id,
              ISNULL(
                (SELECT TOP 1 first_name + ' ' + last_name FROM Employee WHERE user_id = u.user_id),
                (SELECT TOP 1 first_name + ' ' + last_name FROM Student  WHERE user_id = u.user_id)
              ) AS sender_name,
              (SELECT TOP 1 role_name FROM Roles WHERE role_id = u.role_id) AS sender_role
       FROM Ticket_Messages tm
       JOIN Users u ON u.user_id = tm.sender_user_id
       WHERE tm.ticket_id = @ticketId
       ORDER BY tm.created_at ASC`,
    );
  return result.recordset;
}

export async function addTicketMessage(
  ticketId: number,
  senderUserId: number,
  messageText: string,
  isResolutionNote: boolean,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('ticketId',         sql.Int,               ticketId)
    .input('senderUserId',     sql.Int,               senderUserId)
    .input('messageText',      sql.NVarChar(sql.MAX), messageText)
    .input('isResolutionNote', sql.Bit,               isResolutionNote ? 1 : 0)
    .query(
      `INSERT INTO Ticket_Messages (ticket_id, sender_user_id, message_text, is_resolution_note)
       VALUES (@ticketId, @senderUserId, @messageText, @isResolutionNote);
       UPDATE Tickets SET updated_at = GETDATE() WHERE ticket_id = @ticketId;`,
    );
}

/** Sets status to 'In Progress' only when the ticket is still 'Open' (first admin reply). */
export async function markTicketInProgress(ticketId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('ticketId', sql.Int, ticketId)
    .query(`UPDATE Tickets SET status = 'In Progress', updated_at = GETDATE()
            WHERE ticket_id = @ticketId AND status = 'Open'`);
}

export async function resolveTicket(ticketId: number): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('ticketId', sql.Int, ticketId)
    .query(`UPDATE Tickets SET status = 'Resolved', updated_at = GETDATE() WHERE ticket_id = @ticketId`);
}
