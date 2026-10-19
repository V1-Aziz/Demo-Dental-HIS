// /reports — mirrors the report routes, services and repositories under
// backend/src/{routes,services,repositories}/reports. Date ranges are matched
// on the viewer's local calendar day.
import { DemoRouter, ok, badRequest } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { localDate } from '../data/time';
import { quantityOnHand } from './inventory';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAUDI_WORKING_DAYS = new Set([0, 1, 2, 3, 4]);
const SLOTS_PER_DAY = 16;

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, total: number): number | null => (total ? round1((part * 100) / total) : null);
const inRange = (day: string | null, start: string, end: string) => !!day && day >= start && day <= end;

/** SQL Server DATEPART(WEEK, d) with the default DATEFIRST 7: week 1 contains Jan 1, weeks start on Sunday. */
export function sqlWeek(day: string): { year: number; week: number } {
  const [y, m, d] = day.split('-').map(Number);
  const jan1 = Date.UTC(y, 0, 1);
  const daysSince = (Date.UTC(y, m - 1, d) - jan1) / 864e5;
  const jan1Dow = new Date(jan1).getUTCDay();
  const firstSunday = jan1Dow === 0 ? 7 : 7 - jan1Dow;
  const sundays = daysSince >= firstSunday ? Math.floor((daysSince - firstSunday) / 7) + 1 : 0;
  return { year: y, week: sundays + 1 };
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dateRange(query: Record<string, string>): { start: string; end: string } | null {
  const start = String(query['startDate'] || '');
  const end = String(query['endDate'] || '');
  return DATE_RE.test(start) && DATE_RE.test(end) ? { start, end } : null;
}

function optionalFilter(raw: string | undefined): string | null {
  return raw !== undefined && raw !== '' && raw !== 'null' ? raw : null;
}

const RANGE_ERROR = 'startDate and endDate are required in YYYY-MM-DD format';

// ─── Patients ────────────────────────────────────────────────────────────────

export function newRegistrations(db: DemoDb, start: string, end: string) {
  const patients = db.tables.Patients.filter(p => !p.deleted_at);
  const inPeriod = (s: string, e: string) => patients.filter(p => inRange(localDate(p.created_at), s, e));
  const rows = inPeriod(start, end);

  const byDay = new Map<string, number>();
  for (const p of rows) byDay.set(localDate(p.created_at)!, (byDay.get(localDate(p.created_at)!) ?? 0) + 1);
  const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  // DATEADD(WEEK, DATEDIFF(WEEK, 0, created_at), 0): Sunday-to-Saturday buckets labelled by their Monday.
  const weeks = new Map<string, number>();
  for (const p of rows) {
    const day = localDate(p.created_at)!;
    const dow = new Date(day + 'T00:00:00Z').getUTCDay();
    const monday = addDays(day, 1 - dow);
    weeks.set(monday, (weeks.get(monday) ?? 0) + 1);
  }
  const weekly = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const startMs = Date.parse(start);
  const daysSpan = Math.round((Date.parse(end) - startMs) / 864e5) + 1;
  const priorEnd = new Date(startMs - 864e5);
  const priorStart = new Date(priorEnd.getTime() - (daysSpan - 1) * 864e5);
  const priorCount = inPeriod(priorStart.toISOString().slice(0, 10), priorEnd.toISOString().slice(0, 10)).length;
  const total = rows.length;
  const percentChange = priorCount > 0 ? Math.round(((total - priorCount) / priorCount) * 100) : total > 0 ? 100 : 0;

  return {
    summary: {
      totalNewPatients: total,
      avgPerWeek: +(total / (weekly.length || 1)).toFixed(1),
      peakDay: peak ? `${peak[0]}T00:00:00.000Z` : null,
      peakDayCount: peak ? peak[1] : null,
      percentChange,
    },
    weeklyData: weekly.map(([monday, count]) => {
      const [, m, d] = monday.split('-').map(Number);
      return { weekLabel: `${m}/${d}`, count };
    }),
  };
}

export function demographics(db: DemoDb) {
  const patients = db.tables.Patients.filter(p => !p.deleted_at);
  const year = new Date().getFullYear();
  const groups = new Map<string, { count: number; minAge: number }>();
  for (const p of patients) {
    const age = year - parseInt(p.date_of_birth.slice(0, 4), 10);
    const g = age < 18 ? '0-17' : age <= 29 ? '18-29' : age <= 44 ? '30-44' : age <= 59 ? '45-59' : '60+';
    const cur = groups.get(g) ?? { count: 0, minAge: age };
    groups.set(g, { count: cur.count + 1, minAge: Math.min(cur.minAge, age) });
  }
  const gender = new Map<string, number>();
  for (const p of patients) gender.set(p.gender, (gender.get(p.gender) ?? 0) + 1);
  return {
    totalPatients: patients.length,
    ageDistribution: [...groups.entries()].sort((a, b) => a[1].minAge - b[1].minAge).map(([ageGroup, v]) => ({ ageGroup, count: v.count })),
    genderSplit: [...gender.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, count]) => ({ gender: g, count })),
  };
}

