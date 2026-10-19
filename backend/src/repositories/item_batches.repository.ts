// Item-batch repository — pure SQL operations on Item_Batches.
// All multi-table orchestration (deposit transaction, FEFO withdraw transaction)
// lives in inventory.repository.ts, which imports these primitives.
import sql from 'mssql';
import { getPool } from '../config/db.config';

export interface BatchRow {
  batch_id:           number;
  quantity_remaining: number;
  expire_date:        string | null; // YYYY-MM-DD or null
  deposited_at:       string;        // ISO 8601
}

/** Insert a new batch row inside a running transaction. Returns the new batch_id. */
export async function insertBatch(
  data: {
    item_id:      number;
    quantity:     number;
    expire_date:  string | null;
    deposited_by: number;
    notes?:       string | null;
  },
  tx: sql.Transaction,
): Promise<number> {
  const result = await new sql.Request(tx)
    .input('itemId',      sql.Int,          data.item_id)
    .input('qty',         sql.Int,          data.quantity)
    .input('expireDate',  sql.Date,         data.expire_date ?? null)
    .input('depositedBy', sql.Int,          data.deposited_by)
    .input('notes',       sql.VarChar(500), data.notes ?? null)
    .query<{ batch_id: number }>(
      `INSERT INTO Item_Batches
         (item_id, quantity_initial, quantity_remaining, expire_date, deposited_by, notes)
       OUTPUT INSERTED.batch_id
       VALUES (@itemId, @qty, @qty, @expireDate, @depositedBy, @notes)`,
    );
  return result.recordset[0].batch_id;
}

/**
 * Returns active batches for an item in FEFO order:
 *   soonest expire_date first, NULLs last, then batch_id ascending.
 * Accepts an optional transaction so callers can lock rows before consuming.
 */
export async function getActiveBatchesByItem(
  itemId: number,
  tx?: sql.Transaction,
): Promise<BatchRow[]> {
  const req = tx ? new sql.Request(tx) : (await getPool()).request();
  const result = await req
    .input('itemId', sql.Int, itemId)
    .query<BatchRow>(
      `SELECT batch_id, quantity_remaining,
              CONVERT(NVARCHAR, expire_date, 23) AS expire_date,
              CONVERT(NVARCHAR, deposited_at, 127) AS deposited_at
       FROM Item_Batches
       WHERE item_id = @itemId AND quantity_remaining > 0
       ORDER BY
         CASE WHEN expire_date IS NULL THEN 1 ELSE 0 END,
         expire_date ASC,
         batch_id    ASC`,
    );
  return result.recordset;
}

/** Deduct `amount` from a single batch inside a running transaction. */
export async function decrementBatch(
  batchId: number,
  amount:  number,
  tx:      sql.Transaction,
): Promise<void> {
  await new sql.Request(tx)
    .input('batchId', sql.Int, batchId)
    .input('amount',  sql.Int, amount)
    .query(
      `UPDATE Item_Batches
       SET quantity_remaining = quantity_remaining - @amount
       WHERE batch_id = @batchId`,
    );
}

/**
 * Returns the total quantity_remaining across ALL batches for an item.
 * Accepts an optional transaction for consistent reads inside a larger unit.
 */
export async function getItemTotalQuantity(
  itemId: number,
  tx?:    sql.Transaction,
): Promise<number> {
  const req = tx ? new sql.Request(tx) : (await getPool()).request();
  const result = await req
    .input('itemId', sql.Int, itemId)
    .query<{ total: number }>(
      `SELECT COALESCE(SUM(quantity_remaining), 0) AS total
       FROM Item_Batches
       WHERE item_id = @itemId`,
    );
  return result.recordset[0].total;
}

/**
 * Returns active batches for display on the frontend (GET /inventory/items/:id/batches).
 * Same FEFO ordering as getActiveBatchesByItem but uses its own pool connection.
 */
export async function getActiveBatchesForDisplay(itemId: number): Promise<BatchRow[]> {
  const pool   = await getPool();
  const result = await pool
    .request()
    .input('itemId', sql.Int, itemId)
    .query<BatchRow>(
      `SELECT batch_id, quantity_remaining,
              CONVERT(NVARCHAR, expire_date, 23) AS expire_date,
              CONVERT(NVARCHAR, deposited_at, 127) AS deposited_at
       FROM Item_Batches
       WHERE item_id = @itemId AND quantity_remaining > 0
       ORDER BY
         CASE WHEN expire_date IS NULL THEN 1 ELSE 0 END,
         expire_date ASC,
         batch_id    ASC`,
    );
  return result.recordset;
}
