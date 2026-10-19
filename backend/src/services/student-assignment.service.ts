// Business logic for student temporal file access.
// No SQL here — data access is in student-assignment.repository.ts.
// No req/res here — HTTP concerns stay in student-assignment.controller.ts.
import {
  findAssignment,
  createAssignment,
  expireAssignment,
  getStudentAssignments,
  AssignmentRow,
} from '../repositories/student-assignment.repository';

export interface FileAccessInfo {
  accessType:            'write' | 'read';
  isAssigned:            boolean;
  isExpired:             boolean;
  hoursRemaining:        number;
  writeAccessExpiresAt?: string;
  expiredAt?:            string;
}

// ─── File access check ────────────────────────────────────────────────────────

export async function getFileAccessService(
  studentUserId: number,
  patientId:     number,
): Promise<FileAccessInfo> {
  const assignment = await findAssignment(studentUserId, patientId);

  // Student was never assigned to this file
  if (!assignment) {
    return {
      accessType:     'read',
      isAssigned:     false,
      isExpired:      false,
      hoursRemaining: 0,
    };
  }

  const now       = Date.now();
  const expiresAt = new Date(assignment.write_access_expires_at).getTime();

  if (now > expiresAt) {
    // Mark as expired in the database if not already done
    if (!assignment.is_expired) {
      await expireAssignment(assignment.assignment_id);
    }
    return {
      accessType:     'read',
      isAssigned:     true,
      isExpired:      true,
      hoursRemaining: 0,
      expiredAt:      new Date(assignment.write_access_expires_at).toISOString(),
    };
  }

  // Write window still open — calculate remaining hours (1 decimal place)
  const hoursRemaining = Math.round(((expiresAt - now) / 3_600_000) * 10) / 10;
  return {
    accessType:           'write',
    isAssigned:           true,
    isExpired:            false,
    hoursRemaining,
    writeAccessExpiresAt: new Date(assignment.write_access_expires_at).toISOString(),
  };
}

// ─── Assignment creation ──────────────────────────────────────────────────────

export async function createOrGetAssignmentService(
  studentUserId: number,
  patientId:     number,
): Promise<{ assignment: AssignmentRow; created: boolean }> {
  const existing = await findAssignment(studentUserId, patientId);
  if (existing) {
    return { assignment: existing, created: false };
  }
  const assignment = await createAssignment(studentUserId, patientId);
  return { assignment, created: true };
}

// ─── Assignment list ──────────────────────────────────────────────────────────

export async function getStudentAssignmentsService(
  studentUserId: number,
): Promise<unknown[]> {
  return getStudentAssignments(studentUserId);
}
