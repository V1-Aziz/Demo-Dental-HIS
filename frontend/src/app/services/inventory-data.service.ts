// Shared data service for the Inventory Management feature.
//
// This service is the single source of truth for both the Inventory page
// and the Item Request page.  Both components subscribe to its observables
// and call its methods — they never manage their own data arrays.
//
// Inventory items are fetched from the real API.  Item requests are also
// fetched from the real API; approval and rejection call the real API and
// then reload the list for authoritative state.

import { Injectable }                 from '@angular/core';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, map, of, tap } from 'rxjs';
import { ActionType, HistoryRecord, InventoryItem, ItemRequest, ItemStatus, RequestStatus } from '../models/inventory.models';
import { InventoryService }           from './inventory.service';
import { timeUntilExpiry }            from '../utils/time.util';

// Maps a raw API row to the canonical InventoryItem interface.
// Expiry data comes from soonest_expire_date (soonest active batch expiry)
// and stock from quantity_on_hand (SUM of batch remainders).
function mapApiItem(r: any): InventoryItem {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = r.soonest_expire_date ? new Date(r.soonest_expire_date) : null;
  let status: ItemStatus = 'In Stock';
  if (expiry && expiry < today)                     status = 'Expired';
  else if (r.quantity_on_hand === 0)                status = 'Out of Stock';
  else if (r.quantity_on_hand <= r.low_stock_limit) status = 'Low Stock';
  return {
    id:               r.item_id,
    name:             r.item_name           ?? '—',
    category:         r.category            ?? '—',
    quantityInStock:  r.quantity_on_hand    ?? 0,
    lowStockLimit:    r.low_stock_limit     ?? 0,
    expiryDate:       timeUntilExpiry(r.soonest_expire_date),
    expiryDateRaw:    r.soonest_expire_date ? new Date(r.soonest_expire_date).toISOString() : '—',
    registerDate:     r.register_date ? new Date(r.register_date).toLocaleDateString() : '—',
    assignedBy:       r.assigned_by_email   ?? '—',
    status,
    supplier:         r.supplier            ?? '—',
    unitCost:         r.unit_cost != null ? String(r.unit_cost) : '—',
    activeBatchCount: r.active_batch_count  ?? 0,
  };
}

// Maps a raw API request row to the canonical ItemRequest interface.
function mapApiRequest(r: any): ItemRequest {
  return {
    id:               r.request_id,
    inventoryItemId:  r.item_id,
    itemName:         r.item_name         ?? '—',
    requestedQuantity: r.quantity,
    approvedQuantity: r.approved_quantity ?? null,
    requestedBy:      r.requester_name    ?? '—',
    requesterRole:    r.requester_role === 'LabTechnician' ? 'Lab Specialist' : 'Assistant',
    requestDate:      r.created_at,
    modificationDate: r.modified_at       ?? null,
    status:           r.status            as RequestStatus,
    notes:            r.notes             ?? '',
    rejectionFeedback: r.rejection_feedback ?? '',
  };
}

@Injectable({ providedIn: 'root' })
export class InventoryDataService {

  // ── Observables (single source of truth for Inventory, Item Request, History) ──
  private readonly _items$         = new BehaviorSubject<InventoryItem[]>([]);
  private readonly _requests$      = new BehaviorSubject<ItemRequest[]>([]);
  private readonly _totalItems$    = new BehaviorSubject<number>(0);
  private readonly _history$       = new BehaviorSubject<HistoryRecord[]>([]);
  private readonly _isApproving$   = new BehaviorSubject<boolean>(false);
  private readonly _approvalError$ = new BehaviorSubject<string | null>(null);

  readonly items$:         Observable<InventoryItem[]> = this._items$.asObservable();
  readonly requests$:      Observable<ItemRequest[]>   = this._requests$.asObservable();
  readonly totalItems$:    Observable<number>          = this._totalItems$.asObservable();
  readonly history$:       Observable<HistoryRecord[]> = this._history$.asObservable();
  /** True while an approval HTTP call is in flight. Bind to disable buttons / show spinner. */
  readonly isApproving$:   Observable<boolean>         = this._isApproving$.asObservable();
  /** Non-null when an approval fails. Reset to null when a new approval starts. */
  readonly approvalError$: Observable<string | null>   = this._approvalError$.asObservable();

  constructor(private http: InventoryService) {}

  // ── Inventory item methods ────────────────────────────────────────────────

  loadItems(params?: { page?: number; limit?: number; search?: string }): void {
    this.http.getItems(params).subscribe({
      next: (res: any) => {
        this._totalItems$.next(res.data?.total ?? 0);
        this._items$.next((res.data?.rows ?? []).map(mapApiItem));
      },
      error: () => { this._items$.next([]); this._totalItems$.next(0); },
    });
  }

  /**
   * Applies an immediate in-memory stock deduction so the approve dialog's
   * available-stock hint stays accurate after an approval, without waiting
   * for the next loadItems() call to return fresh DB values.
   */
  deductStock(inventoryItemId: number, quantity: number): void {
    this._items$.next(
      this._items$.getValue().map(item =>
        item.id !== inventoryItemId ? item
          : { ...item, quantityInStock: Math.max(0, item.quantityInStock - quantity) }
      )
    );
    this.updateItemStatus(inventoryItemId);
  }

