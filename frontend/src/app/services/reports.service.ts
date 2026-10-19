import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private http: HttpClient) {}

  getNewRegistrations(startDate: string, endDate: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/reports/patients/registrations`, {
      params: { startDate, endDate },
    });
  }

  getDemographics(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/reports/patients/demographics`);
  }

  getAttendanceStats(startDate: string, endDate: string, clinicId?: number | null): Observable<any> {
    const params: Record<string, string> = { startDate, endDate };
    if (clinicId != null) params['clinicId'] = String(clinicId);
    return this.http.get(`${environment.apiUrl}/reports/appointments/attendance`, { params });
  }

  getClinicOccupancy(startDate: string, endDate: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}/reports/appointments/occupancy`, {
      params: { startDate, endDate },
    });
  }

  getClinics(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/reports/appointments/clinics`);
  }

  getLowStockItems(category?: string | null): Observable<any> {
    const params: Record<string, string> = {};
    if (category) params['category'] = category;
    return this.http.get(`${environment.apiUrl}/reports/inventory/low-stock`, { params });
  }

  getConsumptionReport(startDate: string, endDate: string, category?: string | null): Observable<any> {
    const params: Record<string, string> = { startDate, endDate };
    if (category) params['category'] = category;
    return this.http.get(`${environment.apiUrl}/reports/inventory/consumption`, { params });
  }

  getInventoryCategories(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/reports/inventory/categories`);
  }

  getStudentProcedureLog(supervisorId?: number | null): Observable<any> {
    const params: Record<string, string> = {};
    if (supervisorId != null) params['supervisorId'] = String(supervisorId);
    return this.http.get(`${environment.apiUrl}/reports/students/procedure-log`, { params });
  }

  getSupervisorEvaluationSummary(supervisorId?: number | null): Observable<any> {
    const params: Record<string, string> = {};
    if (supervisorId != null) params['supervisorId'] = String(supervisorId);
    return this.http.get(`${environment.apiUrl}/reports/students/evaluation-summary`, { params });
  }

  getSupervisors(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/reports/students/supervisors`);
  }
}
