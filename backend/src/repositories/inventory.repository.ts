// Inventory repository — raw parameterized SQL for Inventory_Items,
// Stock_Transactions, and Inventory_Requests.  No business logic here;
// all orchestration (notifications, low-stock checks) lives in
// inventory.service.ts.
//
// Stock is tracked per batch: every deposit creates an Item_Batches row with
// its own expiry, so an item's quantity on hand and soonest expiry are always
// derived from its batches rather than stored on Inventory_Items.
import sql from 'mssql';
import { getPool } from '../config/db.config';
import {
  insertBatch,
  getActiveBatchesByItem,
  decrementBatch,
  getItemTotalQuantity,
} from './item_batches.repository';

// ─── Inventory Items ──────────────────────────────────────────────────────────

export async function getInventoryItems(
  search: string,
  limit:  number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool        = await getPool();
  const likeSearch  = `%${search}%`;

  const countResult = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM Inventory_Items i
       WHERE i.item_name LIKE @search OR i.category LIKE @search`,
    );

  // Quantity and expiry are aggregated from the item's batches.
  const rows = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(
      `SELECT i.item_id, i.item_name, i.category, i.low_stock_limit,
              i.supplier, i.unit_cost, i.register_date,
              u.email AS assigned_by_email,
              COALESCE(SUM(b.quantity_remaining), 0) AS quantity_on_hand,
              CONVERT(NVARCHAR,
                MIN(CASE WHEN b.quantity_remaining > 0 THEN b.expire_date END), 23
              ) AS soonest_expire_date,
              COUNT(CASE WHEN b.quantity_remaining > 0 THEN 1 END) AS active_batch_count
       FROM Inventory_Items i
       LEFT JOIN Users u         ON u.user_id = i.assigned_by
       LEFT JOIN Item_Batches b  ON b.item_id = i.item_id
       WHERE i.item_name LIKE @search OR i.category LIKE @search
       GROUP BY i.item_id, i.item_name, i.category, i.low_stock_limit,
                i.supplier, i.unit_cost, i.register_date, u.email
       ORDER BY i.item_id
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function getStockTransactions(
  limit:  number,
  offset: number,
): Promise<{ rows: unknown[]; total: number }> {
  const pool = await getPool();

  const countResult = await pool
    .request()
    .query<{ total: number }>(`SELECT COUNT(*) AS total FROM Stock_Transactions`);

  const rows = await pool
    .request()
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query(
      `SELECT st.transaction_id, st.transaction_type, st.quantity, st.time_stamp,
              st.item_id, i.item_name, i.category,
              u.email AS user_email
       FROM Stock_Transactions st
       JOIN Inventory_Items i ON i.item_id = st.item_id
       JOIN Users u           ON u.user_id = st.user_id
       ORDER BY st.time_stamp DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

// ─── Per-item deposit ─────────────────────────────────────────────────────────
// Creates one Item_Batches row and one Stock_Transactions row inside a single
// atomic transaction.  Returns the new batch_id.
export async function depositItemBatch(
  itemId:     number,
  quantity:   number,
  expireDate: string | null,
  userId:     number,
  notes?:     string | null,
): Promise<number> {
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const batchId = await insertBatch(
      { item_id: itemId, quantity, expire_date: expireDate, deposited_by: userId, notes: notes ?? null },
      transaction,
    );

    const txNotes = `Deposit batch #${batchId}${notes ? `: ${notes}` : ''}`;
    await new sql.Request(transaction)
      .input('itemId', sql.Int,           itemId)
      .input('userId', sql.Int,           userId)
      .input('qty',    sql.Int,           quantity)
      .input('txType', sql.VarChar(50),   'Deposit')
      .input('notes',  sql.NVarChar(500), txNotes.substring(0, 500))
      .query(
        `INSERT INTO Stock_Transactions (item_id, user_id, transaction_type, quantity, notes)
         VALUES (@itemId, @userId, @txType, @qty, @notes)`,
      );

    await transaction.commit();
    return batchId;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── Shared FEFO consumption helper ──────────────────────────────────────────
// Walks active batches in FEFO order (soonest expire_date first, NULLs last)
// and decrements them until `amount` is fully consumed.  Caller must hold a
// transaction and must have already verified that total stock >= amount.
async function consumeFefo(
  itemId: number,
  amount: number,
  tx:     sql.Transaction,
): Promise<{ consumed: { batch_id: number; quantity: number }[] }> {
  const batches  = await getActiveBatchesByItem(itemId, tx);
  const consumed: { batch_id: number; quantity: number }[] = [];
  let remaining  = amount;
  for (const batch of batches) {
    if (remaining === 0) break;
    const take = Math.min(remaining, batch.quantity_remaining);
    await decrementBatch(batch.batch_id, take, tx);
    consumed.push({ batch_id: batch.batch_id, quantity: take });
    remaining -= take;
  }
  return { consumed };
}

// ─── Per-item FEFO withdraw ───────────────────────────────────────────────────
// Validates stock, consumes from batches via consumeFefo, and writes one
// Stock_Transactions row — all inside a single atomic transaction.
//
// Throws typed errors so the controller can map to HTTP statuses:
//   'INSUFFICIENT_STOCK' (with .available/.requested) → 409
export async function withdrawItemFEFO(
  itemId: number,
  amount: number,
  userId: number,
  notes:  string,
): Promise<{ consumed: { batch_id: number; quantity: number }[] }> {
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // Lock all batch rows for this item to serialise concurrent withdrawals.
    const totalResult = await new sql.Request(transaction)
      .input('itemId', sql.Int, itemId)
      .query<{ total: number }>(
        `SELECT COALESCE(SUM(quantity_remaining), 0) AS total
         FROM Item_Batches WITH (UPDLOCK)
         WHERE item_id = @itemId`,
      );

    const total = totalResult.recordset[0].total;
    if (total < amount) {
      throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
        available: total,
        requested: amount,
      });
    }

    const { consumed } = await consumeFefo(itemId, amount, transaction);

    // One Stock_Transactions row for the whole withdrawal, notes list consumed batches.
    const batchDetail = consumed.map(c => `batch#${c.batch_id}(${c.quantity})`).join(', ');
    const fullNotes   = `${notes}. Consumed: ${batchDetail}`.substring(0, 500);
    await new sql.Request(transaction)
      .input('itemId', sql.Int,           itemId)
      .input('userId', sql.Int,           userId)
      .input('qty',    sql.Int,           amount)
      .input('txType', sql.VarChar(50),   'Withdraw')
      .input('notes',  sql.NVarChar(500), fullNotes)
      .query(
        `INSERT INTO Stock_Transactions (item_id, user_id, transaction_type, quantity, notes)
         VALUES (@itemId, @userId, @txType, @qty, @notes)`,
      );

    await transaction.commit();
    return { consumed };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── Item CRUD ────────────────────────────────────────────────────────────────

export async function deleteInventoryItem(itemId: number): Promise<void> {
  const pool = await getPool();
  // Item_Batches rows removed by ON DELETE CASCADE (FK_Batch_Item).
  // Stock_Transactions rows removed by ON DELETE CASCADE (FK_StockTrans_Item).
  await pool
    .request()
    .input('itemId', sql.Int, itemId)
    .query(`DELETE FROM Inventory_Items WHERE item_id = @itemId`);
}

// expireDate removed — expiry is now managed at the batch level.
export async function updateInventoryItem(
  itemId: number,
  data: {
    itemName:      string;
    category:      string;
    lowStockLimit: number;
    supplier?:     string | null;
    unitCost?:     number | null;
  },
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('itemId',        sql.Int,            itemId)
    .input('itemName',      sql.NVarChar(255),  data.itemName)
    .input('category',      sql.NVarChar(100),  data.category)
    .input('lowStockLimit', sql.Int,            data.lowStockLimit)
    .input('supplier',      sql.NVarChar(255),  data.supplier ?? null)
    .input('unitCost',      sql.Decimal(10, 2), data.unitCost ?? null)
    .query(
      `UPDATE Inventory_Items
       SET item_name = @itemName, category = @category,
           low_stock_limit = @lowStockLimit,
           supplier = @supplier, unit_cost = @unitCost
       WHERE item_id = @itemId`,
    );
}

// Returns items whose ACTIVE batches expire within the next 30 days.
// Used by deposit/update notification dispatch (fire-and-forget).
export async function getNearExpiryItems(
  itemIds: number[],
): Promise<{ item_id: number; item_name: string; expire_date: string }[]> {
  if (!itemIds.length) return [];
  const pool   = await getPool();
  const idStr  = itemIds.join(',');

  const result = await pool
    .request()
    .query<{ item_id: number; item_name: string; expire_date: string }>(
      `SELECT i.item_id, i.item_name,
              CONVERT(NVARCHAR, MIN(b.expire_date), 107) AS expire_date
       FROM Item_Batches b
       JOIN Inventory_Items i ON i.item_id = b.item_id
       WHERE b.item_id IN (${idStr})
         AND b.expire_date IS NOT NULL
         AND b.expire_date <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
         AND b.quantity_remaining > 0
       GROUP BY i.item_id, i.item_name`,
    );
  return result.recordset;
}

// Returns the data needed by deleteItemService and withdrawItemService.
export async function getInventoryItemById(itemId: number): Promise<{
  item_name:          string;
  category:           string;
  low_stock_limit:    number;
  has_expired_batch:  boolean;
  total_quantity:     number;
} | null> {
  const pool   = await getPool();

  // Quantity and expiry are derived from the item's batches.
  const result = await pool
    .request()
    .input('itemId', sql.Int, itemId)
    .query<{
      item_name:         string;
      category:          string;
      low_stock_limit:   number;
      has_expired_batch: number;
      total_quantity:    number;
    }>(
      `SELECT i.item_name,
              i.category,
              i.low_stock_limit,
              CASE WHEN EXISTS (
                SELECT 1 FROM Item_Batches b
                WHERE b.item_id = i.item_id
                  AND b.expire_date <= CAST(GETDATE() AS DATE)
                  AND b.quantity_remaining > 0
              ) THEN 1 ELSE 0 END AS has_expired_batch,
              COALESCE(
                (SELECT SUM(b2.quantity_remaining)
                 FROM Item_Batches b2
                 WHERE b2.item_id = i.item_id),
                0
              ) AS total_quantity
       FROM Inventory_Items i
       WHERE i.item_id = @itemId`,
    );

  const row = result.recordset[0] ?? null;
  if (!row) return null;
  return {
    item_name:         row.item_name,
    category:          row.category,
    low_stock_limit:   row.low_stock_limit,
    has_expired_batch: row.has_expired_batch === 1,
    total_quantity:    row.total_quantity,
  };
}

export async function insertRemovedItem(data: {
  item_id:           number;
  item_name:         string;
  category:          string;
  removed_by:        number;
  removal_reason:    'Expired' | 'Out of Stock';
  quantity_removed?: number | null;
}): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input('itemId',          sql.Int,          data.item_id)
    .input('itemName',        sql.VarChar(255),  data.item_name)
    .input('category',        sql.VarChar(100),  data.category)
    .input('removedBy',       sql.Int,           data.removed_by)
    .input('removalReason',   sql.VarChar(50),   data.removal_reason)
    .input('quantityRemoved', sql.Int,           data.quantity_removed ?? null)
    .query(
      `INSERT INTO Removed_Inventory_Items
         (item_id, item_name, category, removed_by, removal_reason, quantity_removed)
       VALUES (@itemId, @itemName, @category, @removedBy, @removalReason, @quantityRemoved)`,
    );
}

export interface RemovedItemRow {
  removal_id:       number;
  item_id:          number;
  item_name:        string;
  category:         string;
  removed_by:       number;
  removal_reason:   string;
  quantity_removed: number | null;
  removed_at:       string;
}

export async function getRemovedItems(): Promise<RemovedItemRow[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .query<RemovedItemRow>(
      `SELECT removal_id, item_id, item_name, category, removed_by,
              removal_reason, quantity_removed,
              CONVERT(NVARCHAR, removed_at, 127) AS removed_at
       FROM Removed_Inventory_Items
       ORDER BY removed_at DESC`,
    );
  return result.recordset;
}

// ─── Activity history ─────────────────────────────────────────────────────────

export interface ActivityHistoryRow {
  transaction_id:   number;
  item_id:          number | null;
  item_name:        string;
  category:         string | null;
  expire_date:      string | null; // soonest active batch expiry (may be null)
  quantity:         number;
  transaction_type: string;
  time_stamp:       string;
  performed_by:     string;
  notes:            string | null;
}

export async function getActivityHistory(
  limit:  number,
  offset: number,
): Promise<{ rows: ActivityHistoryRow[]; total: number }> {
  const pool   = await getPool();

  const countResult = await pool
    .request()
    .query<{ total: number }>(`SELECT COUNT(*) AS total FROM Stock_Transactions`);

  // expire_date is the soonest expiry among the item's active batches.
  const rows = await pool
    .request()
    .input('limit',  sql.Int, limit)
    .input('offset', sql.Int, offset)
    .query<ActivityHistoryRow>(
      `SELECT t.transaction_id,
              t.item_id,
              ISNULL(i.item_name, '[Deleted Item]') AS item_name,
              i.category,
              (SELECT CONVERT(NVARCHAR, MIN(b.expire_date), 23)
               FROM Item_Batches b
               WHERE b.item_id = t.item_id
                 AND b.quantity_remaining > 0) AS expire_date,
              t.quantity,
              t.transaction_type,
              CONVERT(NVARCHAR, t.time_stamp, 127) AS time_stamp,
              u.email                              AS performed_by,
              t.notes
       FROM Stock_Transactions t
       LEFT JOIN Inventory_Items i ON i.item_id = t.item_id
       JOIN  Users u               ON u.user_id  = t.user_id
       ORDER BY t.time_stamp DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

// ─── Atomic delete-with-snapshot ─────────────────────────────────────────────

export async function deleteItemWithRecord(data: {
  item_id:          number;
  item_name:        string;
  category:         string;
  removed_by:       number;
  removal_reason:   'Expired' | 'Out of Stock';
  quantity_removed: number | null;
}): Promise<void> {
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction)
      .input('itemId',          sql.Int,          data.item_id)
      .input('itemName',        sql.VarChar(255),  data.item_name)
      .input('category',        sql.VarChar(100),  data.category)
      .input('removedBy',       sql.Int,           data.removed_by)
      .input('removalReason',   sql.VarChar(50),   data.removal_reason)
      .input('quantityRemoved', sql.Int,           data.quantity_removed ?? null)
      .query(
        `INSERT INTO Removed_Inventory_Items
           (item_id, item_name, category, removed_by, removal_reason, quantity_removed)
         VALUES (@itemId, @itemName, @category, @removedBy, @removalReason, @quantityRemoved)`,
      );

    // ON DELETE CASCADE removes Item_Batches and Stock_Transactions rows.
    await new sql.Request(transaction)
      .input('itemId', sql.Int, data.item_id)
      .query(`DELETE FROM Inventory_Items WHERE item_id = @itemId`);

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── Inventory Requests ───────────────────────────────────────────────────────

export interface InventoryRequestRow {
  request_id:         number;
  item_id:            number;
  item_name:          string;
  requested_by:       number;
  requester_name:     string;
  requester_role:     string;
  quantity:           number;
  approved_quantity:  number | null;
  status:             string;
  notes:              string | null;
  rejection_feedback: string | null;
  created_at:         string;
  modified_at:        string | null;
}

export async function getInventoryRequests(
  search: string,
  limit:  number,
  offset: number,
): Promise<{ rows: InventoryRequestRow[]; total: number }> {
  const pool       = await getPool();
  const likeSearch = `%${search}%`;

  const countResult = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .query<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM Inventory_Requests r
       JOIN Inventory_Items i ON i.item_id = r.item_id
       WHERE i.item_name LIKE @search`,
    );

  const rows = await pool
    .request()
    .input('search', sql.NVarChar(255), likeSearch)
    .input('limit',  sql.Int,           limit)
    .input('offset', sql.Int,           offset)
    .query<InventoryRequestRow>(
      `SELECT r.request_id, r.item_id, i.item_name,
              r.requested_by,
              ISNULL(
                (SELECT TOP 1 LTRIM(RTRIM(e.first_name + ' ' + e.last_name))
                 FROM Employee e
                 WHERE e.user_id = r.requested_by AND e.deleted_at IS NULL
                 ORDER BY e.employee_id),
                u.email
              ) AS requester_name,
              ro.role_name AS requester_role,
              r.quantity, r.approved_quantity, r.status, r.notes, r.rejection_feedback,
              r.created_at, r.modified_at
       FROM Inventory_Requests r
       JOIN Inventory_Items i  ON i.item_id  = r.item_id
       JOIN Users u            ON u.user_id  = r.requested_by
       JOIN Roles ro           ON ro.role_id = u.role_id
       WHERE i.item_name LIKE @search
       ORDER BY r.created_at DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    );

  return { rows: rows.recordset, total: countResult.recordset[0].total };
}

export async function getRequestsByUser(
  userId: number,
): Promise<{ rows: unknown[] }> {
  const pool = await getPool();
  const rows = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(
      `SELECT r.request_id, r.item_id, i.item_name,
              r.quantity          AS requested_quantity,
              r.notes,
              r.status,
              r.created_at        AS request_date,
              r.modified_at       AS modification_date,
              r.approved_quantity,
              r.approved_by,
              r.rejection_feedback,
              ISNULL(
                (SELECT TOP 1 LTRIM(RTRIM(e.first_name + ' ' + e.last_name))
                 FROM Employee e
                 WHERE e.user_id = r.approved_by AND e.deleted_at IS NULL
                 ORDER BY e.employee_id),
                u_rev.email
              ) AS approver_name,
              u_rev.email AS approver_email
       FROM Inventory_Requests r
       JOIN Inventory_Items i   ON i.item_id       = r.item_id
       LEFT JOIN Users u_rev    ON u_rev.user_id   = r.approved_by
       WHERE r.requested_by = @userId
       ORDER BY r.created_at DESC`,
    );
  return { rows: rows.recordset };
}

export async function createInventoryRequest(data: {
  itemId:      number;
  requestedBy: number;
  quantity:    number;
  notes?:      string | null;
}): Promise<{ requestId: number }> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('itemId',      sql.Int,           data.itemId)
    .input('requestedBy', sql.Int,           data.requestedBy)
    .input('quantity',    sql.Int,           data.quantity)
    .input('notes',       sql.NVarChar(500), data.notes ?? null)
    .query<{ request_id: number }>(
      `INSERT INTO Inventory_Requests (item_id, requested_by, quantity, notes)
       OUTPUT INSERTED.request_id
       VALUES (@itemId, @requestedBy, @quantity, @notes)`,
    );
  return { requestId: result.recordset[0].request_id };
}

// ── Shared transaction helpers ────────────────────────────────────────────────

export async function insertWithdrawTransaction(
  itemId:   number,
  userId:   number,
  quantity: number,
  tx:       sql.Transaction,
  notes?:   string,
): Promise<void> {
  await new sql.Request(tx)
    .input('itemId',  sql.Int,           itemId)
    .input('userId',  sql.Int,           userId)
    .input('qty',     sql.Int,           quantity)
    .input('txType',  sql.VarChar(50),   'Withdraw')
    .input('notes',   sql.NVarChar(500), notes ?? null)
    .query(
      `INSERT INTO Stock_Transactions (item_id, user_id, transaction_type, quantity, notes)
       VALUES (@itemId, @userId, @txType, @qty, @notes)`,
    );
}

// Atomically approves a request: marks it Approved, runs FEFO batch consumption,
// and logs a Withdraw Stock_Transaction — all within one DB transaction.
//
// Throws typed errors so the controller can return precise HTTP statuses:
//   'NOT_FOUND'           → 404
//   'NOT_PENDING'         → 400
//   'INSUFFICIENT_STOCK'  → 409  (carries .available / .requested)
export async function approveInventoryRequest(
  requestId:        number,
  approvedQuantity: number,
  approverId:       number,
): Promise<{ itemId: number; approvedQuantity: number; requestedBy: number; newQuantityOnHand: number }> {
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // 1. Read + row-lock the request.
    const reqResult = await new sql.Request(transaction)
      .input('requestId', sql.Int, requestId)
      .query<{ item_id: number; status: string; requested_by: number }>(
        `SELECT item_id, status, requested_by
         FROM Inventory_Requests WITH (UPDLOCK)
         WHERE request_id = @requestId`,
      );

    if (!reqResult.recordset.length) throw new Error('NOT_FOUND');
    const req = reqResult.recordset[0];
    if (req.status !== 'Pending') throw new Error('NOT_PENDING');

    // 2. Check available stock from batches (within the transaction).
    const available = await getItemTotalQuantity(req.item_id, transaction);
    if (available < approvedQuantity) {
      throw Object.assign(new Error('INSUFFICIENT_STOCK'), {
        available,
        requested: approvedQuantity,
      });
    }

    // 3. Mark the request approved.
    await new sql.Request(transaction)
      .input('requestId',        sql.Int, requestId)
      .input('approverId',       sql.Int, approverId)
      .input('approvedQuantity', sql.Int, approvedQuantity)
      .query(
        `UPDATE Inventory_Requests
         SET status            = 'Approved',
             approved_quantity = @approvedQuantity,
             approved_by       = @approverId,
             modified_at       = GETUTCDATE(),
             processed_at      = GETUTCDATE()
         WHERE request_id = @requestId`,
      );

    // 4. FEFO consume from batches (shared helper — same path as withdrawItemFEFO).
    const { consumed } = await consumeFefo(req.item_id, approvedQuantity, transaction);

    // 5. Log the withdrawal with batch detail.
    const batchDetail = consumed.map(c => `batch#${c.batch_id}(${c.quantity})`).join(', ');
    const txNotes = `Request #${requestId} approved. Consumed: ${batchDetail}`.substring(0, 500);
    await insertWithdrawTransaction(req.item_id, approverId, approvedQuantity, transaction, txNotes);

    await transaction.commit();

    const newQuantityOnHand = available - approvedQuantity;
    return { itemId: req.item_id, approvedQuantity, requestedBy: req.requested_by, newQuantityOnHand };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function rejectInventoryRequest(
  requestId:  number,
  feedback:   string,
  rejectorId: number,
): Promise<{ requestedBy: number }> {
  const pool        = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const check = await new sql.Request(transaction)
      .input('requestId', sql.Int, requestId)
      .query<{ status: string; requested_by: number; item_id: number }>(
        `SELECT status, requested_by, item_id
         FROM Inventory_Requests
         WHERE request_id = @requestId`,
      );

    if (!check.recordset.length)                 throw new Error('NOT_FOUND');
    if (check.recordset[0].status !== 'Pending') throw new Error('NOT_PENDING');

    const { requested_by, item_id } = check.recordset[0];

    await new sql.Request(transaction)
      .input('requestId',  sql.Int,           requestId)
      .input('feedback',   sql.NVarChar(500), feedback)
      .input('rejectorId', sql.Int,           rejectorId)
      .query(
        `UPDATE Inventory_Requests
         SET status             = 'Rejected',
             rejection_feedback = @feedback,
             approved_by        = @rejectorId,
             modified_at        = GETUTCDATE(),
             processed_at       = GETUTCDATE()
         WHERE request_id = @requestId`,
      );

    await new sql.Request(transaction)
      .input('itemId', sql.Int,           item_id)
      .input('userId', sql.Int,           rejectorId)
      .input('qty',    sql.Int,           0)
      .input('txType', sql.VarChar(50),   'Reject')
      .input('notes',  sql.NVarChar(500), `Request #${requestId} rejected`)
      .query(
        `INSERT INTO Stock_Transactions (item_id, user_id, transaction_type, quantity, notes)
         VALUES (@itemId, @userId, @txType, @qty, @notes)`,
      );

    await transaction.commit();
    return { requestedBy: requested_by };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─── Register item ────────────────────────────────────────────────────────────
// A new item starts with zero stock; quantity arrives later as Item_Batches
// rows created by deposits.

export async function registerInventoryItem(data: {
  itemName:      string;
  category:      string;
  supplier:      string | null;
  unitCost:      number | null;
  lowStockLimit: number;
  assignedBy:    number;
}): Promise<{ itemId: number }> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('itemName',      sql.NVarChar(255),  data.itemName)
    .input('category',      sql.NVarChar(100),  data.category)
    .input('supplier',      sql.NVarChar(255),  data.supplier ?? null)
    .input('unitCost',      sql.Decimal(10, 2), data.unitCost ?? null)
    .input('lowStockLimit', sql.Int,            data.lowStockLimit)
    .input('assignedBy',    sql.Int,            data.assignedBy)
    .query<{ item_id: number }>(
      `INSERT INTO Inventory_Items
         (item_name, category, supplier, unit_cost, low_stock_limit, assigned_by)
       OUTPUT INSERTED.item_id
       VALUES (@itemName, @category, @supplier, @unitCost, @lowStockLimit, @assignedBy)`,
    );
  return { itemId: result.recordset[0].item_id };
}

// ─── Latest combined activity feed ───────────────────────────────────────────
// Used by GET /inventory/latest-activity to power the dashboard widget.
// Each helper fetches at most `limit` rows from its own table; the service
// merges and re-sorts the two arrays before slicing.

export interface LatestTransactionRow {
  source_id:          number;
  source_kind:        'transaction';
  item_id:            number | null;
  item_name:          string;
  category:           string | null;
  action:             string;   // 'Deposit' | 'Withdraw' | 'Reject'
  quantity:           number;
  occurred_at:        string;   // ISO 8601
  performed_by_email: string;
}

export interface LatestRemovalRow {
  source_id:          number;
  source_kind:        'removal';
  item_id:            number;
  item_name:          string;
  category:           string;
  action:             string;   // 'Expired' | 'Out of Stock'
  quantity:           number | null;
  occurred_at:        string;   // ISO 8601
  performed_by_email: string;
}

export async function getLatestTransactions(limit: number): Promise<LatestTransactionRow[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('limit', sql.Int, limit)
    .query<LatestTransactionRow>(
      `SELECT TOP (@limit)
         t.transaction_id                          AS source_id,
         'transaction'                             AS source_kind,
         t.item_id,
         ISNULL(i.item_name, '[Deleted Item]')     AS item_name,
         i.category,
         t.transaction_type                        AS action,
         t.quantity,
         CONVERT(NVARCHAR, t.time_stamp, 127)      AS occurred_at,
         u.email                                   AS performed_by_email
       FROM Stock_Transactions t
       LEFT JOIN Inventory_Items i ON i.item_id = t.item_id
       JOIN  Users u               ON u.user_id  = t.user_id
       ORDER BY t.time_stamp DESC`,
    );
  return result.recordset;
}

export async function getLatestRemovals(limit: number): Promise<LatestRemovalRow[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('limit', sql.Int, limit)
    .query<LatestRemovalRow>(
      `SELECT TOP (@limit)
         r.removal_id                              AS source_id,
         'removal'                                 AS source_kind,
         r.item_id,
         r.item_name,
         r.category,
         r.removal_reason                          AS action,
         r.quantity_removed                        AS quantity,
         CONVERT(NVARCHAR, r.removed_at, 127)      AS occurred_at,
         u.email                                   AS performed_by_email
       FROM Removed_Inventory_Items r
       JOIN Users u ON u.user_id = r.removed_by
       ORDER BY r.removed_at DESC`,
    );
  return result.recordset;
}
