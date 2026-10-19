// Heartbeat service: keeps last_activity_at fresh while the tab is visible.
// Start on login, stop on logout.
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, timer } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class HeartbeatService {
  private readonly heartbeatUrl = `${environment.apiUrl}/auth/heartbeat`;
  private readonly logoutUrl    = `${environment.apiUrl}/auth/logout`;
  private sub?: Subscription;

  constructor(private http: HttpClient) {
    // Best-effort "I'm closing the tab" signal — revokes the session server-side.
    window.addEventListener('pagehide', () => this.sendBeaconLogout());
  }

  start(): void {
    this.stop();

    // Fire immediately on tab becoming visible again after hiding.
    const visibilityVisible$ = new Observable<void>(observer => {
      const handler = () => {
        if (document.visibilityState === 'visible') observer.next();
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    });

    visibilityVisible$.subscribe(() => {
      this.http.post(this.heartbeatUrl, {}).subscribe({ error: () => {} });
    });

    // Regular 60s interval, skipped when tab is hidden.
    this.sub = timer(0, 60_000)
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        switchMap(() => this.http.post(this.heartbeatUrl, {})),
      )
      .subscribe({ error: () => {} });
  }

  stop(): void {
    this.sub?.unsubscribe();
    this.sub = undefined;
  }

  private sendBeaconLogout(): void {
    const refreshToken = localStorage.getItem('his_refresh_token');
    if (!refreshToken) return;

    const body     = JSON.stringify({ refreshToken });
    const beaconOk = typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(
           this.logoutUrl,
           new Blob([body], { type: 'application/json' }),
         );

    if (!beaconOk) {
      // Fallback: keepalive fetch — best-effort, browser may cancel it.
      fetch(this.logoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }
}
