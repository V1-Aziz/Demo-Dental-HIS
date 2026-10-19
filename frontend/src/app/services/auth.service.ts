import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { HeartbeatService } from '../core/services/heartbeat.service';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthUser {
  id: number;
  name: string;
  role: string;
}

export interface LoginResponse {
  success: boolean;
  data: {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  };
}

// Role → landing page mapping used after login and by RoleGuard when a user
// hits a page they aren't allowed to see. Keys MUST match the Role enum
// values the backend embeds in JWTs (see backend/src/enums/roles.enum.ts).
const ROLE_ROUTE_MAP: Record<string, string> = {
  Admin: '/admin',
  Doctor: '/doctor',
  Student: '/student',
  Receptionist: '/receptionist',
  LabTechnician: '/lab-specialist',
  DentalAssistant: '/assistant',
  InventoryManager: '/inventory-manager',
  Radiologist: '/radiologist',
};

// Prefixed localStorage keys so we don't collide with other apps on the
// same origin. Keep in sync with any logout / clear flows you add.
const TOKEN_KEY = 'his_access_token';
const REFRESH_KEY = 'his_refresh_token';
const USER_KEY = 'his_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private http: HttpClient,
    private router: Router,
    private heartbeat: HeartbeatService,
  ) {}

  login(payload: LoginPayload): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, payload)
      .pipe(
        tap((res) => {
          if (res.success) {
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
            localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
            this.heartbeat.start();
          }
        })
      );
  }

  logout(): void {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      // Best-effort server-side revocation — don't block the client on it.
      this.http
        .post(`${environment.apiUrl}/auth/logout`, { refreshToken })
        .subscribe({ error: () => {} });
    }
    this.heartbeat.stop();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  getRole(): string | null {
    return this.getUser()?.role ?? null;
  }

  // Cheap, client-side "is my token still valid" check. Does NOT prove the
  // token is cryptographically good — the server still validates signature
  // on every call — it just avoids sending requests we already know will
  // 401. The real refresh flow lives in ErrorInterceptor.
  isLoggedIn(): boolean {
    const token = this.getToken();
    return !!token && !this.isTokenExpired(token);
  }

  refreshToken(): Observable<{ success: boolean; data: { accessToken: string; refreshToken: string } }> {
    return this.http
      .post<{ success: boolean; data: { accessToken: string; refreshToken: string } }>(
        `${environment.apiUrl}/auth/refresh`,
        { refreshToken: this.getRefreshToken() }
      )
      .pipe(
        tap((res) => {
          if (res.success) {
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            // The backend rotates the refresh token on every use — the old hash is
            // invalidated in the DB. Store the new token so the next refresh works.
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
          }
        })
      );
  }

  // Resolves where a logged-in user should land based on role. Falls back to
  // /login if role is missing OR unmapped — safer than picking a random
  // portal the user might not have permission for.
  getPortalRoute(): string {
    return ROLE_ROUTE_MAP[this.getRole() ?? ''] ?? '/login';
  }

  // A JWT is `header.payload.signature` separated by dots — split, take the
  // middle segment, base64-decode it, parse as JSON. `exp` is in SECONDS
  // (JWT spec) but Date.now() is in milliseconds, hence the *1000.
  // Any parse failure (malformed token) treats the token as expired so
  // the user gets bounced to login instead of silently breaking.
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch {
      return true;
    }
  }
}
