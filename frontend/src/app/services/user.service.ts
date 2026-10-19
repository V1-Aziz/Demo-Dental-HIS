import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  constructor(private http: HttpClient) {}

  getUsers(params?: { search?: string; page?: number; limit?: number }): Observable<any> {
    const q: Record<string, string> = {};
    if (params?.search?.trim()) q['search'] = params.search.trim();
    if (params?.page)           q['page']   = String(params.page);
    if (params?.limit)          q['limit']  = String(params.limit);
    return this.http.get(`${environment.apiUrl}/users`, { params: q });
  }

  getRoles(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/users/roles`);
  }

  updateUser(userId: number, roleId: number, accountStatus: string): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/users/${userId}`, { roleId, accountStatus });
  }

  getUserContacts(userId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/users/${userId}/contacts`);
  }

  updateUserFull(userId: number, payload: {
    account?: { email?: string; role_id?: number; account_status?: string };
    contacts?: {
      upsert: Array<{ contact_id?: number; contact_type: string; email: string; phone_number: string }>;
      delete: number[];
    };
  }): Observable<any> {
    return this.http.patch(`${environment.apiUrl}/users/${userId}`, payload);
  }
}
