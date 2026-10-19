// Item Requests page for the Inventory Manager portal.
// Displays pending/approved/rejected supply requests from Assistants and Lab
// Technicians.  All data reads and writes go through InventoryDataService —
// this component contains only UI state (filters, modals, pagination).
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { InventoryItem, ItemRequest, RequestStatus } from '../../../models/inventory.models';

/** Data passed into the Approve Quantity confirmation dialog. */
interface ApproveDialogData {
  requestId:         number;
  inventoryItemId:   number;
  itemName:          string;
  requestedQuantity: number;
}

@Component({
  standalone: false,
  selector: 'app-inventory-manager-requests',
  templateUrl: './inventory-manager-requests.component.html',
})
export class InventoryManagerRequestsComponent implements OnInit, OnDestroy {
  searchTerm       = '';
  selectedRequest: ItemRequest | null = null;

  // Local snapshot — always synced from InventoryDataService.requests$
  requests: ItemRequest[] = [];

  // Lookup map built from items$ — used to resolve inventory item name/ID
  // for each request row.  Only contains items on the currently-loaded page;
  // falls back to the request's stored itemName when not found.
  private itemById = new Map<number, InventoryItem>();

  currentPage     = 1;
  pageSize        = 10;
  pageSizeOptions = [10, 25, 50];

  // ── Filter popup ─────────────────────────────────────────────────
  filterPopupOpen = false;
  draft = {
    status: 'All',
    modChip: 'all' as 'all' | 'today' | 'last7' | 'last30' | 'notmod',
    modMode: 'specific' as 'specific' | 'range',
    modDate: '', modFrom: '', modTo: '',
    includeNotModified: false,
    reqChip: 'all' as 'all' | 'today' | 'last7' | 'last30',
    reqMode: 'specific' as 'specific' | 'range',
    reqDate: '', reqFrom: '', reqTo: '',
  };
  applied = { ...this.draft };

  readonly modChips: { label: string; value: 'all' | 'today' | 'last7' | 'last30' | 'notmod' }[] = [
    { label: 'All',              value: 'all'    },
    { label: 'Today',            value: 'today'  },
    { label: 'Last 7 days',      value: 'last7'  },
    { label: 'Last 30 days',     value: 'last30' },
    { label: 'Not yet modified', value: 'notmod' },
  ];
  readonly reqChips: { label: string; value: 'all' | 'today' | 'last7' | 'last30' }[] = [
    { label: 'All',          value: 'all'    },
    { label: 'Today',        value: 'today'  },
    { label: 'Last 7 days',  value: 'last7'  },
    { label: 'Last 30 days', value: 'last30' },
  ];

  actionError         = '';
  isLoading           = false;   // driven by dataService.isApproving$
  approveSuccess      = false;   // shows brief success banner before auto-close
  approvalModalError  = '';      // driven by dataService.approvalError$
  private readonly destroy$ = new Subject<void>();

  constructor(private dataService: InventoryDataService) {}

