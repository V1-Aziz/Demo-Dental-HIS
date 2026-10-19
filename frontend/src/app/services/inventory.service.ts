// Inventory Angular service — thin HTTP client for the /inventory/* endpoints.
// All business logic and shared state live in InventoryDataService.
// This file only handles HTTP transport.
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ItemBatch, LatestActivityRow, RemovedInventoryItem } from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getItems(params?: { search?: string; page?: number; limit?: number }): Observable<unknown> {
    const q: Record<string, string> = {};
    if (params?.search?.trim()) q['search'] = params.search.trim();
    if (params?.page)           q['page']   = String(params.page);
    if (params?.limit)          q['limit']  = String(params.limit);
    return this.http.get(`${this.base}/inventory/items`, { params: q });
  }

  getTransactions(params?: { page?: number; limit?: number }): Observable<unknown> {
    const q: Record<string, string> = {};
    if (params?.page)  q['page']  = String(params.page);
    if (params?.limit) q['limit'] = String(params.limit);
    return this.http.get(`${this.base}/inventory/transactions`, { params: q });
  }

  // ─── Per-item deposit / withdraw ───────────────────────────────────────────

  depositItem(itemId: number, body: {
    quantity:     number;
    expire_date?: string | null;
    notes?:       string | null;
  }): Observable<unknown> {
    return this.http.post(`${this.base}/inventory/items/${itemId}/deposit`, body);
  }

  withdrawItem(itemId: number, body: {
    quantity: number;
    notes?:   string | null;
  }): Observable<unknown> {
    return this.http.post(`${this.base}/inventory/items/${itemId}/withdraw`, body);
  }

  getItemBatches(itemId: number): Observable<ItemBatch[]> {
    return this.http.get<{ data: ItemBatch[] }>(`${this.base}/inventory/items/${itemId}/batches`)
      .pipe(map(res => res.data ?? []));
  }

  // ─── Item CRUD ──────────────────────────────────────────────────────────────

  registerItem(data: {
    itemName:      string;
    category:      string;
    supplier?:     string | null;
    unitCost?:     number | null;
    lowStockLimit: number;
  }): Observable<unknown> {
    return this.http.post(`${this.base}/inventory/items`, data);
  }

  deleteItem(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/inventory/items/${id}`);
  }

  updateItem(id: string, data: {
    itemName:      string;
    category:      string;
    lowStockLimit: number;
    supplier?:     string | null;
    unitCost?:     number | null;
    // expireDate removed — expiry is now managed per batch
  }): Observable<unknown> {
    return this.http.patch(`${this.base}/inventory/items/${id}`, data);
  }

  // ─── Inventory Requests ─────────────────────────────────────────────────────

  getRequests(params?: { search?: string; page?: number; limit?: number }): Observable<unknown> {
    const q: Record<string, string> = {};
    if (params?.search?.trim()) q['search'] = params.search.trim();
    if (params?.page)           q['page']   = String(params.page);
    if (params?.limit)          q['limit']  = String(params.limit);
    return this.http.get(`${this.base}/inventory/requests`, { params: q });
  }

  getMyRequests(): Observable<unknown> {
    return this.http.get(`${this.base}/inventory/requests/my`);
  }

  createRequest(data: { item_id: number; quantity: number; notes?: string }): Observable<unknown> {
    return this.http.post(`${this.base}/inventory/requests`, data);
  }

  approveRequest(id: string, approvedQuantity: number): Observable<unknown> {
    return this.http.patch(`${this.base}/inventory/requests/${id}`, {
      status: 'Approved',
      approvedQuantity,
    });
  }

  rejectRequest(id: string, feedback: string): Observable<unknown> {
    return this.http.patch(`${this.base}/inventory/requests/${id}`, { status: 'Rejected', feedback });
  }

  // ─── Activity history ───────────────────────────────────────────────────────

  getActivityHistory(params?: { page?: number; limit?: number }): Observable<unknown> {
    const q: Record<string, string> = {};
    if (params?.page)  q['page']  = String(params.page);
    if (params?.limit) q['limit'] = String(params.limit);
    return this.http.get(`${this.base}/inventory/activity-history`, { params: q });
  }

  // ─── Removed items ──────────────────────────────────────────────────────────

  getRemovedItems(): Observable<RemovedInventoryItem[]> {
    return this.http.get<RemovedInventoryItem[]>(`${this.base}/inventory/removed-items`);
  }

  // ─── Latest combined activity feed ─────────────────────────────────────────

  getLatestActivity(limit = 5): Observable<LatestActivityRow[]> {
    return this.http
      .get<{ data: LatestActivityRow[] }>(
        `${this.base}/inventory/latest-activity`,
        { params: { limit: String(limit) } },
      )
      .pipe(map(res => res.data ?? []));
  }

  // ─── Employees ─────────────────────────────────────────────────────────────

  getEmployees(search: string): Observable<unknown> {
    return this.http.get(`${this.base}/users/employees`, {
      params: search.trim() ? { search: search.trim() } : {},
    });
  }
}
