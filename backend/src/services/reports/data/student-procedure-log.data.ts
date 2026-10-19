import * as studentRepo from '../../../repositories/reports/student-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';

export async function fetchStudentProcedureLog(
  filters: { supervisorId?: number | null },
  generatedBy: string,
): Promise<ReportDataset> {
  const supervisorId = filters.supervisorId ?? null;

  const [summary, students, types, procedures] = await Promise.all([
    studentRepo.getProcedureLogSummary(supervisorId),
    studentRepo.getStudentProcedureLog(supervisorId),
    studentRepo.getProcedureTypeDistribution(supervisorId),
    extrasRepo.getStudentProceduresList(supervisorId),
  ]);

  const topType = types[0]?.treatment_type ?? '-';

  return {
    reportTitle: 'Student Procedure Log',
    contextSubtitle: supervisorId ? `Filtered by supervisor ID ${supervisorId}` : 'All supervisors',
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total Procedures', value: summary.total_procedures ?? 0 },
          { label: 'Active Students', value: summary.active_students ?? 0 },
          { label: 'Top Procedure Type', value: topType },
        ],
      },
      'trend-chart': {
        type: 'chart',
        label: 'Procedure Type Distribution',
        chartType: 'bar',
        data: {
          labels: types.map((t) => t.treatment_type),
          datasets: [{ label: 'Procedures', values: types.map((t) => t.count) }],
        },
      },
      'by-student': {
        type: 'table',
        label: 'Per-Student Breakdown',
        columns: [
          { key: 'student_name', header: 'Student', width: 24 },
          { key: 'academic_level', header: 'Level', width: 10 },
          { key: 'supervisor_name', header: 'Supervisor', width: 22 },
          { key: 'total_procedures', header: 'Procedures', width: 14 },
          { key: 'unique_procedure_types', header: 'Types', width: 10 },
        ],
        rows: students.map((s) => ({
          student_name: s.student_name,
          academic_level: `Level ${s.academic_level}`,
          supervisor_name: s.supervisor_name,
          total_procedures: s.total_procedures ?? 0,
          unique_procedure_types: s.unique_procedure_types ?? 0,
        })),
      },
      table: {
        type: 'table',
        label: 'Raw Procedures',
        columns: [
          { key: 'student_name', header: 'Student', width: 22 },
          { key: 'patient_name', header: 'Patient', width: 22 },
          { key: 'treatment_type', header: 'Type', width: 20 },
          { key: 'approved_by', header: 'Approved By', width: 22 },
        ],
        rows: procedures.map((p) => ({
          student_name: p.student_name,
          patient_name: p.patient_name,
          treatment_type: p.treatment_type,
          approved_by: p.approved_by,
        })),
      },
    },
  };
}