// ─── Appointments ────────────────────────────────────────────────────────────

function appointmentsInRange(db: DemoDb, start: string, end: string, clinicId: number | null = null): Row[] {
  return db.tables.Appointments.filter(a =>
    !a.deleted_at && inRange(localDate(a.appointment_start_time), start, end) && (clinicId === null || a.clinic_id === clinicId));
}

export function attendance(db: DemoDb, start: string, end: string, clinicId: number | null) {
  const appts = appointmentsInRange(db, start, end, clinicId);
  const count = (status: string, rows: Row[] = appts) => rows.filter(a => a.status === status).length;
  const total = appts.length;

  const weeks = new Map<string, { year: number; week: number; start: string; rows: Row[] }>();
  for (const a of appts) {
    const day = localDate(a.appointment_start_time)!;
    const { year, week } = sqlWeek(day);
    const key = `${year}-${String(week).padStart(2, '0')}`;
    const w = weeks.get(key) ?? { year, week, start: day, rows: [] };
    w.start = day < w.start ? day : w.start;
    w.rows.push(a);
    weeks.set(key, w);
  }
  return {
    summary: {
      totalAppointments: total,
      completedCount: count('Completed'),
      completedPct: pct(count('Completed'), total) ?? 0,
      noShowCount: count('No Show'),
      noShowPct: pct(count('No Show'), total) ?? 0,
      canceledCount: count('Canceled'),
      canceledPct: pct(count('Canceled'), total) ?? 0,
    },
    weeklyData: [...weeks.values()]
      .sort((a, b) => a.year - b.year || a.week - b.week)
      .map(w => ({
        weekStart: w.start,
        weekNumber: w.week,
        completed: count('Completed', w.rows),
        noShow: count('No Show', w.rows),
        canceled: count('Canceled', w.rows),
        scheduled: count('Scheduled', w.rows),
      })),
  };
}

