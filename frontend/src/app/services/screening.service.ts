import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Screening,
  ScreeningUploadMeta,
} from '../shared/types/screening.types';

// API envelope used by every backend controller.  Tight type here so callers
// get `data` narrowed without a cast.
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface TodaysAppointmentDto {
  appointment_id:   number;
  appointment_time: string;   // HH:MM
  doctor_name:      string;
  clinic_name:      string;
  status:           string;
}

@Injectable({ providedIn: 'root' })
export class ScreeningService {
  private readonly base = `${environment.apiUrl}/screening`;

  constructor(private http: HttpClient) {}

  listByRecord(recordId: number): Observable<Screening[]> {
    return this.http
      .get<ApiResponse<Screening[]>>(`${this.base}/record/${recordId}`)
      .pipe(map(r => r.data ?? []));
  }

  // DA-only probe: returns today's appointment the upload would attach to, or
  // null.  Mirrors the backend upload guard exactly.
  getTodaysAppointment(patientId: number): Observable<TodaysAppointmentDto | null> {
    return this.http
      .get<ApiResponse<TodaysAppointmentDto | null>>(`${this.base}/patient/${patientId}/todays-appointment`)
      .pipe(map(r => r.data ?? null));
  }

  // DA-only: full list of today's eligible appointments — drives the modal's
  // appointment dropdown when the patient has more than one visit scheduled.
  getTodaysAppointments(patientId: number): Observable<TodaysAppointmentDto[]> {
    return this.http
      .get<ApiResponse<TodaysAppointmentDto[]>>(`${this.base}/patient/${patientId}/todays-appointments`)
      .pipe(map(r => r.data ?? []));
  }

  // `files[i]` is paired with `metas[i]` server-side, so order must match.
  // `appointmentId` (optional) targets a specific today's appointment when the
  // patient has multiple; omit to let the backend auto-select.
  upload(
    patientId: number,
    files: File[],
    metas: ScreeningUploadMeta[],
    appointmentId?: number,
  ): Observable<Screening[]> {
    const form = new FormData();
    for (const f of files) form.append('images', f);
    form.append('meta', JSON.stringify(metas));
    if (appointmentId != null) form.append('appointment_id', String(appointmentId));
    return this.http
      .post<ApiResponse<Screening[]>>(`${this.base}/patient/${patientId}`, form)
      .pipe(map(r => r.data ?? []));
  }

  delete(imageId: number): Observable<void> {
    return this.http
      .delete<ApiResponse<null>>(`${this.base}/${imageId}`)
      .pipe(map(() => undefined));
  }

  // `<img [src]>` cannot carry an Authorization header, so fetch the file as
  // a blob (the auth interceptor handles the JWT) and hand back an object URL.
  // Callers are responsible for revoking the URL when done.
  fetchAsObjectUrl(imageId: number): Observable<string> {
    return this.http
      .get(`${this.base}/file/${imageId}`, { responseType: 'blob' })
      .pipe(map(blob => URL.createObjectURL(blob)));
  }
}
