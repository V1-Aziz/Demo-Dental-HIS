// Logs in as every demo account and calls the read endpoints that role uses,
// failing on any non-200 response. Run against an API started on a freshly
// seeded database:
//
//   npm run db:reset && npm run dev     (in one terminal)
//   npm run smoke                       (in another)
const BASE = process.env.API_URL || 'http://localhost:3000/api';
const PASSWORD = 'Demo@1234';

const today = new Date();
const iso = d => d.toISOString().slice(0, 10);
const range = `startDate=${iso(new Date(Date.now() - 180 * 864e5))}&endDate=${iso(today)}`;
const month = `year=${today.getFullYear()}&month=${today.getMonth() + 1}`;

const COMMON = ['/notifications', '/notifications/unread-count', '/tickets', '/tickets/types'];

// [email, endpoints, checks]: a check asserts that an endpoint returns rows.
const ACCOUNTS = [
  ['admin@example.com', [
    '/patients', '/patients/1', '/records/patient/1',
    '/appointments', '/appointments/today', '/appointments/types', '/appointments/doctors',
    '/appointments/students', '/appointments/1',
    `/appointments/available-days?doctor_id=2&${month}`,
    `/appointments/available-slots?doctor_id=2&date=${iso(today)}&type_id=1`,
    '/patients/1/visits', '/patients/1/visits/7/content', '/patients/1/teeth/46/history',
    '/patients/1/lab-requests/1', '/dental-chart/record/1', '/screening/record/1',
    '/screening-requests/record/12',
    '/inventory/items', '/inventory/items/1/batches', '/inventory/requests', '/inventory/removed-items',
    '/inventory/latest-activity', '/inventory/activity-history', '/inventory/transactions',
    '/audit', '/users', '/users/roles', '/users/employees', '/users/2/contacts', '/tickets/1',
    '/dashboard/admin', '/dashboard/receptionist', '/dashboard/inventory', '/dashboard/system-performance',
    '/admin/stats/active-users', '/system-settings',
    `/reports/patients/registrations?${range}`, `/reports/patients/demographics?${range}`,
    `/reports/appointments/attendance?${range}`, `/reports/appointments/occupancy?${range}`,
    '/reports/appointments/clinics', '/reports/inventory/low-stock',
    `/reports/inventory/consumption?${range}`, '/reports/inventory/categories',
    '/reports/students/procedure-log', '/reports/students/evaluation-summary', '/reports/students/supervisors',
    '/admin/system-settings/registrations', '/admin/system-settings/registrations/count',
    '/admin/system-settings/registrations/1', '/admin/system-settings/lookups/categories',
    '/admin/system-settings/lookups/diagnosis_type',
  ], { '/inventory/items': 1, '/users': 1 }],
  ['doctor@example.com', [
    '/patients', '/patients/1', '/records/patient/1', '/appointments', '/appointments/today',
    '/appointments/types', '/appointments/doctors', '/appointments/1',
    '/lab', '/lab/1', '/diagnosis/student-submissions',
    '/academic/pending-reviews?filter=pending', '/academic/review-queue-stats',
    '/academic/review/Diagnosis/7', '/academic/grades/summary', '/academic/grades/student/1',
    '/patients/1/visits', '/patients/1/visits/today', '/patients/1/visits/7/content',
    '/patients/1/teeth/46/history', '/dental-chart/record/1', '/screening/record/1',
    '/screening-requests/record/12',
  ], { '/appointments/today': 1, '/academic/pending-reviews?filter=pending': 1, '/lab': 1 }],
  ['doctor2@example.com', [
    '/appointments/today', '/academic/pending-reviews?filter=pending', '/academic/review-queue-stats',
    '/lab', '/patients/5/visits',
  ], { '/academic/pending-reviews?filter=pending': 1 }],
  ['student@example.com', [
    '/patients/my', '/patients/1', '/records/patient/1', '/appointments', '/appointments/today',
    '/appointments/types', '/appointments/doctors', '/appointments/28',
    '/lab', '/lab/1', '/diagnosis/my-notes', '/academic/my-submissions', '/academic/grades/my',
    '/academic/file-access/1', '/academic/assignments',
    '/patients/1/visits', '/patients/1/visits/today', '/dental-chart/record/1', '/screening/record/1',
  ], { '/academic/my-submissions': 1 }],
  ['student2@example.com', [
    '/patients/my', '/academic/my-submissions', '/academic/grades/my', '/lab',
  ], {}],
  ['reception@example.com', [
    '/patients', '/patients/1', '/records/patient/1', '/appointments', '/appointments/today',
    '/appointments/types', '/appointments/doctors', '/appointments/students',
    `/appointments/available-days?doctor_id=2&${month}`,
    `/appointments/available-slots?doctor_id=3&date=${iso(today)}&type_id=2`,
    '/dashboard/receptionist',
  ], { '/appointments/today': 5 }],
  ['lab@example.com', [
    '/lab?queue=incoming', '/lab?queue=my_work', '/lab?queue=history', '/lab/1',
    '/inventory/items', '/inventory/requests/my',
  ], { '/lab?queue=incoming': 1, '/lab?queue=my_work': 1, '/lab?queue=history': 1 }],
  ['assistant@example.com', [
    '/patients', '/patients/1', '/appointments/today', '/inventory/items', '/inventory/requests/my',
    '/patients/1/visits', '/dental-chart/record/1', '/screening/record/1',
    '/screening/patient/12/todays-appointments',
  ], { '/inventory/requests/my': 1 }],
  ['inventory@example.com', [
    '/inventory/items', '/inventory/items/1/batches', '/inventory/requests', '/inventory/requests/my',
    '/inventory/removed-items', '/inventory/latest-activity', '/inventory/activity-history',
    '/inventory/transactions', '/dashboard/inventory', '/users/employees',
  ], { '/inventory/items': 10, '/inventory/removed-items': 1 }],
  ['radiology@example.com', [
    '/radiologist/dashboard', '/radiologist/patients', '/radiologist/patients/12',
    '/radiologist/patients/12/appointments-today', '/screening-requests/mine',
    '/screening/record/12', '/screening-requests/record/12',
  ], { '/screening-requests/mine': 1 }],
];

