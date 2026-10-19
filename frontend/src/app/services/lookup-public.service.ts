import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LookupPublicService {
  private readonly base = environment.apiUrl;
  private cache = new Map<string, Observable<string[]>>();

  constructor(private http: HttpClient) {}

  // Returns active value labels for a System_Lookups category.
  // Result is cached for the lifetime of the service (page session).
  getLabels(categoryKey: string): Observable<string[]> {
    if (!this.cache.has(categoryKey)) {
      const req$ = this.http
        .get<{ success: boolean; data: { valueLabel: string }[] }>(
          `${this.base}/lookups/public/${categoryKey}`,
        )
        .pipe(
          map(res => (res.data ?? []).map(v => v.valueLabel)),
          catchError(() => of([])),
          shareReplay(1),
        );
      this.cache.set(categoryKey, req$);
    }
    return this.cache.get(categoryKey)!;
  }

  // Bust the cache for a category (e.g. after an admin edit).
  bust(categoryKey: string): void {
    this.cache.delete(categoryKey);
  }
}
