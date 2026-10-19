import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ScreeningRequest } from '../shared/types/screening.types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface CreateScreeningRequestPayload {
  record_id:      number;
  patient_id:     number;
  appointment_id?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ScreeningRequestsService {
  private readonly base = `${environment.apiUrl}/screening-requests`;

  constructor(private http: HttpClient) {}

  create(payload: CreateScreeningRequestPayload): Observable<{ request_id: number }> {
    return this.http
      .post<ApiResponse<{ request_id: number }>>(this.base, payload)
      .pipe(map(r => r.data!));
  }

  cancel(requestId: number): Observable<void> {
    return this.http
      .patch<ApiResponse<null>>(`${this.base}/${requestId}/cancel`, {})
      .pipe(map(() => undefined));
  }

  listMine(limit = 20, offset = 0): Observable<ScreeningRequest[]> {
    return this.http
      .get<ApiResponse<ScreeningRequest[]>>(
        `${this.base}/mine?limit=${limit}&offset=${offset}`,
      )
      .pipe(map(r => r.data ?? []));
  }

  listByRecord(recordId: number): Observable<ScreeningRequest[]> {
    return this.http
      .get<ApiResponse<ScreeningRequest[]>>(`${this.base}/record/${recordId}`)
      .pipe(map(r => r.data ?? []));
  }
}
