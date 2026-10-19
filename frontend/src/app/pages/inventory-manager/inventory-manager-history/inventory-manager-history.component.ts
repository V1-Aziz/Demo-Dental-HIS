// History page for the Inventory Manager portal.
// Activity History is sourced from GET /inventory/activity-history (Stock_Transactions).
// Removed Items section remains unchanged (fetched from GET /inventory/removed-items).
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { InventoryService }     from '../../../services/inventory.service';
import { RemovedInventoryItem } from '../../../models/inventory.models';

interface ApiActivityRow {
  transaction_id:   number;
  item_id:          number | null;
  item_name:        string;
  category:         string | null;
  expire_date:      string | null;
  quantity:         number;
  transaction_type: 'Deposit' | 'Withdraw' | 'Reject';
  time_stamp:       string;
  performed_by:     string;
  notes:            string | null;
}

/** Shape expected by the HTML template. */
interface ActivityLog {
  itemName:        string;
  itemId:          string;
  type:            string;   // action label: Deposit / Withdraw / Approved Request / Rejected Request
  expireDate:      string;   // formatted expire date or 'N/A'
  registerDate:    string;   // formatted transaction timestamp (dd/MM/yyyy, HH:mm AST)
  registerDateRaw: string;   // ISO string used for date filter comparisons
  assignedBy:      string;
  direction:       'In' | 'Out';
  quantityDisplay: string;   // '+50', '-20', or '—'
  quantityClass:   string;   // Tailwind color class for the quantity cell
}

type HistoryTab = 'activity' | 'removed';

@Component({
  standalone: false,
  selector: 'app-inventory-manager-history',
  templateUrl: './inventory-manager-history.component.html',
})
export class InventoryManagerHistoryComponent implements OnInit, OnDestroy {
  // ── Tab state ──────────────────────────────────────────────────
  activeHistoryTab: HistoryTab = 'activity';
  readonly historyTabs = [
    { value: 'activity', title: 'Activity History', subtitle: 'View all inventory transactions and logs' },
    { value: 'removed',  title: 'Removed Items',    subtitle: 'View deleted item audit log' },
  ];

  setHistoryTab(tab: HistoryTab): void {
    this.activeHistoryTab = tab;
  }

  get currentSearchTerm(): string {
    return this.activeHistoryTab === 'activity' ? this.searchTerm : this.removedSearchTerm;
  }
  set currentSearchTerm(value: string) {
    if (this.activeHistoryTab === 'activity') { this.searchTerm = value; this.currentPage = 1; }
    else { this.removedSearchTerm = value; this.removedCurrentPage = 1; }
  }

  get isFilterActive(): boolean {
    return this.activeHistoryTab === 'activity'
      ? (this.filterPopupOpen || this.hasActiveFilters)
      : (this.removedFilterOpen || this.removedHasActiveFilters);
  }

  openFilterModal(): void {
    if (this.activeHistoryTab === 'activity') {
      this.filterPopupOpen ? this.closeFilterPopup() : this.openFilterPopup();
    } else {
      this.removedFilterOpen ? this.closeRemovedFilter() : this.openRemovedFilter();
    }
  }

  logs: ActivityLog[] = [];
  isLoadingHistory  = false;
  historyError: string | null = null;
  searchTerm = '';

  // ── Pagination ────────────────────────────────────────────────
  currentPage     = 1;
  pageSize        = 10;
  pageSizeOptions = [10, 25, 50];

  // ── Filter popup ─────────────────────────────────────────────
  filterPopupOpen = false;
  draft = {
    type: 'All',
    user: 'All',
    dateMode: 'specific' as 'specific' | 'range',
    date: '', dateFrom: '', dateTo: '',
  };
  applied = { ...this.draft };

  get uniqueUsers(): string[] {
    const seen = new Set<string>();
    return this.logs
      .map(l => l.assignedBy)
      .filter(e => { if (!e || e === '—' || seen.has(e)) return false; seen.add(e); return true; });
  }

