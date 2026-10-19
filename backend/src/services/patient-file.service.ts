import * as repo from '../repositories/patient-file.repository';
import type {
  PatientVisitTimeline,
  VisitTimelineEntry,
  VisitContent,
  ActiveAppointmentInfo,
  TodaysAppointmentsResponse,
  ToothHistoryEntry,
  LabRequestDetail,
} from '../types/patient-file.types';

const MONTH_NAMES = repo.MONTH_NAMES;

export async function getVisitTimeline(patientId: number): Promise<PatientVisitTimeline> {
  const visits = await repo.getVisitTimeline(patientId);

  const todayEntry = visits.find((v) => v.is_today);
  const today_visit_id = todayEntry?.appointment_id ?? null;

  // Group by year → month
  const byYear = new Map<number, Map<number, VisitTimelineEntry[]>>();

  for (const visit of visits) {
    const [yearStr, monthStr] = visit.appointment_date.split('-');
    const year  = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed for MONTH_NAMES

    if (!byYear.has(year)) byYear.set(year, new Map());
    const yearMap = byYear.get(year)!;
    if (!yearMap.has(month)) yearMap.set(month, []);
    yearMap.get(month)!.push(visit);
  }

  const grouped = Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, monthMap]) => {
      const months = Array.from(monthMap.entries())
        .sort(([a], [b]) => b - a)
        .map(([monthIdx, monthVisits]) => ({
          month: monthIdx + 1,
          name:  MONTH_NAMES[monthIdx],
          count: monthVisits.length,
          visits: monthVisits,
        }));
      return {
        year,
        count: months.reduce((s, m) => s + m.count, 0),
        months,
      };
    });

  return {
    total_visits:   visits.length,
    today_visit_id,
    grouped,
  };
}

export async function getVisitContent(
  patientId:     number,
  appointmentId: number,
): Promise<VisitContent | null> {
  return repo.getVisitContent(patientId, appointmentId);
}

export async function getTodaysAppointments(
  patientId:   number,
  userId:      number,
  userRole:    string,
  academicId?: number,
): Promise<TodaysAppointmentsResponse> {
  // Admin and DentalAssistant never write clinical entries
  if (userRole === 'Admin' || userRole === 'DentalAssistant') {
    return { appointments: [], patient_is_assigned_to_user: false };
  }

  // Compute assignment independent of whether appointments exist — the
  // Student "Today's Visit" tab is gated on assignment, not on there being an
  // appointment. When assigned but no appointment, the tab renders an empty state.
  let patientIsAssigned = true;
  if (userRole === 'Student' && academicId != null) {
    patientIsAssigned = await isPatientAssignedToStudent(patientId, academicId);
  }

  const appointments = await repo.getTodaysAppointments(patientId);

  return { appointments, patient_is_assigned_to_user: patientIsAssigned };
}

async function isPatientAssignedToStudent(
  patientId:  number,
  academicId: number,
): Promise<boolean> {
  const { getPool } = await import('../config/db.config');
  const sql = (await import('mssql')).default;
  const pool = await getPool();
  const result = await pool
    .request()
    .input('patientId',  sql.Int, patientId)
    .input('academicId', sql.Int, academicId)
    .query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM Patients
        WHERE patient_id = @patientId AND academic_id = @academicId`,
    );
  return (result.recordset[0]?.cnt ?? 0) > 0;
}

export async function getToothHistory(
  patientId:   number,
  toothNumber: string,
): Promise<ToothHistoryEntry[]> {
  return repo.getToothHistory(patientId, toothNumber);
}

export async function getLabRequestDetail(
  labRequestId: number,
): Promise<LabRequestDetail | null> {
  return repo.getLabRequestDetail(labRequestId);
}
