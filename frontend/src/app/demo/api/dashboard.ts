// /dashboard and /admin/stats — mirrors dashboard.routes.ts, dashboard.repository.ts,
// admin-stats.routes.ts and stats.service.ts. Server CPU/memory/disk cannot be
// measured from a browser, so demo mode reports steady simulated values.
import { DemoRouter, ok } from '../router';
import { DemoDb } from '../db';
import { localDate, now, today } from '../data/time';
import { userById } from '../helpers';
import { quantityOnHand } from './inventory';

function lowStockCount(db: DemoDb): number {
  return db.tables.Inventory_Items.filter(i => quantityOnHand(db, i.item_id) <= i.low_stock_limit).length;
}

function todays(db: DemoDb) {
  const day = today();
  return db.tables.Appointments.filter(a => !a.deleted_at && localDate(a.appointment_start_time) === day);
}

function wobble(base: number, spread: number): number {
  return Math.max(0, Math.min(100, Math.round(base + (Math.random() - 0.5) * spread)));
}

export function registerDashboard(r: DemoRouter): void {
  r.get('/dashboard/receptionist', ['Receptionist', 'Admin'], ({ db }) => {
    const appts = todays(db);
    return ok({
      todayAppointments: appts.filter(a => a.status !== 'Canceled').length,
      completedToday: appts.filter(a => ['Checked-In', 'In Progress', 'Completed'].includes(a.status)).length,
      totalPatients: db.tables.Patients.filter(p => !p.deleted_at).length,
      scheduledToday: appts.filter(a => a.status === 'Scheduled').length,
    });
  });

  r.get('/dashboard/inventory', ['InventoryManager', 'Admin'], ({ db }) => ok({
    totalItems: db.tables.Inventory_Items.length,
    lowStockCount: lowStockCount(db),
    totalTransactions: db.tables.Stock_Transactions.length,
  }));

  r.get('/dashboard/admin', ['Admin'], ({ db }) => {
    const cutoff = Date.now() - 30 * 60_000;
    const pendingLab = db.tables.Lab_Requests.filter(l => l.request_status === 'Pending').length;
    const pendingNotes = db.tables.Diagnosis.filter(d => d.status === 'Submitted' && d.authored_by_student !== null && !d.deleted_at).length;
    return ok({
      activeUsers: db.tables.Users.filter(u => new Date(u.last_login).getTime() >= cutoff).length,
      appointmentsToday: todays(db).length,
      pendingApprovals: pendingLab + pendingNotes,
      lowStockItems: lowStockCount(db),
    });
  });

  r.get('/dashboard/system-performance', ['Admin'], () => {
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 8;
    return ok({
      cpu: { usedPercent: wobble(18, 10), coreCount: cores, speedMHz: 2400 },
      memory: { usedPercent: wobble(46, 4), totalGB: 16, usedGB: 7.4 },
      disk: { usedPercent: 58, totalGB: 512, freeGB: 215.2 },
      timestamp: now(),
    });
  });

  r.get('/admin/stats/active-users', ['Admin'], ({ user, db }) => {
    const session = db.tables.User_Sessions.find(s => s.session_id === user.sessionId && !s.revoked_at);
    if (session) session.last_activity_at = now();
    const windowMinutes = 5;
    const cutoff = Date.now() - windowMinutes * 60_000;
    const users = new Set(db.tables.User_Sessions
      .filter(s => !s.revoked_at && new Date(s.expires_at).getTime() > Date.now() &&
        new Date(s.last_activity_at).getTime() > cutoff && userById(db, s.user_id)?.account_status === 'Active')
      .map(s => s.user_id));
    return ok({ count: users.size, asOf: now(), windowMinutes }, 'Active users retrieved');
  });
}