  updateItemStatus(inventoryItemId: number): void {
    this._items$.next(
      this._items$.getValue().map(item => {
        if (item.id !== inventoryItemId) return item;
        const q = item.quantityInStock;
        const newStatus: ItemStatus =
          item.status === 'Expired' ? 'Expired'
          : q === 0                 ? 'Out of Stock'
          : q <= item.lowStockLimit ? 'Low Stock'
          : 'In Stock';
        return { ...item, status: newStatus };
      })
    );
  }

  getItemStock(inventoryItemId: number): number | null {
    const found = this._items$.getValue().find(i => i.id === inventoryItemId);
    return found != null ? found.quantityInStock : null;
  }

  validateStock(inventoryItemId: number, requestedQty: number): { valid: boolean; available: number | null; itemName: string } {
    const item = this._items$.getValue().find(i => i.id === inventoryItemId);
    if (!item) return { valid: false, available: null, itemName: '—' };
    return {
      valid:     requestedQty <= item.quantityInStock,
      available: item.quantityInStock,
      itemName:  item.name,
    };
  }

  // ── Item request methods ──────────────────────────────────────────────────

  /** Loads all item requests from the API and emits to requests$. */
  loadRequests(): void {
    this.http.getRequests({ limit: 1000 }).subscribe({
      next: (res: any) => {
        this._requests$.next((res.data?.rows ?? []).map(mapApiRequest));
      },
      error: () => { /* keep current list on error */ },
    });
  }

  /**
   * Approves a request via a single atomic API call.
   *
   * The backend (PATCH /api/inventory/requests/:id) performs all three DB
   * writes in one transaction: updates Inventory_Requests.status/approved_quantity,
   * inserts a Withdraw row into Stock_Transactions, and deducts
   * Inventory_Items.quantity_on_hand.
   *
   * On success:
   *   - Optimistically marks the request Approved in _requests$
   *   - Applies an immediate in-memory stock deduction so the dialog hint is fresh
   *   - Reloads _requests$ from the DB for authoritative state
   * On 409: sets approvalError$ with the server's message; dialog stays open
   * On 400: sets approvalError$ with the server's message; component closes dialog
   * On other error: sets a generic approvalError$ message; component closes dialog
   */
  approveRequest(requestId: number, approvedQty: number): Observable<void> {
    const requests = this._requests$.getValue();
    const request  = requests.find(r => r.id === requestId);
    if (!request) return EMPTY;

    this._isApproving$.next(true);
    this._approvalError$.next(null);

    return this.http.approveRequest(String(requestId), approvedQty).pipe(
      tap(() => {
        const nowIso = new Date().toISOString();
        this._requests$.next(requests.map(r =>
          r.id !== requestId ? r
            : { ...r, status: 'Approved' as RequestStatus, approvedQuantity: approvedQty, modificationDate: nowIso }
        ));
        this.deductStock(request.inventoryItemId, approvedQty);
        this.loadRequests();
      }),
      map(() => void 0 as void),
      catchError((err: any) => {
        const status  = err?.status  as number | undefined;
        const message = err?.error?.error as string | undefined;
        if (status === 409) {
          this._approvalError$.next(message ?? 'Insufficient stock. Please reduce the quantity or restock the item.');
        } else if (status === 400) {
          this._approvalError$.next(message ?? 'Request has already been processed.');
        } else {
          this._approvalError$.next('Approval failed. Please try again.');
        }
        throw err;
      }),
      finalize(() => this._isApproving$.next(false))
    );
  }

  /** Rejects a request and stores the manager's feedback. */
  rejectRequest(requestId: number, feedback: string): void {
    const requests = this._requests$.getValue();
    const request  = requests.find(r => r.id === requestId);

    this.http.rejectRequest(String(requestId), feedback).subscribe({
      next: () => {
        this._applyRejectLocally(requestId, feedback, requests);
        this.loadRequests();
      },
      error: () => {
        // Fallback: update in-memory so the UI reflects the action even if the
        // HTTP call fails (e.g. during development without a live backend).
        this._applyRejectLocally(requestId, feedback, requests);
      },
    });
  }

  private _applyRejectLocally(requestId: number, feedback: string, requests: ItemRequest[]): void {
    const request = requests.find(r => r.id === requestId);
    this._requests$.next(
      requests.map(r =>
        r.id !== requestId ? r
          : { ...r, status: 'Rejected' as RequestStatus, rejectionFeedback: feedback, modificationDate: new Date().toISOString() }
      )
    );
    if (request) {
      const currentStock = this._items$.getValue()
        .find(i => i.id === request.inventoryItemId)?.quantityInStock ?? 0;
      this.logHistory({
        inventoryItemId: request.inventoryItemId,
        itemName:        request.itemName,
        action:          'Rejected Request',
        quantityChanged: 0,
        quantityBefore:  currentStock,
        quantityAfter:   currentStock,
        performedBy:     'Inventory Manager',
        date:            new Date(),
        notes:           feedback,
      });
    }
  }

  // ── History methods ───────────────────────────────────────────────────────

  getHistory(): Observable<HistoryRecord[]> {
    return this.history$;
  }

  logHistory(record: Omit<HistoryRecord, 'id'>): void {
    const history = this._history$.getValue();
    const nextId  = history.length > 0 ? Math.max(...history.map(h => h.id)) + 1 : 1;
    this._history$.next([{ id: nextId, ...record }, ...history]);
  }
}
