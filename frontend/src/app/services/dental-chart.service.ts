import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DentalChartService {
  private base       = `${environment.apiUrl}/dental-chart`;
  private accessBase = `${environment.apiUrl}/academic`;

  constructor(private http: HttpClient) {}

  getByRecord(recordId: number): Observable<any> {
    return this.http.get(`${this.base}/record/${recordId}`);
  }

  addNote(payload: {
    recordId:      number;
    toothNumber:   string;
    toothNote:     string;
    appointmentId?: number;
  }): Observable<any> {
    return this.http.post(this.base, payload);
  }

  deleteNote(noteId: number): Observable<any> {
    return this.http.delete(`${this.base}/${noteId}`);
  }

  // ─── Student temporal access ──────────────────────────────────────────────

  getFileAccess(patientId: string): Observable<any> {
    return this.http
      .get(`${this.accessBase}/file-access/${patientId}`)
      .pipe(catchError(err => throwError(() => err)));
  }

  createAssignment(patientId: string): Observable<any> {
    return this.http
      .post(`${this.accessBase}/assignments`, { patientId })
      .pipe(catchError(err => throwError(() => err)));
  }

  getMyAssignments(): Observable<any> {
    return this.http
      .get(`${this.accessBase}/assignments`)
      .pipe(catchError(err => throwError(() => err)));
  }
}
