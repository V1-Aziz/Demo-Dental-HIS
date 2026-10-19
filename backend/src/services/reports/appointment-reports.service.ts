import * as repo from '../../repositories/reports/appointment-reports.repository';

const SLOTS_PER_DAY = 16;

const SAUDI_WORKING_DAYS = new Set<number>([0, 1, 2, 3, 4]);

function countWorkingDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    if (SAUDI_WORKING_DAYS.has(cursor.getDay())) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export async function getAttendanceStatsService(
  startDate: string,
  endDate: string,
  clinicId?: number | null,
) {
  const [summaryRow, weeklyRows] = await Promise.all([
    repo.getAttendanceSummary(startDate, endDate, clinicId),
    repo.getAttendanceWeekly(startDate, endDate, clinicId),
  ]);

  const summary = {
    totalAppointments: summaryRow.total_appointments ?? 0,
    completedCount: summaryRow.completed_count ?? 0,
    completedPct: summaryRow.completed_pct ?? 0,
    noShowCount: summaryRow.no_show_count ?? 0,
    noShowPct: summaryRow.no_show_pct ?? 0,
    canceledCount: summaryRow.canceled_count ?? 0,
    canceledPct: summaryRow.canceled_pct ?? 0,
  };

  const weeklyData = weeklyRows.map((r) => ({
    weekStart: new Date(r.week_start).toISOString().slice(0, 10),
    weekNumber: r.week_number,
    completed: r.completed ?? 0,
    noShow: r.no_show ?? 0,
    canceled: r.canceled ?? 0,
    scheduled: r.scheduled ?? 0,
  }));

  return { summary, weeklyData };
}

export async function getClinicOccupancyService(startDate: string, endDate: string) {
  const rows = await repo.getClinicOccupancyRows(startDate, endDate);

  const workingDays = countWorkingDays(startDate, endDate);
  const totalSlots = Math.max(workingDays * SLOTS_PER_DAY, 1);

  const clinics = rows.map((r) => {
    const bookedSlots = r.booked_slots ?? 0;
    const occupancyPct = Math.min(
      Math.round((bookedSlots / totalSlots) * 1000) / 10,
      100,
    );
    return {
      clinicId: r.clinic_id,
      clinicName: r.clinic_name,
      bookedSlots,
      totalSlots,
      occupancyPct,
      busiestDoctor: r.busiest_doctor ?? null,
    };
  });

  clinics.sort((a, b) => b.occupancyPct - a.occupancyPct);

  const overallBooked = clinics.reduce((sum, c) => sum + c.bookedSlots, 0);
  const overallTotal = clinics.length * totalSlots || 1;
  const overallOccupancy = Math.round((overallBooked / overallTotal) * 1000) / 10;

  const mostUtilized = clinics.length
    ? { name: clinics[0].clinicName, pct: clinics[0].occupancyPct }
    : null;
  const leastUtilized = clinics.length
    ? { name: clinics[clinics.length - 1].clinicName, pct: clinics[clinics.length - 1].occupancyPct }
    : null;

  return {
    overallOccupancy,
    mostUtilized,
    leastUtilized,
    clinics,
  };
}

export async function getClinicsService() {
  const rows = await repo.getClinicsForFilter();
  return rows.map((r) => ({ clinicId: r.clinic_id, clinicName: r.clinic_name }));
}
