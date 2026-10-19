import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, defer, mergeMap, of, throwError, timer } from 'rxjs';
import { environment } from '../../environments/environment';
import { handleDemoRequest } from './demo-api';

// Small delay so loading states behave like they do against the real API.
const LATENCY_MS = 120;

// Registered last in app.module so it sits where the network would be: the
// auth header is already attached and the error interceptor still sees errors.
@Injectable()
export class DemoBackendInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!req.url.startsWith(environment.apiUrl)) return next.handle(req);

    return defer(() => {
      const res = handleDemoRequest(req.method, req.urlWithParams, req.body, req.headers.get('Authorization'));
      return timer(LATENCY_MS).pipe(
        mergeMap(() => {
          if (res.status >= 200 && res.status < 300) {
            const body = req.responseType === 'blob' && !(res.body instanceof Blob)
              ? new Blob([JSON.stringify(res.body)], { type: 'application/json' })
              : res.body;
            return of(new HttpResponse({ status: res.status, body, url: req.urlWithParams }));
          }
          return throwError(() => new HttpErrorResponse({
            status: res.status,
            statusText: res.status === 404 ? 'Not Found' : 'Error',
            error: res.body,
            url: req.urlWithParams,
          }));
        }),
      );
    });
  }
}
