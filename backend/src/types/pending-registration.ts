export interface PendingRegistrationContact {
  contactType: 'Email' | 'Mobile' | 'Work phone' | 'Home phone';
  value: string;
  isPrimary: boolean;
}

export interface PendingRegistrationSubmit {
  firstName: string;
  middleName: string;
  lastName: string;
  civilId: string;
  requestedRoleId: number;
  password: string;
  contacts: PendingRegistrationContact[];
}

export interface PendingRegistration {
  registrationId: number;
  firstName: string;
  middleName: string;
  lastName: string;
  civilId: string;
  requestedRoleId: number;
  requestedRoleName: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  submittedAt: string;
  reviewedBy?: number;
  reviewedAt?: string;
  rejectionReason?: string;
  contacts: PendingRegistrationContact[];
}

export interface ApproveRegistrationBody {
  supervisingEmployeeId?: number;
  defaultClinicId?: number;
  hireDate?: string;
  academicLevel?: number;
}

export interface RejectRegistrationBody {
  reason: string;
}
