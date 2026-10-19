import { ReportDataset } from './exporters/exporter.types';
import { fetchNewPatientRegistrations } from './data/new-patient-registrations.data';
import { fetchPatientDemographics } from './data/patient-demographics.data';
import { fetchAttendanceNoShow } from './data/attendance-no-show.data';
import { fetchClinicOccupancy } from './data/clinic-occupancy.data';
import { fetchLowStockItems } from './data/low-stock-items.data';
import { fetchConsumption } from './data/consumption.data';
import { fetchStudentProcedureLog } from './data/student-procedure-log.data';
import { fetchSupervisorEvaluation } from './data/supervisor-evaluation.data';

export type ReportKey =
  | 'new-patient-registrations'
  | 'patient-demographics'
  | 'attendance-no-show'
  | 'clinic-occupancy'
  | 'low-stock-items'
  | 'consumption'
  | 'student-procedure-log'
  | 'supervisor-evaluation';

type DataFetcher = (filters: any, generatedBy: string) => Promise<ReportDataset>;

export const REPORT_DATA_REGISTRY: Record<ReportKey, DataFetcher> = {
  'new-patient-registrations': fetchNewPatientRegistrations,
  'patient-demographics': fetchPatientDemographics,
  'attendance-no-show': fetchAttendanceNoShow,
  'clinic-occupancy': fetchClinicOccupancy,
  'low-stock-items': fetchLowStockItems,
  'consumption': fetchConsumption,
  'student-procedure-log': fetchStudentProcedureLog,
  'supervisor-evaluation': fetchSupervisorEvaluation,
};