export function occupancy(db: DemoDb, start: string, end: string) {
  let workingDays = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (SAUDI_WORKING_DAYS.has(new Date(day + 'T00:00:00Z').getUTCDay())) workingDays++;
  }
  const totalSlots = Math.max(workingDays * SLOTS_PER_DAY, 1);
  const appts = appointmentsInRange(db, start, end);

  const rows = [...db.tables.Clinic].map(c => {
    const mine = appts.filter(a => a.clinic_id === c.clinic_id);
    const perDoctor = new Map<number, number>();
    for (const a of mine) perDoctor.set(a.doctor_id, (perDoctor.get(a.doctor_id) ?? 0) + 1);
    const top = [...perDoctor.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const doctor = top ? db.tables.Employee.find(e => e.employee_id === top[0]) : undefined;
    return {
      clinic_id: c.clinic_id,
      clinic_name: c.clinic_name,
      booked_slots: mine.length,
      busiest_doctor: doctor ? `${doctor.first_name} ${doctor.last_name}` : null,
    };
  }).sort((a, b) => b.booked_slots - a.booked_slots || a.clinic_id - b.clinic_id);

  const clinics = rows.map(r => ({
    clinicId: r.clinic_id,
    clinicName: r.clinic_name,
    bookedSlots: r.booked_slots,
    totalSlots,
    occupancyPct: Math.min(Math.round((r.booked_slots / totalSlots) * 1000) / 10, 100),
    busiestDoctor: r.busiest_doctor,
  })).sort((a, b) => b.occupancyPct - a.occupancyPct);

  const overallBooked = clinics.reduce((s, c) => s + c.bookedSlots, 0);
  const overallTotal = clinics.length * totalSlots || 1;
  return {
    overallOccupancy: Math.round((overallBooked / overallTotal) * 1000) / 10,
    mostUtilized: clinics.length ? { name: clinics[0].clinicName, pct: clinics[0].occupancyPct } : null,
    leastUtilized: clinics.length ? { name: clinics[clinics.length - 1].clinicName, pct: clinics[clinics.length - 1].occupancyPct } : null,
    clinics,
  };
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export function lowStock(db: DemoDb, category: string | null) {
  const inCategory = db.tables.Inventory_Items.filter(i => !category || i.category === category);
  const low = inCategory
    .map(i => ({ i, qty: quantityOnHand(db, i.item_id) }))
    .filter(({ i, qty }) => qty <= i.low_stock_limit);
  const critical = (x: { i: Row; qty: number }) => x.qty <= x.i.low_stock_limit * 0.5;
  const items = low
    .sort((a, b) => (critical(a) ? 0 : 1) - (critical(b) ? 0 : 1) || a.qty - b.qty)
    .map(x => ({
      itemId: x.i.item_id,
      itemName: x.i.item_name,
      category: x.i.category,
      quantityOnHand: x.qty,
      lowStockLimit: x.i.low_stock_limit,
      severity: critical(x) ? 'Critical' : 'Low',
    }));
  return {
    summary: {
      criticalCount: low.filter(critical).length,
      lowCount: low.filter(x => !critical(x)).length,
      totalItems: inCategory.length,
    },
    items,
  };
}

function withdrawals(db: DemoDb, start: string, end: string, category: string | null) {
  return db.tables.Stock_Transactions
    .filter(t => t.transaction_type === 'Withdraw' && inRange(localDate(t.time_stamp), start, end))
    .map(t => ({ t, item: db.tables.Inventory_Items.find(i => i.item_id === t.item_id) }))
    .filter(x => x.item && (!category || x.item.category === category)) as { t: Row; item: Row }[];
}

function topBy(rows: { t: Row; item: Row }[], key: (x: { t: Row; item: Row }) => string): [string, number] | undefined {
  const sums = new Map<string, number>();
  for (const x of rows) sums.set(key(x), (sums.get(key(x)) ?? 0) + x.t.quantity);
  return [...sums.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
}

export function consumption(db: DemoDb, start: string, end: string, category: string | null) {
  const rows = withdrawals(db, start, end, category);
  const groups = new Map<string, { year: number; week: number; category: string; start: string; total: number }>();
  for (const { t, item } of rows) {
    const day = localDate(t.time_stamp)!;
    const { year, week } = sqlWeek(day);
    const key = `${year}|${String(week).padStart(2, '0')}|${item.category}`;
    const g = groups.get(key) ?? { year, week, category: item.category, start: day, total: 0 };
    g.start = day < g.start ? day : g.start;
    g.total += t.quantity;
    groups.set(key, g);
  }
  const ordered = [...groups.values()].sort((a, b) => a.year - b.year || a.week - b.week || a.category.localeCompare(b.category));
  const weekMap = new Map<string, { weekStart: string; weekNumber: number; categories: Record<string, number> }>();
  const categories = new Set<string>();
  for (const g of ordered) {
    const key = `${g.year}-${g.week}`;
    if (!weekMap.has(key)) weekMap.set(key, { weekStart: g.start, weekNumber: g.week, categories: {} });
    const entry = weekMap.get(key)!;
    entry.categories[g.category] = (entry.categories[g.category] ?? 0) + g.total;
    categories.add(g.category);
  }
  const topItem = topBy(rows, x => x.item.item_name);
  const topCategory = topBy(withdrawals(db, start, end, null), x => x.item.category);
  return {
    summary: {
      totalWithdrawn: rows.reduce((s, x) => s + x.t.quantity, 0),
      topConsumedItem: topItem?.[0] ?? null,
      topConsumedQty: topItem?.[1] ?? 0,
      topCategory: topCategory?.[0] ?? null,
      topCategoryQty: topCategory?.[1] ?? 0,
    },
    weeklyData: [...weekMap.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    categories: [...categories].sort(),
  };
}

// ─── Students ────────────────────────────────────────────────────────────────

function studentsFor(db: DemoDb, supervisorId: number | null): Row[] {
  return db.tables.Student.filter(s => supervisorId === null || s.employee_id === supervisorId);
}

function treatmentsOf(db: DemoDb, academicId: number): Row[] {
  return db.tables.Treatment.filter(t => t.authored_by_student === academicId && !t.deleted_at);
}

const fullName = (r: Row | undefined) => (r ? `${r.first_name} ${r.last_name}` : '');
const clean = (t: Row) => t.doctor_feedback === null || t.doctor_feedback === '';

export function procedureLog(db: DemoDb, supervisorId: number | null) {
  const students = studentsFor(db, supervisorId);
  const withSupervisor = students.filter(s => db.tables.Employee.some(e => e.employee_id === s.employee_id));
  const total = students.reduce((sum, s) => sum + treatmentsOf(db, s.academic_id).length, 0);
  const types = new Map<string, number>();
  for (const s of students) for (const t of treatmentsOf(db, s.academic_id)) types.set(t.treatment_type, (types.get(t.treatment_type) ?? 0) + 1);
  return {
    summary: {
      activeStudents: students.length,
      totalProcedures: total,
      avgPerStudent: students.length ? round1(total / students.length) : 0,
    },
    students: withSupervisor
      .map(s => {
        const ts = treatmentsOf(db, s.academic_id);
        return {
          academicId: s.academic_id,
          studentName: fullName(s),
          academicLevel: s.academic_level,
          supervisorName: fullName(db.tables.Employee.find(e => e.employee_id === s.employee_id)),
          totalProcedures: ts.length,
          uniqueProcedureTypes: new Set(ts.map(t => t.treatment_type)).size,
        };
      })
      .sort((a, b) => b.totalProcedures - a.totalProcedures || a.academicId - b.academicId),
    procedureTypes: [...types.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([treatmentType, count]) => ({ treatmentType, count })),
  };
}

export function evaluation(db: DemoDb, supervisorId: number | null) {
  const evaluated = studentsFor(db, supervisorId).filter(s => treatmentsOf(db, s.academic_id).length > 0);
  const students = evaluated
    .filter(s => db.tables.Employee.some(e => e.employee_id === s.employee_id))
    .map(s => {
      const ts = treatmentsOf(db, s.academic_id);
      const cleanCount = ts.filter(clean).length;
      return {
        academicId: s.academic_id,
        studentName: fullName(s),
        academicLevel: s.academic_level,
        supervisorName: fullName(db.tables.Employee.find(e => e.employee_id === s.employee_id)),
        totalTreatments: ts.length,
        cleanApprovals: cleanCount,
        neededFeedback: ts.length - cleanCount,
        cleanApprovalRate: pct(cleanCount, ts.length) ?? 0,
      };
    })
    .sort((a, b) => b.cleanApprovalRate - a.cleanApprovalRate || a.academicId - b.academicId);
  const rates = evaluated.map(s => {
    const ts = treatmentsOf(db, s.academic_id);
    return pct(ts.filter(clean).length, ts.length) ?? 0;
  });
  return {
    summary: {
      studentsEvaluated: evaluated.length,
      avgCleanRate: rates.length ? round1(rates.reduce((a, b) => a + b, 0) / rates.length) : 0,
      topPerformer: students.length ? { name: students[0].studentName, rate: students[0].cleanApprovalRate } : null,
    },
    students,
  };
}

function parseSupervisor(raw: string | undefined): { value: number | null; error?: string } {
  if (raw === undefined || raw === '' || raw === 'null') return { value: null };
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? { value: n } : { value: null, error: 'supervisorId must be a positive integer' };
}

export function registerReports(r: DemoRouter): void {
  const ADMIN = ['Admin'];

  r.get('/reports/patients/registrations', ADMIN, ({ query, db }) => {
    const range = dateRange(query);
    return range ? ok(newRegistrations(db, range.start, range.end)) : badRequest(RANGE_ERROR);
  });

  r.get('/reports/patients/demographics', ADMIN, ({ db }) => ok(demographics(db)));

  r.get('/reports/appointments/attendance', ADMIN, ({ query, db }) => {
    const range = dateRange(query);
    if (!range) return badRequest(RANGE_ERROR);
    const raw = optionalFilter(query['clinicId']);
    let clinicId: number | null = null;
    if (raw !== null) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) return badRequest('clinicId must be a positive integer');
      clinicId = n;
    }
    return ok(attendance(db, range.start, range.end, clinicId));
  });

  r.get('/reports/appointments/occupancy', ADMIN, ({ query, db }) => {
    const range = dateRange(query);
    return range ? ok(occupancy(db, range.start, range.end)) : badRequest(RANGE_ERROR);
  });

  r.get('/reports/appointments/clinics', ADMIN, ({ db }) =>
    ok([...db.tables.Clinic].sort((a, b) => a.clinic_name.localeCompare(b.clinic_name))
      .map(c => ({ clinicId: c.clinic_id, clinicName: c.clinic_name }))));

  r.get('/reports/inventory/low-stock', ADMIN, ({ query, db }) => ok(lowStock(db, optionalFilter(query['category']))));

  r.get('/reports/inventory/consumption', ADMIN, ({ query, db }) => {
    const range = dateRange(query);
    return range ? ok(consumption(db, range.start, range.end, optionalFilter(query['category']))) : badRequest(RANGE_ERROR);
  });

  r.get('/reports/inventory/categories', ADMIN, ({ db }) =>
    ok([...new Set(db.tables.Inventory_Items.map(i => i.category))].sort()));

  r.get('/reports/students/procedure-log', ADMIN, ({ query, db }) => {
    const { value, error } = parseSupervisor(query['supervisorId']);
    return error ? badRequest(error) : ok(procedureLog(db, value));
  });

  r.get('/reports/students/evaluation-summary', ADMIN, ({ query, db }) => {
    const { value, error } = parseSupervisor(query['supervisorId']);
    return error ? badRequest(error) : ok(evaluation(db, value));
  });

  r.get('/reports/students/supervisors', ADMIN, ({ db }) => {
    const ids = new Set(db.tables.Student.map(s => s.employee_id));
    return ok(db.tables.Employee
      .filter(e => !e.deleted_at && ids.has(e.employee_id))
      .map(e => ({ employeeId: e.employee_id, doctorName: `${e.first_name} ${e.last_name}` }))
      .sort((a, b) => a.doctorName.localeCompare(b.doctorName)));
  });
}

