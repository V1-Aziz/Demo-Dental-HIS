import * as repo from '../../repositories/reports/student-reports.repository';

export async function getStudentProcedureLogService(supervisorId?: number | null) {
  const [summaryRow, studentRows, typeRows] = await Promise.all([
    repo.getProcedureLogSummary(supervisorId),
    repo.getStudentProcedureLog(supervisorId),
    repo.getProcedureTypeDistribution(supervisorId),
  ]);

  return {
    summary: {
      activeStudents: summaryRow.active_students ?? 0,
      totalProcedures: summaryRow.total_procedures ?? 0,
      avgPerStudent: summaryRow.avg_per_student ?? 0,
    },
    students: studentRows.map((r) => ({
      academicId: r.academic_id,
      studentName: r.student_name,
      academicLevel: r.academic_level,
      supervisorName: r.supervisor_name,
      totalProcedures: r.total_procedures ?? 0,
      uniqueProcedureTypes: r.unique_procedure_types ?? 0,
    })),
    procedureTypes: typeRows.map((r) => ({
      treatmentType: r.treatment_type,
      count: r.count ?? 0,
    })),
  };
}

export async function getSupervisorEvaluationService(supervisorId?: number | null) {
  const [summaryRow, studentRows] = await Promise.all([
    repo.getEvaluationSummary(supervisorId),
    repo.getEvaluationStudents(supervisorId),
  ]);

  const students = studentRows.map((r) => ({
    academicId: r.academic_id,
    studentName: r.student_name,
    academicLevel: r.academic_level,
    supervisorName: r.supervisor_name,
    totalTreatments: r.total_treatments ?? 0,
    cleanApprovals: r.clean_approvals ?? 0,
    neededFeedback: r.needed_feedback ?? 0,
    cleanApprovalRate: r.clean_approval_rate ?? 0,
  }));

  const topPerformer = students.length
    ? { name: students[0].studentName, rate: students[0].cleanApprovalRate }
    : null;

  return {
    summary: {
      studentsEvaluated: summaryRow.students_evaluated ?? 0,
      avgCleanRate: summaryRow.avg_clean_rate ?? 0,
      topPerformer,
    },
    students,
  };
}

export async function getSupervisorsService() {
  const rows = await repo.getSupervisorsForFilter();
  return rows.map((r) => ({ employeeId: r.employee_id, doctorName: r.doctor_name }));
}
