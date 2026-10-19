import * as patientRepo from '../../../repositories/reports/patient-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';
import { formatDateRange } from '../../../utils/date.util';

function weekLabel(weekStart: Date): string {
  const d = new Date(weekStart);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDate(d: Date | null): string {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function fetchNewPatientRegistrations(
  filters: { startDate?: string; endDate?: string },
  generatedBy: string,
): Promise<ReportDataset> {
  const endDate = filters.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate = filters.startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  })();

  const [summary, weekly, patients] = await Promise.all([
    patientRepo.getNewRegistrationsSummary(startDate, endDate),
    patientRepo.getWeeklyRegistrations(startDate, endDate),
    extrasRepo.getPatientsRegisteredInPeriod(startDate, endDate),
  ]);

  const totalWeeks = weekly.length || 1;
  const avgPerWeek = +(summary.total / totalWeeks).toFixed(1);

  return {
    reportTitle: 'New Patient Registrations',
    contextSubtitle: formatDateRange(startDate, endDate),
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total New Patients', value: summary.total ?? 0 },
          { label: 'Avg Per Week', value: avgPerWeek },
          {
            label: 'Peak Day',
            value: summary.peakDay
              ? `${fmtDate(new Date(summary.peakDay))} (${summary.peakDayCount ?? 0})`
              : '-',
          },
        ],
      },
      chart: {
        type: 'chart',
        label: 'Weekly Registration Count',
        chartType: 'bar',
        data: {
          labels: weekly.map((w) => weekLabel(w.weekStart)),
          datasets: [{ label: 'Registrations', values: weekly.map((w) => w.count) }],
        },
      },
      table: {
        type: 'table',
        label: 'Patient List',
        columns: [
          { key: 'full_name', header: 'Name', width: 28 },
          { key: 'file_number', header: 'File No', width: 14 },
          { key: 'gender', header: 'Gender', width: 12 },
          { key: 'registered_on', header: 'Registered On', width: 18 },
        ],
        rows: patients.map((p) => ({
          full_name: p.full_name,
          file_number: p.file_number,
          gender: p.gender,
          registered_on: fmtDate(p.created_at),
        })),
      },
    },
  };
}