  ngOnInit(): void {
    // Build a live lookup map from the shared inventory items observable.
    // Used by resolvedItemName() and resolvedItemId() in the template.
    this.dataService.items$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.itemById = new Map(items.map(i => [i.id, i]));
    });

    this.dataService.requests$.pipe(takeUntil(this.destroy$)).subscribe(requests => {
      this.requests = requests;
      if (this.selectedRequest) {
        const updated = requests.find(r => r.id === this.selectedRequest!.id) ?? null;
        this.selectedRequest = updated;
      }
    });
    this.dataService.loadRequests();

    // Drive isLoading from the shared service so the spinner and disabled states
    // reflect real in-flight HTTP calls rather than a manual stub.
    this.dataService.isApproving$.pipe(takeUntil(this.destroy$)).subscribe(loading => {
      this.isLoading = loading;
    });

    // Mirror the service-level error into the modal so the manager can retry
    // without closing the dialog.
    this.dataService.approvalError$.pipe(takeUntil(this.destroy$)).subscribe(err => {
      this.approvalModalError = err ?? '';
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Display helpers ───────────────────────────────────────────────

  /** Returns the inventory item's current name for a request.
   *  Falls back to the request's stored itemName if the item is off-page. */
  resolvedItemName(req: ItemRequest | null): string {
    if (!req) return '';
    return this.itemById.get(req.inventoryItemId)?.name ?? req.itemName;
  }

  /** Returns the inventory item ID (inventoryItemId) for a request.
   *  Always available directly from the request record — no lookup needed. */
  resolvedItemId(req: ItemRequest): number {
    return req.inventoryItemId;
  }

  // Formats a date/ISO string as DD/MM/YYYY, HH:MM AM/PM in Saudi Arabia
  // Standard Time (AST, UTC+3).  Returns "—" for null or invalid values.
  formatDateTime(dt: string | null): string {
    if (!dt) return '—';
    const d = new Date(dt);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Riyadh',
    }).format(d);
  }

  private parseDate(dt: string | null): Date | null {
    if (!dt) return null;
    const d = new Date(dt);
    return isNaN(d.getTime()) ? null : d;
  }

  // ── Filter popup ─────────────────────────────────────────────────
  openFilterPopup(): void { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }

  applyFilters(): void { this.applied = { ...this.draft }; this.currentPage = 1; this.filterPopupOpen = false; }

  clearAllFilters(): void {
    const def = {
      status: 'All',
      modChip: 'all' as const, modMode: 'specific' as const, modDate: '', modFrom: '', modTo: '', includeNotModified: false,
      reqChip: 'all' as const, reqMode: 'specific' as const, reqDate: '', reqFrom: '', reqTo: '',
    };
    this.draft    = { ...def };
    this.applied  = { ...def };
    this.currentPage = 1;
    this.filterPopupOpen = false;
  }

  pickModChip(chip: 'all' | 'today' | 'last7' | 'last30' | 'notmod'): void {
    this.draft.modChip = chip; this.draft.modDate = ''; this.draft.modFrom = ''; this.draft.modTo = '';
  }
  onModDateInput(): void { this.draft.modChip = 'all'; }

  pickReqChip(chip: 'all' | 'today' | 'last7' | 'last30'): void {
    this.draft.reqChip = chip; this.draft.reqDate = ''; this.draft.reqFrom = ''; this.draft.reqTo = '';
  }
  onReqDateInput(): void { this.draft.reqChip = 'all'; }

  // ── Filtering ─────────────────────────────────────────────────────
  get filteredRequests(): ItemRequest[] {
    const a    = this.applied;
    const term = this.searchTerm.toLowerCase();
    const now  = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7  = new Date(today.getTime() -  6 * 86_400_000);
    const last30 = new Date(today.getTime() - 29 * 86_400_000);

    const hasModFilter = a.modChip !== 'all' || !!a.modDate || !!a.modFrom || !!a.modTo;
    const hasReqFilter = a.reqChip !== 'all' || !!a.reqDate || !!a.reqFrom || !!a.reqTo;

    return this.requests.filter(r => {
      if (term && !(
        r.itemName.toLowerCase().includes(term) ||
        r.requestedBy.toLowerCase().includes(term) ||
        String(r.id).toLowerCase().includes(term)
      )) return false;

      if (a.status !== 'All' && r.status !== a.status) return false;

      if (hasModFilter) {
        const modDate = this.parseDate(r.modificationDate);
        if (!modDate) {
          if (!a.includeNotModified && a.modChip !== 'notmod') return false;
          if (a.modChip === 'notmod') return true;
        } else {
          if (a.modChip === 'notmod') return false;
          if (a.modChip === 'today'  && !(modDate >= today))  return false;
          if (a.modChip === 'last7'  && !(modDate >= last7))  return false;
          if (a.modChip === 'last30' && !(modDate >= last30)) return false;
          if (a.modChip === 'all' && (!!a.modDate || !!a.modFrom || !!a.modTo)) {
            if (a.modMode === 'specific' && a.modDate) {
              const d = new Date(a.modDate); d.setHours(0,0,0,0);
              if (modDate.getTime() !== d.getTime()) return false;
            }
            if (a.modMode === 'range') {
              if (a.modFrom) { const f = new Date(a.modFrom); f.setHours(0,0,0,0); if (modDate < f) return false; }
              if (a.modTo)   { const t = new Date(a.modTo);   t.setHours(0,0,0,0); if (modDate > t) return false; }
            }
          }
        }
      }

      if (hasReqFilter) {
        const reqDate = this.parseDate(r.requestDate);
        if (!reqDate) return false;
        if (a.reqChip === 'today'  && !(reqDate >= today))  return false;
        if (a.reqChip === 'last7'  && !(reqDate >= last7))  return false;
        if (a.reqChip === 'last30' && !(reqDate >= last30)) return false;
        if (a.reqChip === 'all' && (!!a.reqDate || !!a.reqFrom || !!a.reqTo)) {
          if (a.reqMode === 'specific' && a.reqDate) {
            const d = new Date(a.reqDate); d.setHours(0,0,0,0);
            if (reqDate.getTime() !== d.getTime()) return false;
          }
          if (a.reqMode === 'range') {
            if (a.reqFrom) { const f = new Date(a.reqFrom); f.setHours(0,0,0,0); if (reqDate < f) return false; }
            if (a.reqTo)   { const t = new Date(a.reqTo);   t.setHours(0,0,0,0); if (reqDate > t) return false; }
          }
        }
      }

      return true;
    });
  }

  get hasActiveFilters(): boolean {
    const a = this.applied;
    return a.status !== 'All' ||
      a.modChip !== 'all' || !!a.modDate || !!a.modFrom || !!a.modTo ||
      a.reqChip !== 'all' || !!a.reqDate || !!a.reqFrom || !!a.reqTo;
  }

  // ── Pagination ────────────────────────────────────────────────────
  get totalItems():     number { return this.filteredRequests.length; }
  get totalPages():     number { return Math.max(1, Math.ceil(this.totalItems / this.pageSize)); }
  get pageRangeStart(): number { return this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():   number { return Math.min(this.currentPage * this.pageSize, this.totalItems); }

  get pagedRequests(): ItemRequest[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRequests.slice(start, start + this.pageSize);
  }

  onSearchChange(): void { this.currentPage = 1; }
  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.currentPage = p; } }
  onPageSizeChange(s: number | string): void { this.pageSize = +s; this.currentPage = 1; }

  get approvedQuantityDisplay(): string {
    return this.selectedRequest?.approvedQuantity != null
      ? String(this.selectedRequest.approvedQuantity)
      : '—';
  }

  // ── Status helpers ────────────────────────────────────────────────
  statusClass(status: RequestStatus): string {
    const map: Record<RequestStatus, string> = {
      'Pending':  'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800',
    };
    return map[status];
  }

  statusIcon(status: RequestStatus): string {
    const map: Record<RequestStatus, string> = {
      'Pending':  'schedule',
      'Approved': 'check_circle',
      'Rejected': 'cancel',
    };
    return map[status];
  }

  // ── Approve Confirmation Modal ────────────────────────────────────
  showApproveModal       = false;
  approveDialogData: ApproveDialogData | null = null;
  approvedQuantity:  number | null            = null;
  approveSuccessMessage  = '';

  /** True only when quantity >= 1 (field-level check, ignores stock). */
  get isApproveQuantityValid(): boolean {
    return this.approvedQuantity !== null && this.approvedQuantity >= 1;
  }

  /**
   * Live stock available for the item linked to the open dialog.
   * Reads from the shared BehaviorSubject so it reflects any prior deductions
   * made this session.  Returns null when the item is not on the loaded page.
   */
  get availableStock(): number | null {
    if (!this.approveDialogData) return null;
    return this.dataService.getItemStock(this.approveDialogData.inventoryItemId);
  }

  /**
   * Blocking stock error for the approve dialog.  Non-empty string means the
   * "Confirm Approval" button must be disabled and the message shown inline.
   * Re-evaluated on every change-detection cycle so it reacts as the manager
   * types into the quantity input.
   *
   * Returns '' (no error) when quantity is < 1 — let isApproveQuantityValid
   * handle that case separately so the two validation paths don't collide.
   */
  get stockError(): string {
    if (!this.approveDialogData || this.approvedQuantity === null || this.approvedQuantity < 1) return '';
    const v = this.dataService.validateStock(
      this.approveDialogData.inventoryItemId,
      this.approvedQuantity,
    );
    if (v.available === null)
      return 'This request is not linked to a valid inventory item. Please navigate to the Inventory page to load the item before approving.';
    if (!v.valid)
      return `Insufficient stock. Available quantity for ${v.itemName} is ${v.available} unit${v.available === 1 ? '' : 's'}. You requested to approve ${this.approvedQuantity} units. Please reduce the approved quantity or restock the item first.`;
    return '';
  }

  openApproveModal(): void {
    if (!this.selectedRequest) return;
    this.approveDialogData = {
      requestId:         this.selectedRequest.id,
      inventoryItemId:   this.selectedRequest.inventoryItemId,
      // Use resolved name so the dialog title matches what is shown in the table.
      itemName:          this.resolvedItemName(this.selectedRequest),
      requestedQuantity: this.selectedRequest.requestedQuantity,
    };
    this.approvedQuantity     = this.selectedRequest.requestedQuantity;
    this.actionError          = '';
    this.approveSuccess       = false;
    this.approveSuccessMessage = '';
    this.approvalModalError   = '';
    this.showApproveModal     = true;
  }

  closeApproveModal(): void {
    this.showApproveModal      = false;
    this.approveDialogData     = null;
    this.approvedQuantity      = null;
    this.approveSuccess        = false;
    this.approveSuccessMessage = '';
    this.approvalModalError    = '';
  }

  confirmApprove(): void {
    if (!this.approveDialogData || !this.isApproveQuantityValid) return;
    // stockError is recomputed live; guard here as a final safety check.
    if (this.stockError) return;

    const { requestId, itemName } = this.approveDialogData;
    const qty = this.approvedQuantity as number;
    this.approvalModalError = '';

    this.dataService.approveRequest(requestId, qty)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.approveSuccessMessage = `Request approved successfully. ${qty} unit${qty === 1 ? '' : 's'} deducted from ${itemName}.`;
          this.approveSuccess = true;
          setTimeout(() => this.closeApproveModal(), 1500);
        },
        error: (err: any) => {
          // 409 (Insufficient stock): keep the dialog open — the inline error
          // is already displayed via the approvalError$ subscription.
          // 400 / other: move the error to actionError (shown in the right panel)
          // and close the dialog so the manager can see it.
          if (err?.status !== 409) {
            this.actionError = this.approvalModalError || 'Approval failed. Please try again.';
            this.closeApproveModal();
          }
        },
      });
  }

  // ── Reject Modal ──────────────────────────────────────────────────
  showRejectModal     = false;
  rejectFeedback      = '';
  rejectFeedbackError = false;

  openRejectModal(): void {
    if (!this.selectedRequest) return;
    this.rejectFeedback      = '';
    this.rejectFeedbackError = false;
    this.actionError         = '';
    this.showRejectModal     = true;
  }

  closeRejectModal(): void { this.showRejectModal = false; }

  confirmReject(): void {
    if (!this.rejectFeedback.trim()) { this.rejectFeedbackError = true; return; }
    if (!this.selectedRequest) return;
    this.dataService.rejectRequest(this.selectedRequest.id, this.rejectFeedback.trim());
    this.actionError = '';
    this.closeRejectModal();
  }
}
