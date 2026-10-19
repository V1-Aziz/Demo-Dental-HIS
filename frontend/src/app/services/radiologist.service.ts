import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RadiologistDashboardSummary,
  RadiologistPatientRow,
  RadiologistAppointmentDto,
} from '../shared/types/screening.types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class RadiologistService {
  private readonly base = `${environment.apiUrl}/radiologist`;

  constructor(private http: HttpClient) {}

  getDashboard(): Observable<RadiologistDashboardSummary> {
    return this.http
      .get<ApiResponse<RadiologistDashboardSummary>>(`${this.base}/dashboard`)
      .pipe(map(r => r.data!));
  }

  listPatients(): Observable<RadiologistPatientRow[]> {
    return this.http
      .get<ApiResponse<RadiologistPatientRow[]>>(`${this.base}/patients`)
      .pipe(map(r => r.data ?? []));
  }

  getPatient(patientId: number): Observable<RadiologistPatientRow> {
    return this.http
      .get<ApiResponse<RadiologistPatientRow>>(`${this.base}/patients/${patientId}`)
      .pipe(map(r => r.data!));
  }

  getTodaysAppointments(patientId: number): Observable<RadiologistAppointmentDto[]> {
    return this.http
      .get<ApiResponse<RadiologistAppointmentDto[]>>(
        `${this.base}/patients/${patientId}/appointments-today`,
      )
      .pipe(map(r => r.data ?? []));
  }
}
