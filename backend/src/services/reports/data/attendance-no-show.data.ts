import * as apptRepo from '../../../repositories/reports/appointment-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';
import { formatDateRange } from '../../../utils/date.util';

function weekLabel(weekStart: Date): string {
  const d = new Date(weekStart);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function fetchAttendanceNoShow(
  filters: { startDate?: string; endDate?: string; clinicId?: number | null },
  generatedBy: string,
): Promise<ReportDataset> {
  const endDate = filters.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate = filters.startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const clinicId = filters.clinicId ?? null;

  const [summary, weekly, byDoctor, appointments] = await Promise.all([
    apptRepo.getAttendanceSummary(startDate, endDate, clinicId),
    apptRepo.getAttendanceWeekly(startDate, endDate, clinicId),
    extrasRepo.getAttendanceByDoctor(startDate, endDate, clinicId),
    extrasRepo.getAppointmentsList(startDate, endDate, clinicId),
  ]);

  return {
    reportTitle: 'Attendance & No-Show Rate',
    contextSubtitle: formatDateRange(startDate, endDate),
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total Appointments', value: summary.total_appointments ?? 0 },
          {
            label: 'Completed',
            value: `${summary.completed_count ?? 0} (${summary.completed_pct ?? 0}%)`,
          },
          {
            label: 'No-Show',
            value: `${summary.no_show_count ?? 0} (${summary.no_show_pct ?? 0}%)`,
          },
          {
            label: 'Canceled',
            value: `${summary.canceled_count ?? 0} (${summary.canceled_pct ?? 0}%)`,
          },
        ],
      },
      'trend-chart': {
        type: 'chart',
        label: 'Weekly Attendance Trend',
        chartType: 'bar',
        data: {
          labels: weekly.map((w) => weekLabel(w.week_start)),
          datasets: [
            { label: 'Completed', values: weekly.map((w) => w.completed ?? 0) },
            { label: 'No-Show', values: weekly.map((w) => w.no_show ?? 0) },
            { label: 'Canceled', values: weekly.map((w) => w.canceled ?? 0) },
          ],
        },
      },
      'by-doctor': {
        type: 'table',
        label: 'Per-Doctor Breakdown',
        columns: [
          { key: 'doctor_name', header: 'Doctor', width: 28 },
          { key: 'total_appointments', header: 'Total', width: 12 },
          { key: 'completed', header: 'Completed', width: 14 },
          { key: 'no_show', header: 'No-Show', width: 12 },
          { key: 'canceled', header: 'Canceled', width: 12 },
        ],
        rows: byDoctor.map((r) => ({
          doctor_name: r.doctor_name,
          total_appointments: r.total_appointments ?? 0,
          completed: r.completed ?? 0,
          no_show: r.no_show ?? 0,
          canceled: r.canceled ?? 0,
        })),
      },
      table: {
        type: 'table',
        label: 'Appointments List',
        columns: [
          { key: 'patient_name', header: 'Patient', width: 24 },
          { key: 'doctor_name', header: 'Doctor', width: 22 },
          { key: 'clinic_name', header: 'Clinic', width: 16 },
          { key: 'start_time', header: 'Date/Time', width: 22 },
          { key: 'status', header: 'Status', width: 12 },
        ],
        rows: appointments.map((a) => ({
          patient_name: a.patient_name,
          doctor_name: a.doctor_name,
          clinic_name: a.clinic_name ?? '',
          start_time: fmtDateTime(a.appointment_start_time),
          status: a.status,
        })),
      },
    },
  };
}
