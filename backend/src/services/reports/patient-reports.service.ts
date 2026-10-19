import * as repo from '../../repositories/reports/patient-reports.repository';

export async function getNewRegistrationsService(startDate: string, endDate: string) {
  const [summary, weeklyRows] = await Promise.all([
    repo.getNewRegistrationsSummary(startDate, endDate),
    repo.getWeeklyRegistrations(startDate, endDate),
  ]);

  // Compute percent change vs prior period of equal length
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysSpan = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const priorEnd = new Date(start);
  priorEnd.setDate(priorEnd.getDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - daysSpan + 1);

  const priorCount = await repo.getRegistrationCountForPeriod(
    priorStart.toISOString().slice(0, 10),
    priorEnd.toISOString().slice(0, 10),
  );

  const percentChange = priorCount > 0
    ? Math.round(((summary.total - priorCount) / priorCount) * 100)
    : summary.total > 0 ? 100 : 0;

  const totalWeeks = weeklyRows.length || 1;
  const avgPerWeek = +(summary.total / totalWeeks).toFixed(1);

  const weeklyData = weeklyRows.map(r => {
    const d = new Date(r.weekStart);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    return { weekLabel: label, count: r.count };
  });

  return {
    summary: {
      totalNewPatients: summary.total,
      avgPerWeek,
      peakDay: summary.peakDay,
      peakDayCount: summary.peakDayCount,
      percentChange,
    },
    weeklyData,
  };
}

export async function getDemographicsService() {
  const [totalPatients, ageDistribution, genderSplit] = await Promise.all([
    repo.getTotalPatients(),
    repo.getAgeDistribution(),
    repo.getGenderSplit(),
  ]);

  return { totalPatients, ageDistribution, genderSplit };
}
