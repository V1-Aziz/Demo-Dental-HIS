// Angular service for the notifications system. Polls the unread-count endpoint
// every 60 seconds while the user is authenticated. Read state is now persisted
// to the database via the backend API, not localStorage.
import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AppNotification {
  notification_id: number;
  type:            string;
  title:           string;
  message:         string;
  link_to:         string | null;
  related_entity_type: string | null;
  related_entity_id:   number | null;
  is_read:         boolean;
  read_at:         string | null;
  created_at:      string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private base = `${environment.apiUrl}/notifications`;

  private _unreadCount$ = new BehaviorSubject<number>(0);
  readonly unreadCount$ = this._unreadCount$.asObservable();

  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private http: HttpClient) {}

  startPolling(): void {
    if (this.pollTimer) return;
    this.refreshUnreadCount();
    this.pollTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        this.refreshUnreadCount();
      }
    }, 60_000);
  }

  stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private refreshUnreadCount(): void {
    this.http.get<{ success: boolean; data: { count: number } }>(
      `${this.base}/unread-count`,
    ).subscribe({
      next:  res => this._unreadCount$.next(res.data?.count ?? 0),
      error: () => {},
    });
  }

  getNotifications(opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {}): Observable<any> {
    const params: Record<string, string> = {};
    if (opts.limit      != null) params['limit']    = String(opts.limit);
    if (opts.offset     != null) params['offset']   = String(opts.offset);
    if (opts.unreadOnly)         params['unread']   = 'true';
    return this.http.get(this.base, { params });
  }

  markRead(notificationId: number): Observable<any> {
    const obs = this.http.patch(`${this.base}/${notificationId}/read`, {});
    obs.subscribe({ next: () => this.refreshUnreadCount(), error: () => {} });
    return obs;
  }

  markAllRead(): Observable<any> {
    const obs = this.http.patch(`${this.base}/mark-all-read`, {});
    obs.subscribe({ next: () => this._unreadCount$.next(0), error: () => {} });
    return obs;
  }

  // ── Client-side dismiss (localStorage only, no DB delete) ────────────────
  private static readonly DISMISS_KEY = 'notif_dismissed_ids';

  getDismissedIds(): Set<number> {
    try {
      return new Set<number>(JSON.parse(localStorage.getItem(NotificationService.DISMISS_KEY) ?? '[]'));
    } catch {
      return new Set<number>();
    }
  }

  dismissLocally(id: number): void {
    const ids = this.getDismissedIds();
    ids.add(id);
    localStorage.setItem(NotificationService.DISMISS_KEY, JSON.stringify([...ids]));
  }
}