const PUBLIC = ['/auth/registerable-roles', '/lookups/public/contact_type'];

function rowCount(data) {
  if (Array.isArray(data)) return data.length;
  for (const key of ['items', 'rows', 'data']) {
    if (data && Array.isArray(data[key])) return data[key].length;
  }
  return null;
}

async function call(path, token) {
  const res = await fetch(BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, body, text };
}

async function main() {
  const failures = [];
  let calls = 0;

  for (const path of PUBLIC) {
    calls++;
    const r = await call(path);
    if (r.status !== 200) failures.push(`(public) GET ${path} -> ${r.status} ${r.text.slice(0, 200)}`);
  }

  for (const [email, endpoints, checks] of ACCOUNTS) {
    const login = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    const loginBody = await login.json().catch(() => null);
    const token = loginBody?.data?.accessToken;
    if (login.status !== 200 || !token) {
      failures.push(`${email}: login failed (${login.status}) ${JSON.stringify(loginBody)}`);
      continue;
    }

    for (const path of [...COMMON, ...endpoints]) {
      calls++;
      const r = await call(path, token);
      if (r.status !== 200) {
        failures.push(`${email}: GET ${path} -> ${r.status} ${r.text.slice(0, 200)}`);
        continue;
      }
      const min = checks[path];
      if (min !== undefined) {
        const n = rowCount(r.body?.data);
        if (n === null || n < min) failures.push(`${email}: GET ${path} returned ${n} rows, expected at least ${min}`);
      }
    }
    console.log(`ok  ${email} (${COMMON.length + endpoints.length} endpoints)`);
  }

  if (failures.length) {
    console.error(`\n${failures.length} of ${calls} checks failed:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`\nAll ${calls} requests returned 200.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
