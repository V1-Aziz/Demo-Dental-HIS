import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../../../services/inventory.service';
import { MyInventoryRequest } from '../../../models/inventory.models';

type DropdownItem = { item_id: number; item_name: string };

@Component({
  standalone: false,
  selector: 'app-assistant-inventory',
  templateUrl: './assistant-inventory.component.html',
})
export class AssistantInventoryComponent implements OnInit {
  // ── Dropdown items ──────────────────────────────────────────────────────────
  items: DropdownItem[] = [];

  // ── Form state ──────────────────────────────────────────────────────────────
  selectedItemId: number | null = null;
  quantity: number | null = null;
  notes = '';

  // ── Submission state ────────────────────────────────────────────────────────
  isSubmitting   = false;
  successMessage = '';
  errorMessage   = '';

  // ── Request modal ────────────────────────────────────────────────────────────
  showRequestModal = false;

  // ── History ─────────────────────────────────────────────────────────────────
  history: MyInventoryRequest[] = [];
  isLoadingHistory = false;

  // ── Selection ───────────────────────────────────────────────────────────────
  selectedRequest: MyInventoryRequest | null = null;

  // ── Pagination ───────────────────────────────────────────────────────────────
  currentPage     = 1;
  pageSize        = 10;
  pageSizeOptions = [10, 25, 50];

  // ── Search & Filter ──────────────────────────────────────────────────────────
  searchTerm      = '';
  filterPopupOpen = false;
  draft = {
    statusPending:  false,
    statusApproved: false,
    statusRejected: false,
    reqFrom: '',
    reqTo:   '',
  };
  applied = { ...this.draft };

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadItems();
    this.loadHistory();
  }

  private loadItems(): void {
    this.inventoryService.getItems({ limit: 1000 }).subscribe({
      next: (res: any) => {
        this.items = (res.data?.rows ?? []).map((r: any) => ({
          item_id:   r.item_id   as number,
          item_name: r.item_name as string,
        }));
      },
      error: () => {},
    });
  }

  loadHistory(): void {
    this.isLoadingHistory = true;
    this.inventoryService.getMyRequests().subscribe({
      next: (res: any) => {
        this.history = res.data?.rows ?? [];
        this.isLoadingHistory = false;
        // Keep selection in sync; clear if the row no longer exists.
        if (this.selectedRequest) {
          const still = this.history.find(r => r.request_id === this.selectedRequest!.request_id);
          this.selectedRequest = still ?? null;
        }
      },
      error: () => { this.isLoadingHistory = false; },
    });
  }

  get isFormValid(): boolean {
    return (
      this.selectedItemId !== null &&
      this.selectedItemId > 0 &&
      this.quantity !== null &&
      this.quantity >= 1
    );
  }

  openRequestModal(): void {
    this.selectedItemId  = null;
    this.quantity        = null;
    this.notes           = '';
    this.errorMessage    = '';
    this.showRequestModal = true;
  }

  closeRequestModal(): void {
    this.showRequestModal = false;
  }

  submitRequest(): void {
    if (!this.isFormValid || this.isSubmitting) return;

    this.isSubmitting = true;
    this.errorMessage = '';

    const trimmedNotes = this.notes.trim().slice(0, 500);

    this.inventoryService.createRequest({
      item_id:  this.selectedItemId!,
      quantity: this.quantity!,
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    }).subscribe({
      next: () => {
        this.showRequestModal = false;
        this.successMessage   = 'Request submitted successfully.';
        this.selectedItemId   = null;
        this.quantity         = null;
        this.notes            = '';
        this.isSubmitting     = false;
        this.currentPage      = 1;
        this.loadHistory();
        setTimeout(() => { this.successMessage = ''; }, 4000);
      },
      error: (err: any) => {
        this.errorMessage = (err?.error?.error as string | undefined)
          ?? 'Failed to submit request. Please try again.';
        this.isSubmitting = false;
      },
    });
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  selectRequest(req: MyInventoryRequest): void {
    this.selectedRequest =
      this.selectedRequest?.request_id === req.request_id ? null : req;
  }

  // ── Search & Filter ──────────────────────────────────────────────────────────
  get filteredRequests(): MyInventoryRequest[] {
    const a    = this.applied;
    const term = this.searchTerm.toLowerCase();
    const hasStatusFilter = a.statusPending || a.statusApproved || a.statusRejected;
    const hasReqFilter    = !!a.reqFrom || !!a.reqTo;

    return this.history.filter(r => {
      if (term && !(
        r.item_name.toLowerCase().includes(term) ||
        r.status.toLowerCase().includes(term)
      )) return false;

      if (hasStatusFilter) {
        if (!((a.statusPending  && r.status === 'Pending')  ||
              (a.statusApproved && r.status === 'Approved') ||
              (a.statusRejected && r.status === 'Rejected'))) return false;
      }

      if (hasReqFilter) {
        const d = new Date(r.request_date);
        if (!isNaN(d.getTime())) {
          if (a.reqFrom) { const f = new Date(a.reqFrom); f.setHours(0,0,0,0);       if (d < f) return false; }
          if (a.reqTo)   { const t = new Date(a.reqTo);   t.setHours(23,59,59,999); if (d > t) return false; }
        }
      }

      return true;
    });
  }

  get hasActiveFilters(): boolean {
    const a = this.applied;
    return a.statusPending || a.statusApproved || a.statusRejected || !!a.reqFrom || !!a.reqTo;
  }

  // ── Pagination ────────────────────────────────────────────────────────────────
  get totalItems():     number { return this.filteredRequests.length; }
  get totalPages():     number { return Math.max(1, Math.ceil(this.totalItems / this.pageSize)); }
  get pageRangeStart(): number { return this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():   number { return Math.min(this.currentPage * this.pageSize, this.totalItems); }

  get pagedRequests(): MyInventoryRequest[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRequests.slice(start, start + this.pageSize);
  }

  onSearchChange(): void { this.currentPage = 1; }
  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.currentPage = p; } }
  onPageSizeChange(s: number | string): void { this.pageSize = +s; this.currentPage = 1; }

  // ── Filter popup ─────────────────────────────────────────────────────────────
  openFilterPopup():  void { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }

  applyFilters(): void {
    this.applied = { ...this.draft };
    this.currentPage = 1;
    this.filterPopupOpen = false;
  }

  clearAllFilters(): void {
    const def = { statusPending: false, statusApproved: false, statusRejected: false, reqFrom: '', reqTo: '' };
    this.draft   = { ...def };
    this.applied = { ...def };
    this.currentPage = 1;
    this.filterPopupOpen = false;
  }

  // ── Display helpers ───────────────────────────────────────────────────────────
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

  statusClass(status: 'Pending' | 'Approved' | 'Rejected'): string {
    const map: Record<string, string> = {
      Pending:  'bg-yellow-100 text-yellow-800',
      Approved: 'bg-green-100 text-green-800',
      Rejected: 'bg-red-100 text-red-800',
    };
    return map[status] ?? '';
  }

  get approvedQuantityDisplay(): string {
    return this.selectedRequest?.approved_quantity != null
      ? String(this.selectedRequest.approved_quantity)
      : '—';
  }
}
