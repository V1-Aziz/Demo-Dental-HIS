import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DiagnosisService {
  constructor(private http: HttpClient) {}

  getStudentSubmissions(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/diagnosis/student-submissions`);
  }

  getMyNotes(params?: { patientId?: number; page?: number; limit?: number }): Observable<any> {
    const q: Record<string, string> = {};
    if (params?.patientId) q['patientId'] = String(params.patientId);
    if (params?.page)      q['page']      = String(params.page);
    if (params?.limit)     q['limit']     = String(params.limit);
    return this.http.get(`${environment.apiUrl}/diagnosis/my-notes`, { params: q });
  }

  submitDiagnosis(payload: {
    patientId:            number;
    appointmentId?:       number;
    diagnosisType:        string;
    toothNumber?:         string;
    clinicalFindings:     string;
    radiographicFindings: string;
    progressNote:         string;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/diagnosis/submit`, payload);
  }

  reviewDiagnosis(id: number, status: 'Approved' | 'Rejected', feedback: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/diagnosis/${id}/review`, { status, feedback });
  }
}
