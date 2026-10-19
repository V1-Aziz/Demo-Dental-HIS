import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, catchError, switchMap, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';

// Global 401 handler with refresh-token coordination. The scenario:
//   1. Access token expires (backend returns 401).
//   2. This interceptor calls POST /auth/refresh once, transparently
//      retries the original request, and future requests see the new token.
// When several requests 401 at the same time, only the FIRST triggers the
// refresh; the rest wait on a shared BehaviorSubject for the new token
// before retrying. That's what `isRefreshing` + `refreshToken$` coordinate.
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  // Starts as null ("no fresh token yet"); downstream waiters filter(null!=)
  // so they only resume once the refresh call has populated a new token.
  private refreshToken$ = new BehaviorSubject<string | null>(null);

  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        // Skip auth endpoints to avoid infinite loops (a failing /auth/refresh
        // must NOT itself try to refresh).
        if (err.status === 401 && !req.url.includes('/auth/')) {
          return this.handle401(req, next);
        }
        return throwError(() => err);
      })
    );
  }

  private handle401(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isRefreshing) {
      // First 401 in this cycle — kick off the refresh and mark the flag so
      // subsequent 401s from concurrent requests queue instead of double-refreshing.
      this.isRefreshing = true;
      this.refreshToken$.next(null);

      return this.auth.refreshToken().pipe(
        switchMap((res) => {
          this.isRefreshing = false;
          this.refreshToken$.next(res.data.accessToken);
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${res.data.accessToken}` },
          });
          return next.handle(retried);
        }),
        catchError((err) => {
          this.isRefreshing = false;
          this.auth.logout();
          return throwError(() => err);
        })
      );
    }

    // Queue concurrent requests until the refresh completes. `filter` drops
    // the initial null; `take(1)` unsubscribes after the first fresh token
    // arrives so this observable completes cleanly.
    return this.refreshToken$.pipe(
      filter((token) => token !== null),
      take(1),
      switchMap((token) => {
        const retried = req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });
        return next.handle(retried);
      })
    );
  }
}
