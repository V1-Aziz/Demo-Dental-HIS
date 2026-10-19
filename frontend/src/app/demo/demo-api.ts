// Entry point of demo mode: an in-browser stand-in for the Express API.
// Handlers are registered in the same order as backend/src/routes/index.ts.
import { DemoDb } from './db';
import { DemoResponse, DemoRouter } from './router';
import { registerAuth } from './api/auth';
import { registerPatients } from './api/patients';
import { registerAppointments } from './api/appointments';
import { registerRecords } from './api/records';
import { registerLab } from './api/lab';
import { registerInventory } from './api/inventory';
import { registerTickets } from './api/tickets';
import { registerAudit, registerUsers } from './api/users';
import { registerDiagnosis } from './api/diagnosis';
import { registerDashboard } from './api/dashboard';
import { registerNotifications } from './api/notifications';
import { registerReports } from './api/reports';

let db: DemoDb | null = null;
let router: DemoRouter | null = null;

function init(): { db: DemoDb; router: DemoRouter } {
  if (!db || !router) {
    db = new DemoDb();
    router = new DemoRouter();
    registerAuth(router);
    registerPatients(router);
    registerAppointments(router);
    registerRecords(router);
    registerLab(router);
    registerInventory(router);
    registerTickets(router);
    registerAudit(router);
    registerUsers(router);
    registerDiagnosis(router);
    registerDashboard(router);
    registerNotifications(router);
    registerReports(router);
  }
  return { db, router };
}

/** Answers one API call. `url` is the full request URL including the query string. */
export function handleDemoRequest(method: string, url: string, body: unknown, authHeader: string | null): DemoResponse {
  const { db, router } = init();
  const parsed = new URL(url, 'http://demo.local');
  const apiIndex = parsed.pathname.indexOf('/api/');
  const path = apiIndex >= 0 ? parsed.pathname.slice(apiIndex + 4) : parsed.pathname;
  const query: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    if (!(key in query)) query[key] = value;
  });
  return router.handle(method.toUpperCase(), path, query, body, authHeader, db);
}

/** Restores the original sample data. */
export function resetDemoData(): void {
  init().db.reset();
}
