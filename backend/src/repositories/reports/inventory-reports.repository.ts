// Read-only SQL for the Inventory reports module.
// Feeds `GET /reports/inventory/low-stock` (items at/below reorder level,
// bucketed into Critical/Low), `/consumption` (withdrawal trends, totals,
// and top items/categories in a date range), and `/categories` (lookup
// for the filter dropdown). "Consumption" = Stock_Transactions rows of
// type 'Withdraw'; deposits and returns do NOT count. Severity thresholds
// are duplicated inline — keep them in sync if the low-stock rule changes.
import sql from 'mssql';
import { getPool } from '../../config/db.config';

export interface LowStockItemRow {
  item_id: number;
  item_name: string;
  category: string;
  quantity_on_hand: number;
  low_stock_limit: number;
  severity: 'Critical' | 'Low';
}

export interface LowStockSummaryRow {
  critical_count: number;
  low_count: number;
  total_items: number;
}

export interface ConsumptionWeekCategoryRow {
  year: number;
  week_number: number;
  week_start: Date;
  category: string;
  total_withdrawn: number;
}

export interface ConsumptionTotalRow {
  total_withdrawn: number | null;
}

export interface TopItemRow {
  item_name: string;
  total_qty: number;
}

export interface TopCategoryRow {
  category: string;
  total_qty: number;
}

export async function getLowStockItems(category?: string | null): Promise<LowStockItemRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('category', sql.VarChar(100), category ?? null)
    .query<LowStockItemRow>(`
      SELECT
        i.item_id,
        i.item_name,
        i.category,
        q.quantity_on_hand,
        i.low_stock_limit,
        CASE
          WHEN q.quantity_on_hand <= (i.low_stock_limit * 0.5) THEN 'Critical'
          ELSE 'Low'
        END AS severity
      FROM Inventory_Items i
      OUTER APPLY (
        SELECT COALESCE(SUM(b.quantity_remaining), 0) AS quantity_on_hand
        FROM Item_Batches b
        WHERE b.item_id = i.item_id
      ) q
      WHERE q.quantity_on_hand <= i.low_stock_limit
        AND (@category IS NULL OR @category = '' OR i.category = @category)
      ORDER BY
        CASE WHEN q.quantity_on_hand <= (i.low_stock_limit * 0.5) THEN 0 ELSE 1 END,
        q.quantity_on_hand ASC
    `);
  return result.recordset;
}

export async function getLowStockSummary(category?: string | null): Promise<LowStockSummaryRow> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('category', sql.VarChar(100), category ?? null)
    .query<LowStockSummaryRow>(`
      SELECT
        ISNULL(SUM(CASE WHEN q.quantity_on_hand <= (i.low_stock_limit * 0.5) THEN 1 ELSE 0 END), 0) AS critical_count,
        ISNULL(SUM(CASE WHEN q.quantity_on_hand > (i.low_stock_limit * 0.5)
                         AND q.quantity_on_hand <= i.low_stock_limit THEN 1 ELSE 0 END), 0) AS low_count,
        (SELECT COUNT(*) FROM Inventory_Items
         WHERE (@category IS NULL OR @category = '' OR category = @category)) AS total_items
      FROM Inventory_Items i
      OUTER APPLY (
        SELECT COALESCE(SUM(b.quantity_remaining), 0) AS quantity_on_hand
        FROM Item_Batches b
        WHERE b.item_id = i.item_id
      ) q
      WHERE q.quantity_on_hand <= i.low_stock_limit
        AND (@category IS NULL OR @category = '' OR i.category = @category)
    `);
  return (
    result.recordset[0] ?? {
      critical_count: 0,
      low_count: 0,
      total_items: 0,
    }
  );
}

export async function getConsumptionWeekly(
  startDate: string,
  endDate: string,
  category?: string | null,
): Promise<ConsumptionWeekCategoryRow[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('category', sql.VarChar(100), category ?? null)
    .query<ConsumptionWeekCategoryRow>(`
      SELECT
        DATEPART(YEAR, st.time_stamp) AS year,
        DATEPART(WEEK, st.time_stamp) AS week_number,
        MIN(CAST(st.time_stamp AS DATE)) AS week_start,
        i.category,
        SUM(st.quantity) AS total_withdrawn
      FROM Stock_Transactions st
      INNER JOIN Inventory_Items i ON i.item_id = st.item_id
      WHERE st.transaction_type = 'Withdraw'
        AND st.time_stamp >= @startDate
        AND st.time_stamp < DATEADD(DAY, 1, @endDate)
        AND (@category IS NULL OR @category = '' OR i.category = @category)
      GROUP BY DATEPART(YEAR, st.time_stamp), DATEPART(WEEK, st.time_stamp), i.category
      ORDER BY year, week_number, i.category
    `);
  return result.recordset;
}

export async function getConsumptionTotal(
  startDate: string,
  endDate: string,
  category?: string | null,
): Promise<number> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('category', sql.VarChar(100), category ?? null)
    .query<ConsumptionTotalRow>(`
      SELECT SUM(st.quantity) AS total_withdrawn
      FROM Stock_Transactions st
      INNER JOIN Inventory_Items i ON i.item_id = st.item_id
      WHERE st.transaction_type = 'Withdraw'
        AND st.time_stamp >= @startDate
        AND st.time_stamp < DATEADD(DAY, 1, @endDate)
        AND (@category IS NULL OR @category = '' OR i.category = @category)
    `);
  return result.recordset[0]?.total_withdrawn ?? 0;
}

export async function getTopConsumedItem(
  startDate: string,
  endDate: string,
  category?: string | null,
): Promise<TopItemRow | null> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .input('category', sql.VarChar(100), category ?? null)
    .query<TopItemRow>(`
      SELECT TOP 1
        i.item_name,
        SUM(st.quantity) AS total_qty
      FROM Stock_Transactions st
      INNER JOIN Inventory_Items i ON i.item_id = st.item_id
      WHERE st.transaction_type = 'Withdraw'
        AND st.time_stamp >= @startDate
        AND st.time_stamp < DATEADD(DAY, 1, @endDate)
        AND (@category IS NULL OR @category = '' OR i.category = @category)
      GROUP BY i.item_name
      ORDER BY SUM(st.quantity) DESC
    `);
  return result.recordset[0] ?? null;
}

export async function getTopConsumedCategory(
  startDate: string,
  endDate: string,
): Promise<TopCategoryRow | null> {
  const pool = await getPool();
  const result = await new sql.Request(pool)
    .input('startDate', sql.Date, startDate)
    .input('endDate', sql.Date, endDate)
    .query<TopCategoryRow>(`
      SELECT TOP 1
        i.category,
        SUM(st.quantity) AS total_qty
      FROM Stock_Transactions st
      INNER JOIN Inventory_Items i ON i.item_id = st.item_id
      WHERE st.transaction_type = 'Withdraw'
        AND st.time_stamp >= @startDate
        AND st.time_stamp < DATEADD(DAY, 1, @endDate)
      GROUP BY i.category
      ORDER BY SUM(st.quantity) DESC
    `);
  return result.recordset[0] ?? null;
}

export async function getCategories(): Promise<string[]> {
  const pool = await getPool();
  const result = await new sql.Request(pool).query<{ category: string }>(`
    SELECT DISTINCT category FROM Inventory_Items ORDER BY category
  `);
  return result.recordset.map((r) => r.category);
}
