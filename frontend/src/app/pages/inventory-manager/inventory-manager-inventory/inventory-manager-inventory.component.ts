import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subject, forkJoin, takeUntil } from 'rxjs';
import { InventoryDataService } from '../../../services/inventory-data.service';
import { InventoryService }     from '../../../services/inventory.service';
import { InventoryItem, ItemBatch } from '../../../models/inventory.models';
import { timeUntilExpiry }      from '../../../utils/time.util';

interface StagedItem { itemId: number; itemName: string; quantity: number; expireDate: string; }
interface Employee   { userId: number; fullName: string; roleName: string; }
interface AllItem    { item_id: number; item_name: string; }

@Component({
  standalone: false,
  selector: 'app-inventory-manager-inventory',
  templateUrl: './inventory-manager-inventory.component.html',
})
export class InventoryManagerInventoryComponent implements OnInit, OnDestroy {
  searchTerm   = '';
  selectedItem: InventoryItem | null = null;

  // Local snapshot — always synced from InventoryDataService.items$
  items:      InventoryItem[] = [];
  totalItems  = 0;
  currentPage = 1;
  pageSize    = 10;
  pageSizeOptions = [10, 25, 50];

  // ── Expandable batch rows ────────────────────────────────────────
  expandedItemId: number | null = null;
  batchCache = new Map<number, ItemBatch[]>();
  batchLoading = false;

  toggleExpand(item: InventoryItem, event: MouseEvent): void {
    event.stopPropagation();
    if (this.expandedItemId === item.id) {
      this.expandedItemId = null;
      return;
    }
    this.expandedItemId = item.id;
    if (!this.batchCache.has(item.id)) {
      this.batchLoading = true;
      this.inventoryService.getItemBatches(item.id).subscribe({
        next: batches => { this.batchCache.set(item.id, batches); this.batchLoading = false; },
        error: ()      => { this.batchCache.set(item.id, []); this.batchLoading = false; },
      });
    }
  }

  getBatchesForItem(itemId: number): ItemBatch[] {
    return this.batchCache.get(itemId) ?? [];
  }

  batchExpireClass(batch: ItemBatch): string {
    if (!batch.expire_date) return 'text-gray-500';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp   = new Date(batch.expire_date);
    if (exp < today) return 'text-red-600 font-semibold';
    if (exp.getTime() - today.getTime() <= 30 * 24 * 3600 * 1000) return 'text-orange-500 font-medium';
    return 'text-gray-700';
  }

