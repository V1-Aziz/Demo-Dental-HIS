import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TicketService {
  constructor(private http: HttpClient) {}

  getTicketTypes(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/tickets/types`);
  }

  createTicket(ticketTypeId: number, details: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/tickets`, { ticketTypeId, details });
  }

  getMyTickets(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/tickets`);
  }

  getAllTickets(params?: { page?: number; limit?: number; search?: string; statusFilter?: string; subjectFilter?: string }): Observable<any> {
    const q: Record<string, string> = {};
    if (params?.page)                                               q['page']          = String(params.page);
    if (params?.limit)                                              q['limit']         = String(params.limit);
    if (params?.search?.trim())                                     q['search']        = params.search.trim();
    if (params?.statusFilter  && params.statusFilter  !== 'All')    q['statusFilter']  = params.statusFilter;
    if (params?.subjectFilter && params.subjectFilter !== 'All')    q['subjectFilter'] = params.subjectFilter;
    const qs = new URLSearchParams(q).toString();
    return this.http.get(`${environment.apiUrl}/tickets${qs ? '?' + qs : ''}`);
  }

  getTicketDetail(id: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/tickets/${id}`);
  }

  replyToTicket(id: number, messageText: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/tickets/${id}/reply`, { messageText });
  }

  resolveTicket(id: number, note?: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/tickets/${id}/resolve`, { note });
  }
}
