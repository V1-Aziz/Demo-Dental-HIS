// Service for admin stats endpoints — active user count with polling support.
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { timer } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActiveUsersStats {
  count: number;
  asOf: string;
  windowMinutes: number;
}

@Injectable({ providedIn: 'root' })
export class AdminStatsService {
  private readonly baseUrl = `${environment.apiUrl}/admin/stats`;

  constructor(private http: HttpClient) {}

  getActiveUsers(): Observable<{ success: boolean; data: ActiveUsersStats }> {
    return this.http.get<{ success: boolean; data: ActiveUsersStats }>(
      `${this.baseUrl}/active-users`,
    );
  }

  // Emits immediately, then every intervalMs milliseconds.
  // Caller must unsubscribe (e.g. via takeUntilDestroyed or ngOnDestroy).
  streamActiveUsers(
    intervalMs = 15_000,
  ): Observable<{ success: boolean; data: ActiveUsersStats }> {
    return timer(0, intervalMs).pipe(
      switchMap(() => this.getActiveUsers()),
    );
  }
}
