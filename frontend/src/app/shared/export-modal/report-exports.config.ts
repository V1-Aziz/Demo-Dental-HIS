export type ReportKey =
  | 'new-patient-registrations'
  | 'patient-demographics'
  | 'attendance-no-show'
  | 'clinic-occupancy'
  | 'low-stock-items'
  | 'consumption'
  | 'student-procedure-log'
  | 'supervisor-evaluation';

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ReportSection {
  key: string;
  label: string;
  defaultChecked: boolean;
  required?: boolean;
}

export interface ReportExportConfig {
  title: string;
  sections: ReportSection[];
}

export interface ExportRequest {
  reportKey: ReportKey;
  format: ExportFormat;
  sections: string[];
  filters: Record<string, unknown>;
}

export const REPORT_EXPORT_CONFIGS: Record<ReportKey, ReportExportConfig> = {
  'new-patient-registrations': {
    title: 'New Patient Registrations',
    sections: [
      { key: 'summary', label: 'Summary metrics (Total, Average, Peak)', defaultChecked: true },
      { key: 'chart',   label: 'Weekly registration chart',               defaultChecked: true },
      { key: 'table',   label: 'Patient list',                            defaultChecked: false },
    ],
  },
  'patient-demographics': {
    title: 'Patient Demographics',
    sections: [
      { key: 'summary',      label: 'Summary metrics (Total, Avg Age, Gender Split)', defaultChecked: true },
      { key: 'age-chart',    label: 'Age distribution chart',                         defaultChecked: true },
      { key: 'gender-chart', label: 'Gender distribution chart',                      defaultChecked: true },
      { key: 'table',        label: 'Patient demographics table',                     defaultChecked: false },
    ],
  },
  'attendance-no-show': {
    title: 'Attendance & No-Show Rate',
    sections: [
      { key: 'summary',     label: 'Summary metrics (Total, Attended %, No-Show %)', defaultChecked: true },
      { key: 'trend-chart', label: 'Attendance trend over time',                     defaultChecked: true },
      { key: 'by-doctor',   label: 'Per-doctor breakdown',                           defaultChecked: false },
      { key: 'table',       label: 'Appointments list',                              defaultChecked: false },
    ],
  },
  'clinic-occupancy': {
    title: 'Clinic Occupancy',
    sections: [
      { key: 'summary',         label: 'Summary metrics (Overall, Peak, Lowest)', defaultChecked: true },
      { key: 'occupancy-chart', label: 'Occupancy chart',                         defaultChecked: true },
      { key: 'by-doctor',       label: 'Per-doctor occupancy breakdown',          defaultChecked: true },
      { key: 'table',           label: 'Slot-level utilization table',            defaultChecked: false },
    ],
  },
  'low-stock-items': {
    title: 'Low Stock Items',
    sections: [
      { key: 'summary',        label: 'Summary metrics (Total, Critical, Categories)', defaultChecked: true },
      { key: 'category-chart', label: 'Low-stock count by category',                    defaultChecked: false },
      { key: 'table',          label: 'Items list (always included)',                   defaultChecked: true, required: true },
    ],
  },
  'consumption': {
    title: 'Consumption Report',
    sections: [
      { key: 'summary',        label: 'Summary metrics (Total, Top Item, Avg Daily)', defaultChecked: true },
      { key: 'trend-chart',    label: 'Consumption trend over time',                   defaultChecked: true },
      { key: 'category-chart', label: 'Consumption by category',                       defaultChecked: true },
      { key: 'table',          label: 'Stock transactions table',                      defaultChecked: false },
    ],
  },
  'student-procedure-log': {
    title: 'Student Procedure Log',
    sections: [
      { key: 'summary',     label: 'Summary metrics (Total, Active Students, Top Type)', defaultChecked: true },
      { key: 'trend-chart', label: 'Procedures over time',                                defaultChecked: true },
      { key: 'by-student',  label: 'Per-student breakdown',                               defaultChecked: true },
      { key: 'table',       label: 'Raw procedures table',                                defaultChecked: false },
    ],
  },
  'supervisor-evaluation': {
    title: 'Supervisor Evaluation Summary',
    sections: [
      { key: 'summary',       label: 'Summary metrics (Total, Students, Supervisors)', defaultChecked: true },
      { key: 'by-supervisor', label: 'Per-supervisor evaluation volume',               defaultChecked: true },
      { key: 'by-student',    label: 'Per-student evaluation summary',                 defaultChecked: true },
      { key: 'table',         label: 'Raw evaluations',                                defaultChecked: false },
    ],
  },
};