  formatBatchExpire(expireDate: string | null): string {
    if (!expireDate) return '—';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(expireDate) < today) return 'Expired';
    return timeUntilExpiry(expireDate);
  }

  formatBatchDate(iso: string): string {
    return new Date(iso).toLocaleDateString();
  }

  // ── Filter popup ─────────────────────────────────────────────────
  filterPopupOpen = false;
  draft = {
    qty: 'All', type: 'All',
    expiryLtValue: '' as string,
    expiryLtUnit: 'Months' as 'Days' | 'Weeks' | 'Months' | 'Years',
    expiryMode: 'specific' as 'specific' | 'range',
    expiryDate: '', expiryFrom: '', expiryTo: '',
    includeNoExpiry: false,
    statusInStock: false, statusLowStock: false, statusExpired: false,
  };
  applied = { ...this.draft };

  private searchDebounce?:   ReturnType<typeof setTimeout>;
  private employeeDebounce?: ReturnType<typeof setTimeout>;
  private toastTimer?:       ReturnType<typeof setTimeout>;
  private pendingReSelectId: number | null = null;
  private readonly destroy$ = new Subject<void>();

  // Shared modal data
  allItems: AllItem[] = [];

  // Toast
  toast: { type: 'success' | 'error' | 'warning'; message: string } | null = null;

  // ── Deposit Modal ────────────────────────────────────────────────
  showDepositModal      = false;
  depositItemId: number | null = null;
  depositQty            = 1;
  depositExpireDate     = '';
  depositStaged: StagedItem[] = [];
  depositLoading        = false;

  // ── Withdraw Modal ───────────────────────────────────────────────
  showWithdrawModal       = false;
  withdrawItemId: number | null = null;
  withdrawQty             = 1;
  withdrawStaged: StagedItem[] = [];
  withdrawEmpSearch       = '';
  withdrawEmpList: Employee[] = [];
  withdrawEmpListOpen     = false;
  withdrawSelectedEmp: Employee | null = null;
  withdrawLoading         = false;
  empDropdownStyle: { top: string; left: string; width: string } = { top: '0px', left: '0px', width: '0px' };

  @ViewChild('empSearchInput') empSearchInputRef!: ElementRef<HTMLInputElement>;

  // ── Delete Modal ─────────────────────────────────────────────────
  showDeleteModal = false;
  deleteLoading   = false;

  openDeleteModal():  void { if (this.selectedItem) this.showDeleteModal = true; }
  closeDeleteModal(): void { this.showDeleteModal = false; }

  confirmDelete(): void {
    if (!this.selectedItem) return;
    this.deleteLoading = true;
    const id = String(this.selectedItem.id);
    this.inventoryService.deleteItem(id).subscribe({
      next: () => {
        this.deleteLoading = false;
        this.closeDeleteModal();
        this.batchCache.delete(this.selectedItem!.id);
        if (this.expandedItemId === this.selectedItem!.id) this.expandedItemId = null;
        this.selectedItem = null;
        this.showToast('success', 'Item deleted.');
        this.loadItems();
      },
      error: () => { this.deleteLoading = false; this.showToast('error', 'Delete failed. Please try again.'); },
    });
  }

  // ── Edit Modal ───────────────────────────────────────────────────
  showEditModal  = false;
  editLoading    = false;
  editErrors     = { itemName: false, category: false, lowStockLimit: false };
  editForm = {
    itemName: '', category: '', lowStockLimit: 1,
    supplier: '', unitCost: null as number | null,
    // expireDate removed — expiry is now managed per batch via Deposit
  };

  openEditModal(): void {
    if (!this.selectedItem) return;
    const s = this.selectedItem;
    this.editErrors = { itemName: false, category: false, lowStockLimit: false };
    this.editForm = {
      itemName:      s.name,
      category:      s.category,
      lowStockLimit: s.lowStockLimit,
      supplier:      s.supplier !== '—' ? s.supplier : '',
      unitCost:      s.unitCost !== '—' ? parseFloat(s.unitCost) : null,
    };
    this.showEditModal = true;
  }

  closeEditModal(): void { this.showEditModal = false; }

  confirmEdit(): void {
    const f = this.editForm;
    this.editErrors = {
      itemName:      !f.itemName.trim(),
      category:      !f.category,
      lowStockLimit: !f.lowStockLimit || f.lowStockLimit < 1,
    };
    if (this.editErrors.itemName || this.editErrors.category || this.editErrors.lowStockLimit) return;
    this.editLoading = true;

    const item         = this.selectedItem!;
    const currentStock = item.quantityInStock;

    this.inventoryService.updateItem(String(item.id), {
      itemName:      f.itemName.trim(),
      category:      f.category,
      lowStockLimit: f.lowStockLimit,
      supplier:      f.supplier?.trim() || null,
      unitCost:      f.unitCost,
    }).subscribe({
      next: () => {
        this.editLoading = false;
        this.closeEditModal();
        this.showToast('success', 'Item updated.');

        this.dataService.logHistory({
          inventoryItemId: item.id,
          itemName:        f.itemName.trim(),
          action:          'Edit',
          quantityChanged: 0,
          quantityBefore:  currentStock,
          quantityAfter:   currentStock,
          performedBy:     'Inventory Manager',
          date:            new Date(),
          notes:           'Item details updated.',
        });

        this.loadItems(item.id);
      },
      error: () => { this.editLoading = false; this.showToast('error', 'Update failed. Please try again.'); },
    });
  }

  // ── Register Modal ───────────────────────────────────────────────
  showRegisterModal  = false;
  registerLoading    = false;
  registerForm = {
    itemName: '', category: '', supplier: '',
    unitCost: null as number | null,
    lowStockLimit: 1,
  };
  readonly categories = ['Consumable', 'Equipment', 'Medication', 'Tool / Instrument', 'Protective Gear'];

  constructor(
    private dataService:      InventoryDataService,
    private inventoryService: InventoryService,
  ) {}

  ngOnInit(): void {
    this.dataService.items$.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.items = items;
      if (this.pendingReSelectId !== null) {
        const found = items.find(i => i.id === this.pendingReSelectId);
        if (found) { this.selectedItem = found; this.pendingReSelectId = null; }
      } else if (this.selectedItem) {
        const updated = items.find(i => i.id === this.selectedItem!.id);
        if (updated) this.selectedItem = updated;
      }
    });

    this.dataService.totalItems$.pipe(takeUntil(this.destroy$)).subscribe(total => {
      this.totalItems = total;
    });

    this.loadItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearTimeout(this.searchDebounce);
    clearTimeout(this.employeeDebounce);
    clearTimeout(this.toastTimer);
  }

  // ── Table ────────────────────────────────────────────────────────
  loadItems(reSelectId?: number): void {
    if (reSelectId !== undefined) this.pendingReSelectId = reSelectId;
    this.dataService.loadItems({ page: this.currentPage, limit: this.pageSize, search: this.searchTerm || undefined });
  }

  get totalPages():     number { return Math.max(1, Math.ceil(this.totalItems / this.pageSize)); }
  get pageRangeStart(): number { return this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():   number { return Math.min(this.currentPage * this.pageSize, this.totalItems); }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => { this.currentPage = 1; this.loadItems(); }, 400);
  }
  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.currentPage = p; this.loadItems(); } }
  onPageSizeChange(s: number | string): void { this.pageSize = +s; this.currentPage = 1; this.loadItems(); }

  statusClass(s: string): string {
    switch (s) {
      case 'In Stock':     return 'bg-green-100 text-green-800';
      case 'Low Stock':    return 'bg-yellow-100 text-yellow-800';
      case 'Out of Stock': return 'bg-red-100 text-red-800';
      case 'Expired':      return 'bg-purple-100 text-purple-800';
      default:             return 'bg-gray-100 text-gray-800';
    }
  }

  // ── Filter popup ─────────────────────────────────────────────────
  openFilterPopup(): void { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }

  applyFilters(): void { this.applied = { ...this.draft }; this.filterPopupOpen = false; }

  clearAllFilters(): void {
    const def = {
      qty: 'All', type: 'All',
      expiryLtValue: '' as string,
      expiryLtUnit: 'Months' as 'Days' | 'Weeks' | 'Months' | 'Years',
      expiryMode: 'specific' as const,
      expiryDate: '', expiryFrom: '', expiryTo: '', includeNoExpiry: false,
      statusInStock: false, statusLowStock: false, statusExpired: false,
    };
    this.draft = { ...def };
    this.applied = { ...def };
    this.filterPopupOpen = false;
  }

  onExpiryLtInput(): void { this.draft.expiryDate = ''; this.draft.expiryFrom = ''; this.draft.expiryTo = ''; }
  onExpiryDateInput(): void { this.draft.expiryLtValue = ''; }

  get filteredItems(): InventoryItem[] {
    const a = this.applied;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const hasLtFilter   = !!a.expiryLtValue && !isNaN(+a.expiryLtValue) && +a.expiryLtValue > 0;
    const hasDateFilter = !!a.expiryDate || !!a.expiryFrom || !!a.expiryTo;
    const hasExpiryFilter = hasLtFilter || hasDateFilter;

    return this.items.filter(item => {
      const qty = item.quantityInStock;
      if (a.qty === 'Less than 10'  && !(qty < 10))   return false;
      if (a.qty === 'Less than 50'  && !(qty < 50))   return false;
      if (a.qty === 'Less than 100' && !(qty < 100))  return false;
      if (a.qty === '50 or more'    && !(qty >= 50))  return false;
      if (a.qty === '100 or more'   && !(qty >= 100)) return false;

      if (a.type !== 'All' && item.category !== a.type) return false;

      const hasStatusFilter = a.statusInStock || a.statusLowStock || a.statusExpired;
      if (hasStatusFilter) {
        if (!((a.statusInStock  && item.status === 'In Stock') ||
              (a.statusLowStock && item.status === 'Low Stock') ||
              (a.statusExpired  && item.status === 'Expired'))) return false;
      }

      if (hasExpiryFilter) {
        const expDate = item.expiryDateRaw === '—' ? null : new Date(item.expiryDateRaw);
        if (!expDate) {
          if (!a.includeNoExpiry) return false;
        } else {
          if (hasLtFilter) {
            const val = +a.expiryLtValue;
            let cutoff: Date;
            switch (a.expiryLtUnit) {
              case 'Days':  cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + val);     break;
              case 'Weeks': cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + val * 7); break;
              case 'Years': cutoff = new Date(today.getFullYear() + val, today.getMonth(), today.getDate());     break;
              default:      cutoff = new Date(today.getFullYear(), today.getMonth() + val, today.getDate());     break;
            }
            if (!(expDate > today && expDate <= cutoff)) return false;
          }
          if (hasDateFilter) {
            if (a.expiryMode === 'specific' && a.expiryDate) {
              const d = new Date(a.expiryDate); d.setHours(0, 0, 0, 0);
              if (expDate.getTime() !== d.getTime()) return false;
            }
            if (a.expiryMode === 'range') {
              if (a.expiryFrom) { const f = new Date(a.expiryFrom); f.setHours(0,0,0,0); if (expDate < f) return false; }
              if (a.expiryTo)   { const t = new Date(a.expiryTo);   t.setHours(0,0,0,0); if (expDate > t) return false; }
            }
          }
        }
      }
      return true;
    });
  }

  get hasActiveFilters(): boolean {
    const a = this.applied;
    return a.qty !== 'All' || a.type !== 'All' ||
      a.statusInStock || a.statusLowStock || a.statusExpired ||
      !!a.expiryLtValue || !!a.expiryDate || !!a.expiryFrom || !!a.expiryTo || a.includeNoExpiry;
  }

  get filteredCount(): number { return this.filteredItems.length; }

  // ── Shared helpers ───────────────────────────────────────────────
  private loadAllItems(): void {
    this.inventoryService.getItems({ limit: 500 }).subscribe({
      next: (res: any) => {
        this.allItems = (res.data?.rows ?? []).map((r: any) => ({ item_id: r.item_id, item_name: r.item_name }));
      },
    });
  }

  private showToast(type: 'success' | 'error' | 'warning', message: string): void {
    clearTimeout(this.toastTimer);
    this.toast = { type, message };
    this.toastTimer = setTimeout(() => { this.toast = null; }, 4500);
  }

  // ── Deposit ──────────────────────────────────────────────────────
  openDepositModal(): void {
    this.depositStaged = []; this.depositItemId = null; this.depositQty = 1; this.depositExpireDate = '';
    this.showDepositModal = true;
    this.loadAllItems();
  }
  closeDepositModal(): void { this.showDepositModal = false; }

  addToDepositStaged(): void {
    if (!this.depositItemId) return;
    const found = this.allItems.find(i => i.item_id === +this.depositItemId!);
    if (!found) return;
    // Each staging entry is its own batch — do NOT merge duplicates.
    this.depositStaged.push({ itemId: found.item_id, itemName: found.item_name, quantity: this.depositQty, expireDate: this.depositExpireDate });
    this.depositItemId = null; this.depositQty = 1; this.depositExpireDate = '';
  }
  removeDepositStaged(idx: number): void { this.depositStaged.splice(idx, 1); }

  confirmDeposit(): void {
    if (!this.depositStaged.length) return;
    this.depositLoading = true;

    const calls = this.depositStaged.map(s =>
      this.inventoryService.depositItem(s.itemId, {
        quantity:    s.quantity,
        expire_date: s.expireDate || null,
      })
    );

    forkJoin(calls).subscribe({
      next: () => {
        this.depositLoading = false;
        this.closeDepositModal();
        this.showToast('success', 'Deposit completed.');
        // Invalidate batch cache; re-fetch immediately if the affected item is expanded.
        const affectedIds = [...new Set(this.depositStaged.map(s => s.itemId))];
        for (const id of affectedIds) {
          this.batchCache.delete(id);
          if (this.expandedItemId === id) {
            this.inventoryService.getItemBatches(id).subscribe({
              next: batches => this.batchCache.set(id, batches),
              error: ()      => this.batchCache.set(id, []),
            });
          }
        }
        this.loadItems();
      },
      error: () => {
        this.depositLoading = false;
        this.showToast('error', 'Deposit failed. Please try again.');
      },
    });
  }

  // ── Withdraw ─────────────────────────────────────────────────────
  openWithdrawModal(): void {
    this.withdrawStaged = []; this.withdrawItemId = null; this.withdrawQty = 1;
    this.withdrawEmpSearch = ''; this.withdrawSelectedEmp = null; this.withdrawEmpList = []; this.withdrawEmpListOpen = false;
    this.showWithdrawModal = true;
    this.loadAllItems();
  }
  closeWithdrawModal(): void { this.showWithdrawModal = false; }

  addToWithdrawStaged(): void {
    if (!this.withdrawItemId) return;
    const found = this.allItems.find(i => i.item_id === +this.withdrawItemId!);
    if (!found) return;
    const ex = this.withdrawStaged.find(s => s.itemId === found.item_id);
    if (ex) { ex.quantity += this.withdrawQty; }
    else     { this.withdrawStaged.push({ itemId: found.item_id, itemName: found.item_name, quantity: this.withdrawQty, expireDate: '' }); }
    this.withdrawItemId = null; this.withdrawQty = 1;
  }
  removeWithdrawStaged(id: number): void { this.withdrawStaged = this.withdrawStaged.filter(s => s.itemId !== id); }

  private updateEmpDropdownPosition(): void {
    const el = this.empSearchInputRef?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.empDropdownStyle = { top: `${rect.bottom + 4}px`, left: `${rect.left}px`, width: `${rect.width}px` };
  }

  onEmpSearch(): void {
    this.withdrawSelectedEmp = null;
    clearTimeout(this.employeeDebounce);
    if (!this.withdrawEmpSearch.trim()) { this.withdrawEmpList = []; this.withdrawEmpListOpen = false; return; }
    this.employeeDebounce = setTimeout(() => {
      this.inventoryService.getEmployees(this.withdrawEmpSearch).subscribe({
        next: (res: any) => {
          this.withdrawEmpList = (res.data?.rows ?? []).map((r: any) => ({ userId: r.user_id, fullName: r.full_name, roleName: r.role_name }));
          this.updateEmpDropdownPosition();
          this.withdrawEmpListOpen = true;
        },
      });
    }, 300);
  }

  selectEmp(emp: Employee): void { this.withdrawSelectedEmp = emp; this.withdrawEmpSearch = emp.fullName; this.withdrawEmpListOpen = false; }

  confirmWithdraw(): void {
    if (!this.withdrawStaged.length || !this.withdrawSelectedEmp) return;
    this.withdrawLoading = true;
    const emp = this.withdrawSelectedEmp;

    const calls = this.withdrawStaged.map(s =>
      this.inventoryService.withdrawItem(s.itemId, {
        quantity: s.quantity,
        notes:    `Withdrawn by ${emp.fullName}`,
      })
    );

    forkJoin(calls).subscribe({
      next: (results: any[]) => {
        this.withdrawLoading = false;
        this.closeWithdrawModal();
        // Invalidate batch cache; re-fetch immediately if the affected item is expanded.
        const affectedIds = [...new Set(this.withdrawStaged.map(s => s.itemId))];
        for (const id of affectedIds) {
          this.batchCache.delete(id);
          if (this.expandedItemId === id) {
            this.inventoryService.getItemBatches(id).subscribe({
              next: batches => this.batchCache.set(id, batches),
              error: ()      => this.batchCache.set(id, []),
            });
          }
        }
        const totalBatches = results.reduce((sum, r) => sum + (r?.data?.consumed?.length ?? 0), 0);
        this.showToast('success', `Withdrawal completed. Consumed from ${totalBatches} batch(es).`);
        this.loadItems();
      },
      error: (err: any) => {
        this.withdrawLoading = false;
        const is409 = err?.status === 409;
        const msg   = is409
          ? (err?.error?.error ?? 'Insufficient stock for one or more items.')
          : 'Withdrawal failed. Please try again.';
        this.showToast(is409 ? 'warning' : 'error', msg);
      },
    });
  }

  // ── Register ─────────────────────────────────────────────────────
  openRegisterModal(): void {
    this.registerForm = { itemName: '', category: '', supplier: '', unitCost: null, lowStockLimit: 1 };
    this.showRegisterModal = true;
  }
  closeRegisterModal(): void { this.showRegisterModal = false; }

  confirmRegister(): void {
    const f = this.registerForm;
    if (!f.itemName || !f.category || !f.lowStockLimit) return;
    this.registerLoading = true;
    this.inventoryService.registerItem(f).subscribe({
      next: (res: any) => {
        this.registerLoading = false;
        this.closeRegisterModal();
        this.showToast('success', 'Item registered.');

        const newItemId: number = res?.data?.item_id ?? res?.data?.id ?? 0;
        this.dataService.logHistory({
          inventoryItemId: newItemId,
          itemName:        f.itemName.trim(),
          action:          'Register',
          quantityChanged: 0,
          quantityBefore:  0,
          quantityAfter:   0,
          performedBy:     'Inventory Manager',
          date:            new Date(),
          notes:           `New item registered: ${f.itemName.trim()}.`,
        });

        this.loadItems();
      },
      error: () => { this.registerLoading = false; this.showToast('error', 'Registration failed. Please try again.'); },
    });
  }
}
