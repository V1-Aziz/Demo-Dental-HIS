import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  constructor(private http: HttpClient) {}

  getAppointments(params: { date?: string; dateFrom?: string; dateTo?: string; status?: string; doctorId?: number; search?: string; limit?: number; page?: number } = {}): Observable<any> {
    const q: Record<string, string> = {};
    if (params.date)           q['date']     = params.date;
    if (params.dateFrom)       q['dateFrom'] = params.dateFrom;
    if (params.dateTo)         q['dateTo']   = params.dateTo;
    if (params.status)         q['status']   = params.status;
    if (params.doctorId)       q['doctorId'] = String(params.doctorId);
    if (params.search)         q['search']   = params.search;
    if (params.limit  != null) q['limit']    = String(params.limit);
    if (params.page   != null) q['page']     = String(params.page);
    return this.http.get(`${environment.apiUrl}/appointments`, { params: q });
  }

  getTodayAppointments(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/appointments/today`);
  }

  getAppointmentTypes(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/appointments/types`);
  }

  getDoctors(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/appointments/doctors`);
  }

  getStudents(supervisorId?: number): Observable<any> {
    const params: Record<string, string> = {};
    if (supervisorId) params['supervisor_id'] = String(supervisorId);
    return this.http.get(`${environment.apiUrl}/appointments/students`, { params });
  }

  getAvailableDays(doctorId: number, year: number, month: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/appointments/available-days`, {
      params: { doctor_id: String(doctorId), year: String(year), month: String(month) },
    });
  }

  getAvailableSlots(doctorId: number, date: string, typeId: number, studentId?: number): Observable<any> {
    const params: Record<string, string> = { doctor_id: String(doctorId), date, type_id: String(typeId) };
    if (studentId) params['student_id'] = String(studentId);
    return this.http.get(`${environment.apiUrl}/appointments/available-slots`, { params });
  }

  bookAppointment(payload: {
    patientId: number;
    doctorId: number;
    appointmentTypeId: number;
    appointmentStartTime: string;
    academicId?: number | null;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/appointments`, payload);
  }

  createAppointment(payload: {
    patientId: number;
    doctorId: number;
    appointmentTypeId: number;
    appointmentStartTime: string;
    appointmentEndTime: string;
    clinicId?: number;
  }): Observable<any> {
    return this.http.post(`${environment.apiUrl}/appointments`, payload);
  }

  updateAppointment(id: number, payload: {
    doctorId: number;
    appointmentTypeId: number;
    appointmentStartTime: string;
    appointmentEndTime: string;
    clinicId?: number;
  }): Observable<any> {
    return this.http.put(`${environment.apiUrl}/appointments/${id}`, payload);
  }

  updateStatus(id: number, status: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/appointments/${id}/status`, { status });
  }

  markArrival(id: number, status: 'On Time' | 'Late' | 'No Show'): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/appointments/${id}/arrival`, { arrival_status: status });
  }

  clearArrival(id: number): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/appointments/${id}/arrival`);
  }
}
