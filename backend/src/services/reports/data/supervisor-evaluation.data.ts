import * as studentRepo from '../../../repositories/reports/student-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';

export async function fetchSupervisorEvaluation(
  filters: { supervisorId?: number | null },
  generatedBy: string,
): Promise<ReportDataset> {
  const supervisorId = filters.supervisorId ?? null;

  const [summary, students, evaluations, bySupervisor] = await Promise.all([
    studentRepo.getEvaluationSummary(supervisorId),
    studentRepo.getEvaluationStudents(supervisorId),
    extrasRepo.getSupervisorEvaluationsList(supervisorId),
    extrasRepo.getSupervisorEvaluationVolume(),
  ]);

  const totalEvaluations = students.reduce((acc, s) => acc + (s.needed_feedback ?? 0), 0);
  const activeSupervisors = new Set(students.map((s) => s.supervisor_name)).size;

  return {
    reportTitle: 'Supervisor Evaluation Summary',
    contextSubtitle: supervisorId ? `Filtered by supervisor ID ${supervisorId}` : 'All supervisors',
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total Evaluations', value: totalEvaluations },
          { label: 'Students Evaluated', value: summary.students_evaluated ?? 0 },
          { label: 'Supervisors Active', value: activeSupervisors },
        ],
      },
      'by-supervisor': {
        type: 'table',
        label: 'Per-Supervisor Volume',
        columns: [
          { key: 'supervisor_name', header: 'Supervisor', width: 28 },
          { key: 'evaluation_count', header: 'Evaluations', width: 16 },
        ],
        rows: bySupervisor.map((r) => ({
          supervisor_name: r.supervisor_name,
          evaluation_count: r.evaluation_count,
        })),
      },
      'by-student': {
        type: 'table',
        label: 'Per-Student Evaluation Summary',
        columns: [
          { key: 'student_name', header: 'Student', width: 24 },
          { key: 'supervisor_name', header: 'Supervisor', width: 22 },
          { key: 'total_treatments', header: 'Treatments', width: 14 },
          { key: 'needed_feedback', header: 'Evaluated', width: 12 },
          { key: 'clean_approval_rate', header: 'Clean %', width: 12 },
        ],
        rows: students.map((s) => ({
          student_name: s.student_name,
          supervisor_name: s.supervisor_name,
          total_treatments: s.total_treatments ?? 0,
          needed_feedback: s.needed_feedback ?? 0,
          clean_approval_rate: `${s.clean_approval_rate ?? 0}%`,
        })),
      },
      table: {
        type: 'table',
        label: 'Raw Evaluations',
        columns: [
          { key: 'student_name', header: 'Student', width: 22 },
          { key: 'supervisor_name', header: 'Supervisor', width: 22 },
          { key: 'feedback_excerpt', header: 'Feedback Excerpt', width: 40 },
        ],
        rows: evaluations.map((e) => ({
          student_name: e.student_name,
          supervisor_name: e.supervisor_name,
          feedback_excerpt: e.feedback_excerpt,
        })),
      },
    },
  };
}
