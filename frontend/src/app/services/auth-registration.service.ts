import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RegisterPayload {
  firstName: string;
  middleName: string;
  lastName: string;
  civilId: string;
  requestedRoleId: number;
  password: string;
  contacts: { contactType: string; value: string; isPrimary: boolean }[];
}

export interface RoleOption {
  role_id: number;
  role_name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthRegistrationService {
  private readonly base = environment.apiUrl;
  private rolesCache$: Observable<{ success: boolean; data: RoleOption[] }> | null = null;

  constructor(private http: HttpClient) {}

  register(payload: RegisterPayload): Observable<{ success: boolean; data: { registrationId: number } }> {
    return this.http.post<{ success: boolean; data: { registrationId: number } }>(
      `${this.base}/auth/register`,
      payload,
    );
  }

  getRegisterableRoles(): Observable<{ success: boolean; data: RoleOption[] }> {
    if (!this.rolesCache$) {
      this.rolesCache$ = this.http
        .get<{ success: boolean; data: RoleOption[] }>(`${this.base}/auth/registerable-roles`)
        .pipe(shareReplay(1));
    }
    return this.rolesCache$;
  }

  getContactTypes(): Observable<{ success: boolean; data: { valueLabel: string }[] }> {
    return this.http.get<{ success: boolean; data: { valueLabel: string }[] }>(
      `${this.base}/lookups/public/contact_type`,
    );
  }
}
