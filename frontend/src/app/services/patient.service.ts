import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PatientService {
  constructor(private http: HttpClient) {}

  getPatients(params?: { search?: string; page?: number; limit?: number }): Observable<any> {
    const q: Record<string, string> = {};
    if (params?.search?.trim()) q['search'] = params.search.trim();
    if (params?.page)           q['page']   = String(params.page);
    if (params?.limit)          q['limit']  = String(params.limit);
    return this.http.get(`${environment.apiUrl}/patients`, { params: q });
  }

  getMyPatients(params?: { search?: string; page?: number; limit?: number }): Observable<any> {
    const q: Record<string, string> = {};
    if (params?.search?.trim()) q['search'] = params.search.trim();
    if (params?.page)           q['page']   = String(params.page);
    if (params?.limit)          q['limit']  = String(params.limit);
    return this.http.get(`${environment.apiUrl}/patients/my`, { params: q });
  }

  searchPatients(q: string): Observable<any> {
    const params: Record<string, string> = {};
    if (q.trim()) params['q'] = q.trim();
    return this.http.get(`${environment.apiUrl}/patients/search`, { params });
  }

  getPatientById(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/patients/${id}`);
  }

  updatePatientPhone(id: number, phoneNumber: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/patients/${id}/phone`, { phoneNumber });
  }

  createPatient(payload: {
    fileNumber: number;
    nationalId: number;
    firstName: string;
    middleName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    phoneNumber?: string;
    email?: string;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/patients`, payload);
  }
}
