import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditService {
  constructor(private http: HttpClient) {}

  getLogs(params: {
    search?: string;
    role?: string;
    action?: string;
    date?: string;
    page?: number;
    limit?: number;
  } = {}): Observable<any> {
    const queryParams: Record<string, string> = {};
    if (params.search)  queryParams['search'] = params.search;
    if (params.role)    queryParams['role']   = params.role;
    if (params.action)  queryParams['action'] = params.action;
    if (params.date)    queryParams['date']   = params.date;
    if (params.page)    queryParams['page']   = String(params.page);
    if (params.limit)   queryParams['limit']  = String(params.limit);
    return this.http.get(`${environment.apiUrl}/audit`, { params: queryParams });
  }
}
