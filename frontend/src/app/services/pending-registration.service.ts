import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PendingRegistrationItem {
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
  contacts: { contactType: string; value: string; isPrimary: boolean }[];
}

export interface ApprovePayload {
  supervisingEmployeeId?: number;
  defaultClinicId?: number;
  hireDate?: string;
  academicLevel?: number;
}

@Injectable({ providedIn: 'root' })
export class PendingRegistrationService {
  private readonly base = `${environment.apiUrl}/admin/system-settings`;

  constructor(private http: HttpClient) {}

  list(opts: { status?: string; q?: string; limit?: number; offset?: number } = {}): Observable<any> {
    let params = new HttpParams();
    if (opts.status) params = params.set('status', opts.status);
    if (opts.q)      params = params.set('q', opts.q);
    if (opts.limit)  params = params.set('limit',  String(opts.limit));
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<any>(`${this.base}/registrations`, { params });
  }

  getById(id: number): Observable<any> {
    return this.http.get<any>(`${this.base}/registrations/${id}`);
  }

  approve(id: number, payload: ApprovePayload = {}): Observable<any> {
    return this.http.post<any>(`${this.base}/registrations/${id}/approve`, payload);
  }

  reject(id: number, reason: string): Observable<any> {
    return this.http.post<any>(`${this.base}/registrations/${id}/reject`, { reason });
  }

  getPendingCount(): Observable<{ success: boolean; data: { count: number } }> {
    return this.http.get<{ success: boolean; data: { count: number } }>(
      `${this.base}/registrations/count`,
    );
  }
}
