import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LookupCategory {
  categoryKey: string;
  displayName: string;
  description: string;
  source: string;
  readOnly: boolean;
  count: number;
}

export interface LookupValue {
  lookupId: number;
  categoryKey: string;
  valueLabel: string;
  displayOrder: number;
  isActive: boolean;
  duration?: number;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class SystemLookupService {
  private readonly base = `${environment.apiUrl}/admin/system-settings`;

  constructor(private http: HttpClient) {}

  getCategories(): Observable<{ success: boolean; data: LookupCategory[] }> {
    return this.http.get<any>(`${this.base}/lookups/categories`);
  }

  getValues(categoryKey: string): Observable<{ success: boolean; data: { values: LookupValue[]; extraFields?: string[] } }> {
    return this.http.get<any>(`${this.base}/lookups/${categoryKey}`);
  }

  addValue(categoryKey: string, payload: { valueLabel: string; displayOrder?: number }): Observable<any> {
    return this.http.post<any>(`${this.base}/lookups/${categoryKey}`, payload);
  }

  updateValue(categoryKey: string, valueId: number, payload: Partial<LookupValue & { duration?: number; description?: string }>): Observable<any> {
    return this.http.patch<any>(`${this.base}/lookups/${categoryKey}/${valueId}`, payload);
  }

  deleteValue(categoryKey: string, valueId: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/lookups/${categoryKey}/${valueId}`);
  }

  reorderValues(categoryKey: string, orderedIds: number[]): Observable<any> {
    return this.http.put<any>(`${this.base}/lookups/${categoryKey}/order`, { orderedIds });
  }
}
