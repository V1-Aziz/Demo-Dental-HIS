import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}

  getReceptionistStats(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/dashboard/receptionist`);
  }

  getInventoryStats(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/dashboard/inventory`);
  }

  getAdminStats(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/dashboard/admin`);
  }

  getSystemPerformance(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/dashboard/system-performance`);
  }
}
