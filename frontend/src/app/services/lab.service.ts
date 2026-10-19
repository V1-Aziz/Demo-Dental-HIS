import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LabService {
  constructor(private http: HttpClient) {}

  getLabRequests(params?: {
    patientId?: number;
    status?:    string;
    queue?:     string;
    search?:    string;
    page?:      number;
    limit?:     number;
  }): Observable<any> {
    const q: Record<string, string> = {};
    if (params?.patientId) q['patientId'] = String(params.patientId);
    if (params?.status)    q['status']    = params.status;
    if (params?.queue)     q['queue']     = params.queue;
    if (params?.search)    q['search']    = params.search;
    if (params?.page)      q['page']      = String(params.page);
    if (params?.limit)     q['limit']     = String(params.limit);
    return this.http.get(`${environment.apiUrl}/lab`, { params: q });
  }

  getLabRequestById(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/lab/${id}`);
  }

  createLabRequest(payload: {
    patientId:             number;
    requestNote:           string;
    toothNumber?:          string | null;
    supervisorEmployeeId?: number;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/lab`, payload);
  }

  reviewLabRequest(id: number, payload: {
    status:              'Approved' | 'Rejected';
    supervisorFeedback?: string;
  }): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/lab/${id}/review`, payload);
  }

  updateStatus(id: number, status: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/lab/${id}/status`, { status });
  }

  claimRequest(id: number): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/lab/${id}/claim`, {});
  }

  submitResponse(id: number, responseNote: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/lab/${id}/response`, { responseNote });
  }
}