  // ── Removed items ─────────────────────────────────────────────
  removedItems:        RemovedInventoryItem[] = [];
  removedItemsLoading  = false;
  removedItemsError:   string | null = null;
  removedSearchTerm    = '';

  // ── Removed items pagination ──────────────────────────────────
  removedCurrentPage     = 1;
  removedPageSize        = 10;
  removedPageSizeOptions = [10, 25, 50];

  // ── Removed items filter ──────────────────────────────────────
  removedFilterOpen = false;
  removedDraft = {
    catConsumable:    false,
    catEquipment:     false,
    catMedication:    false,
    catInstrument:    false,
    catProtective:    false,
    reasonExpired:    false,
    reasonOutOfStock: false,
    dateMode:         'specific' as 'specific' | 'range',
    date:             '',
    dateFrom:         '',
    dateTo:           '',
  };
  removedApplied = { ...this.removedDraft };

  private readonly destroy$ = new Subject<void>();

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadActivityHistory();
    this.loadRemovedItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadActivityHistory(): void {
    this.isLoadingHistory = true;
    this.historyError     = null;
    this.inventoryService.getActivityHistory({ limit: 5000 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const rows: ApiActivityRow[] = res.data?.rows ?? [];
          this.logs             = rows.map(r => this.mapRow(r));
          this.isLoadingHistory = false;
          this.currentPage      = 1;
        },
        error: (err: any) => {
          const serverMsg = err?.error?.error ?? err?.error?.message ?? null;
          this.historyError     = serverMsg ?? 'Failed to load activity history. Please try again.';
          this.isLoadingHistory = false;
          console.error('[ActivityHistory] load failed:', err);
        },
      });
  }

  private mapRow(r: ApiActivityRow): ActivityLog {
    const isDeposit = r.transaction_type === 'Deposit';
    const isReject  = r.transaction_type === 'Reject';

    let type: string;
    if (isDeposit) {
      type = 'Deposit';
    } else if (isReject) {
      type = 'Rejected Request';
    } else if (r.notes?.startsWith('Request #')) {
      type = 'Approved Request';
    } else {
      type = 'Withdraw';
    }

    let quantityDisplay: string;
    let quantityClass: string;
    if (isReject || r.quantity <= 0) {
      quantityDisplay = '—';
      quantityClass   = 'text-gray-400';
    } else if (isDeposit) {
      quantityDisplay = `+${r.quantity}`;
      quantityClass   = 'text-[#3B6D11] font-medium';
    } else {
      quantityDisplay = `-${r.quantity}`;
      quantityClass   = 'text-[#A32D2D] font-medium';
    }

    return {
      itemName:        r.item_name,
      itemId:          r.item_id !== null ? String(r.item_id) : '—',
      type,
      expireDate:      r.expire_date ? this.formatDateOnly(r.expire_date) : 'N/A',
      registerDate:    this.formatDateTime(r.time_stamp),
      registerDateRaw: r.time_stamp,
      assignedBy:      r.performed_by,
      direction:       isDeposit ? 'In' : 'Out',
      quantityDisplay,
      quantityClass,
    };
  }

  loadRemovedItems(): void {
    this.removedItemsLoading = true;
    this.removedItemsError   = null;
    this.inventoryService.getRemovedItems().subscribe({
      next: (res: any) => {
        this.removedItems        = res.data ?? res ?? [];
        this.removedItemsLoading = false;
        this.removedCurrentPage  = 1;
      },
      error: (err: any) => {
        const serverMsg          = err?.error?.error ?? err?.error?.message ?? null;
        this.removedItemsError   = serverMsg ?? 'Failed to load removed items. Please try again.';
        this.removedItemsLoading = false;
      },
    });
  }

  // Formats a removed_at ISO string as "Jan 15, 2025 · 10:32 AM" (UTC+3).
  formatRemovedAt(isoStr: string): string {
    const d = new Date(isoStr);
    const datePart = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      timeZone: 'Asia/Riyadh',
    }).format(d);
    const timePart = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Riyadh',
    }).format(d);
    return `${datePart} · ${timePart}`;
  }

  // Formats a transaction timestamp (ISO string) as dd/MM/yyyy, HH:mm in AST (UTC+3).
  private formatDateTime(isoStr: string): string {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Riyadh',
    }).format(d);
  }

  // Formats a date-only string (YYYY-MM-DD) as dd/MM/yyyy.
  private formatDateOnly(dateStr: string): string {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }

  // ── Filter popup ─────────────────────────────────────────────
  openFilterPopup(): void  { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }

  applyFilters(): void { this.applied = { ...this.draft }; this.currentPage = 1; this.filterPopupOpen = false; }

  clearAllFilters(): void {
    const def = { type: 'All', user: 'All', dateMode: 'specific' as const, date: '', dateFrom: '', dateTo: '' };
    this.draft = { ...def }; this.applied = { ...def };
    this.currentPage = 1; this.filterPopupOpen = false;
  }

  onDateModeChange(): void { this.draft.date = ''; this.draft.dateFrom = ''; this.draft.dateTo = ''; }

  // ── Filtering ─────────────────────────────────────────────────
  get filteredLogs(): ActivityLog[] {
    const a    = this.applied;
    const term = this.searchTerm.toLowerCase();
    const hasDateFilter = !!a.date || !!a.dateFrom || !!a.dateTo;

    return this.logs.filter(log => {
      if (term && !(
        log.itemName.toLowerCase().includes(term) ||
        log.itemId.toLowerCase().includes(term) ||
        log.assignedBy.toLowerCase().includes(term)
      )) return false;

      if (a.type !== 'All') {
        const logType = log.direction === 'In' ? 'Deposit' : 'Withdraw';
        if (logType !== a.type) return false;
      }

      if (a.user !== 'All' && log.assignedBy !== a.user) return false;

      if (hasDateFilter) {
        if (log.registerDateRaw === '—') return false;
        const logDate = new Date(log.registerDateRaw); logDate.setHours(0, 0, 0, 0);
        if (a.dateMode === 'specific' && a.date) {
          const d = new Date(a.date); d.setHours(0, 0, 0, 0);
          if (logDate.getTime() !== d.getTime()) return false;
        }
        if (a.dateMode === 'range') {
          if (a.dateFrom) { const f = new Date(a.dateFrom); f.setHours(0,0,0,0); if (logDate < f) return false; }
          if (a.dateTo)   { const t = new Date(a.dateTo);   t.setHours(0,0,0,0); if (logDate > t) return false; }
        }
      }

      return true;
    });
  }

  get hasActiveFilters(): boolean {
    const a = this.applied;
    return a.type !== 'All' || a.user !== 'All' || !!a.date || !!a.dateFrom || !!a.dateTo;
  }

  // ── Pagination ────────────────────────────────────────────────
  get totalItems():     number { return this.filteredLogs.length; }
  get totalPages():     number { return Math.max(1, Math.ceil(this.totalItems / this.pageSize)); }
  get pageRangeStart(): number { return this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():   number { return Math.min(this.currentPage * this.pageSize, this.totalItems); }

  get pagedLogs(): ActivityLog[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredLogs.slice(start, start + this.pageSize);
  }

  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages) this.currentPage = p; }
  onPageSizeChange(s: number | string): void { this.pageSize = +s; this.currentPage = 1; }

  // ── Removed items filter helpers ──────────────────────────────
  get removedHasActiveFilters(): boolean {
    const a = this.removedApplied;
    return a.catConsumable || a.catEquipment || a.catMedication || a.catInstrument || a.catProtective ||
           a.reasonExpired || a.reasonOutOfStock || !!a.date || !!a.dateFrom || !!a.dateTo;
  }

  openRemovedFilter():  void { this.removedDraft = { ...this.removedApplied }; this.removedFilterOpen = true; }
  closeRemovedFilter(): void { this.removedFilterOpen = false; }

  applyRemovedFilters(): void {
    this.removedApplied = { ...this.removedDraft };
    this.removedCurrentPage = 1;
    this.removedFilterOpen  = false;
  }

  clearRemovedFilters(): void {
    const def = {
      catConsumable: false, catEquipment: false, catMedication: false,
      catInstrument: false, catProtective: false,
      reasonExpired: false, reasonOutOfStock: false,
      dateMode: 'specific' as const, date: '', dateFrom: '', dateTo: '',
    };
    this.removedDraft   = { ...def };
    this.removedApplied = { ...def };
    this.removedCurrentPage = 1;
  }

  onRemovedDateModeChange(): void {
    this.removedDraft.date = '';
    this.removedDraft.dateFrom = '';
    this.removedDraft.dateTo   = '';
  }

  // ── Removed items filtering & pagination ──────────────────────
  get filteredRemovedItems(): RemovedInventoryItem[] {
    const a    = this.removedApplied;
    const term = this.removedSearchTerm.toLowerCase();

    return this.removedItems.filter(item => {
      // Search
      if (term && !(
        item.item_name.toLowerCase().includes(term) ||
        item.category.toLowerCase().includes(term)
      )) return false;

      // Category (OR within section)
      const anyCat = a.catConsumable || a.catEquipment || a.catMedication || a.catInstrument || a.catProtective;
      if (anyCat) {
        const cat = item.category;
        const match = (cat === 'Consumable'       && a.catConsumable) ||
                      (cat === 'Equipment'         && a.catEquipment)  ||
                      (cat === 'Medication'        && a.catMedication) ||
                      (cat === 'Tool / Instrument' && a.catInstrument) ||
                      (cat === 'Protective Gear'   && a.catProtective);
        if (!match) return false;
      }

      // Removal Reason (OR within section)
      const anyReason = a.reasonExpired || a.reasonOutOfStock;
      if (anyReason) {
        if (item.removal_reason === 'Expired'      && !a.reasonExpired)    return false;
        if (item.removal_reason === 'Out of Stock' && !a.reasonOutOfStock) return false;
      }

      // Date (matches Activity History: local-timezone day boundaries)
      const hasDate = !!a.date || !!a.dateFrom || !!a.dateTo;
      if (hasDate) {
        const logDate = new Date(item.removed_at); logDate.setHours(0, 0, 0, 0);
        if (a.dateMode === 'specific' && a.date) {
          const d = new Date(a.date); d.setHours(0, 0, 0, 0);
          if (logDate.getTime() !== d.getTime()) return false;
        }
        if (a.dateMode === 'range') {
          if (a.dateFrom) { const f = new Date(a.dateFrom); f.setHours(0, 0, 0, 0); if (logDate < f) return false; }
          if (a.dateTo)   { const t = new Date(a.dateTo);   t.setHours(0, 0, 0, 0); if (logDate > t) return false; }
        }
      }

      return true;
    });
  }

  get removedTotalItems():     number { return this.filteredRemovedItems.length; }
  get removedTotalPages():     number { return Math.max(1, Math.ceil(this.removedTotalItems / this.removedPageSize)); }
  get removedPageRangeStart(): number { return this.removedTotalItems === 0 ? 0 : (this.removedCurrentPage - 1) * this.removedPageSize + 1; }
  get removedPageRangeEnd():   number { return Math.min(this.removedCurrentPage * this.removedPageSize, this.removedTotalItems); }

  get removedPagedItems(): RemovedInventoryItem[] {
    const start = (this.removedCurrentPage - 1) * this.removedPageSize;
    return this.filteredRemovedItems.slice(start, start + this.removedPageSize);
  }

  goToRemovedPage(p: number): void { if (p >= 1 && p <= this.removedTotalPages) this.removedCurrentPage = p; }
  onRemovedPageSizeChange(s: number | string): void { this.removedPageSize = +s; this.removedCurrentPage = 1; }
}
