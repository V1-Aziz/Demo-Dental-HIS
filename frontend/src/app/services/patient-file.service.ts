import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PatientFileService {
  private base = `${environment.apiUrl}/patients`;

  constructor(private http: HttpClient) {}

  getVisitTimeline(patientId: number): Observable<any> {
    return this.http.get(`${this.base}/${patientId}/visits`);
  }

  getVisitContent(patientId: number, appointmentId: number): Observable<any> {
    return this.http.get(`${this.base}/${patientId}/visits/${appointmentId}/content`);
  }

  getTodaysAppointments(patientId: number): Observable<any> {
    return this.http.get(`${this.base}/${patientId}/visits/today`);
  }

  getToothHistory(patientId: number, toothNumber: string): Observable<any> {
    return this.http.get(`${this.base}/${patientId}/teeth/${toothNumber}/history`);
  }

  getLabRequestDetail(patientId: number, labRequestId: number): Observable<any> {
    return this.http.get(`${this.base}/${patientId}/lab-requests/${labRequestId}`);
  }
}
