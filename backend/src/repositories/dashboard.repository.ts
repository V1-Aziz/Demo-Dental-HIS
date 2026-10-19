import sql from 'mssql';
import { getPool } from '../config/db.config';

export async function getReceptionistStats(): Promise<{
  todayAppointments: number;
  completedToday: number;
  totalPatients: number;
  scheduledToday: number;
}> {
  const pool = await getPool();
  const today = new Date().toISOString().split('T')[0];

  const result = await pool
    .request()
    .input('today', sql.VarChar(20), today)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM Appointments WHERE CAST(appointment_start_time AS DATE) = @today AND status != 'Canceled' AND deleted_at IS NULL) AS todayAppointments,
        (SELECT COUNT(*) FROM Appointments WHERE CAST(appointment_start_time AS DATE) = @today AND status IN ('Checked-In', 'In Progress', 'Completed') AND deleted_at IS NULL) AS completedToday,
        (SELECT COUNT(*) FROM Patients WHERE deleted_at IS NULL) AS totalPatients,
        (SELECT COUNT(*) FROM Appointments WHERE CAST(appointment_start_time AS DATE) = @today AND status = 'Scheduled' AND deleted_at IS NULL) AS scheduledToday
    `);
  return result.recordset[0];
}

export async function getAdminDashboardStats(): Promise<{
  activeUsers: number;
  appointmentsToday: number;
  pendingApprovals: number;
  lowStockItems: number;
}> {
  const pool  = await getPool();
  const today = new Date().toISOString().split('T')[0];

  // Wraps each tile's COUNT query so a single failing stat (e.g. a table
  // renamed during migration) returns 0 instead of taking down the whole
  // dashboard. Accepts the inner SELECT as a string and injects it as a
  // scalar subquery — the caller still has to use parameterized @params.
  const safeCount = async (query: string, params?: Record<string, unknown>): Promise<number> => {
    try {
      const req = pool.request();
      if (params) {
        for (const [key, val] of Object.entries(params)) {
          req.input(key, val);
        }
      }
      const res = await req.query<{ n: number }>(`SELECT (${query}) AS n`);
      return res.recordset[0]?.n ?? 0;
    } catch {
      return 0;
    }
  };

  const [activeUsers, appointmentsToday, pendingLab, pendingNotes, lowStockItems] =
    await Promise.all([
      // "Active users" = anyone whose JWT has been exchanged in the last 30
      // minutes. last_login is updated on every successful login, so this is
      // an activity signal rather than a true session count.
      safeCount(`SELECT COUNT(*) FROM Users
                 WHERE last_login >= DATEADD(minute, -30, GETDATE())`),
      safeCount(`SELECT COUNT(*) FROM Appointments
                 WHERE CAST(appointment_start_time AS DATE) = @today
                   AND deleted_at IS NULL`, { today }),
      safeCount(`SELECT COUNT(*) FROM Lab_Requests
                 WHERE request_status = 'Pending'`),
      safeCount(`SELECT COUNT(*) FROM Diagnosis
                 WHERE [status] = 'Submitted'
                   AND authored_by_student IS NOT NULL
                   AND deleted_at IS NULL`),
      safeCount(`SELECT COUNT(*) FROM Inventory_Items i
                 WHERE (SELECT COALESCE(SUM(b.quantity_remaining), 0)
                        FROM Item_Batches b
                        WHERE b.item_id = i.item_id) <= i.low_stock_limit`),
    ]);

  return {
    activeUsers,
    appointmentsToday,
    pendingApprovals: pendingLab + pendingNotes,
    lowStockItems,
  };
}

export async function getInventoryDashboardStats(): Promise<{
  totalItems: number;
  lowStockCount: number;
  totalTransactions: number;
}> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      (SELECT COUNT(*) FROM Inventory_Items) AS totalItems,
      (SELECT COUNT(*) FROM Inventory_Items i
       WHERE (SELECT COALESCE(SUM(b.quantity_remaining), 0)
              FROM Item_Batches b
              WHERE b.item_id = i.item_id) <= i.low_stock_limit) AS lowStockCount,
      (SELECT COUNT(*) FROM Stock_Transactions) AS totalTransactions
  `);
  return result.recordset[0];
}
