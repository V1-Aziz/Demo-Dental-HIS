// Service for treatment CRUD operations.
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TreatmentService {
  constructor(private http: HttpClient) {}

  submitTreatment(payload: {
    patientId:     number;
    appointmentId: number;
    treatmentType: string;
    treatmentNote: string;
    toothNumber?:  string;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/treatment/submit`, payload);
  }
}
