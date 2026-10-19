import { getClinicOccupancyService } from '../../reports/appointment-reports.service';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';
import { formatDateRange } from '../../../utils/date.util';

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function fetchClinicOccupancy(
  filters: { startDate?: string; endDate?: string },
  generatedBy: string,
): Promise<ReportDataset> {
  const endDate = filters.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate = filters.startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();

  const [occupancy, appointments] = await Promise.all([
    getClinicOccupancyService(startDate, endDate),
    extrasRepo.getAppointmentsList(startDate, endDate, null),
  ]);

  return {
    reportTitle: 'Clinic Occupancy',
    contextSubtitle: formatDateRange(startDate, endDate),
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Overall Occupancy', value: `${occupancy.overallOccupancy}%` },
          {
            label: 'Most Utilized',
            value: occupancy.mostUtilized
              ? `${occupancy.mostUtilized.name} (${occupancy.mostUtilized.pct}%)`
              : '-',
          },
          {
            label: 'Least Utilized',
            value: occupancy.leastUtilized
              ? `${occupancy.leastUtilized.name} (${occupancy.leastUtilized.pct}%)`
              : '-',
          },
        ],
      },
      'occupancy-chart': {
        type: 'chart',
        label: 'Occupancy by Clinic',
        chartType: 'bar',
        data: {
          labels: occupancy.clinics.map((c) => c.clinicName),
          datasets: [{ label: 'Occupancy %', values: occupancy.clinics.map((c) => c.occupancyPct) }],
        },
      },
      'by-doctor': {
        type: 'table',
        label: 'Busiest Doctor per Clinic',
        columns: [
          { key: 'clinic_name', header: 'Clinic', width: 24 },
          { key: 'booked_slots', header: 'Booked Slots', width: 14 },
          { key: 'occupancy', header: 'Occupancy', width: 12 },
          { key: 'busiest_doctor', header: 'Busiest Doctor', width: 28 },
        ],
        rows: occupancy.clinics.map((c) => ({
          clinic_name: c.clinicName,
          booked_slots: c.bookedSlots,
          occupancy: `${c.occupancyPct}%`,
          busiest_doctor: c.busiestDoctor ?? '-',
        })),
      },
      table: {
        type: 'table',
        label: 'Slot-Level Utilization',
        columns: [
          { key: 'start_time', header: 'Date/Time', width: 22 },
          { key: 'clinic_name', header: 'Clinic', width: 16 },
          { key: 'doctor_name', header: 'Doctor', width: 22 },
          { key: 'patient_name', header: 'Patient', width: 22 },
          { key: 'status', header: 'Status', width: 12 },
        ],
        rows: appointments.map((a) => ({
          start_time: fmtDateTime(a.appointment_start_time),
          clinic_name: a.clinic_name ?? '',
          doctor_name: a.doctor_name,
          patient_name: a.patient_name,
          status: a.status,
        })),
      },
    },
  };
}
