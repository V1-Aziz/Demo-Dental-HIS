import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RecordService {
  constructor(private http: HttpClient) {}

  getPatientRecord(patientId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/records/patient/${patientId}`);
  }

  updateRecord(recordId: number, payload: { chiefComplaint: string; chronicDiseases: string }): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/records/${recordId}`, payload);
  }

  addDiagnosis(recordId: number, payload: {
    diagnosisType:        string;
    clinicalFindings:     string;
    radiographicFindings: string;
    progressNote:         string;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/records/${recordId}/diagnoses`, payload);
  }

  addTreatment(recordId: number, payload: {
    treatmentType: string;
    treatmentNote: string;
    medicineName:  string;
    dosage:        string;
    duration:      string;
    cost:          number;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/records/${recordId}/treatments`, payload);
  }

  addProcedureNote(recordId: number, payload: {
    diagnosisType:        string;
    clinicalFindings:     string;
    radiographicFindings: string;
    progressNote:         string;
    supervisorEmployeeId: number;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/records/${recordId}/procedure-notes`, payload);
  }
}
