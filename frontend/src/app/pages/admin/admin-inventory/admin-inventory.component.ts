import { Component, OnDestroy, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { InventoryService } from '../../../services/inventory.service';
import { timeUntilExpiry } from '../../../utils/time.util';

type ItemStatus = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Expired';

interface InventoryItem {
  id: string;
  name: string;
  type: string;
  quantity: number;
  lowStockLimit: number;
  expireDate: string;
  expireDateRaw: string;
  registerDate: string;
  assignedBy: string;
  status: ItemStatus;
  supplier: string;
  cost: string;
}

interface StagedItem  { itemId: number; itemName: string; quantity: number; expireDate: string; }
interface Employee    { userId: number; fullName: string; roleName: string; }
interface AllItem     { item_id: number; item_name: string; }

@Component({
  standalone: false,
  selector: 'app-admin-inventory',
  templateUrl: './admin-inventory.component.html',
})
export class AdminInventoryComponent implements OnInit, OnDestroy {
  selectedItem: InventoryItem | null = null;
  searchTerm = '';

  items: InventoryItem[] = [];
  currentPage     = 1;
  pageSize        = 10;
  totalItems      = 0;
  pageSizeOptions = [10, 25, 50];

  // ── Filter popup ─────────────────────────────────────────────────
  filterPopupOpen = false;
  draft = {
    qty: 'All', type: 'All',
    expiryLtValue: '' as string,
    expiryLtUnit: 'Months' as 'Days' | 'Weeks' | 'Months' | 'Years',
    expiryMode: 'specific' as 'specific' | 'range',
    expiryDate: '', expiryFrom: '', expiryTo: '',
    includeNoExpiry: false,
  };
  applied = { ...this.draft };

  private searchDebounce?: ReturnType<typeof setTimeout>;
  private employeeDebounce?: ReturnType<typeof setTimeout>;

  // Shared modal data
  allItems: AllItem[] = [];

  // Toast
  toast: { type: 'success' | 'error' | 'warning'; message: string } | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;

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

  // ── Register Modal ───────────────────────────────────────────────
  showRegisterModal  = false;
  registerLoading    = false;
  registerForm = {
    itemName: '', category: '', supplier: '',
    unitCost: null as number | null,
    lowStockLimit: 1,
  };
  readonly categories = ['Consumable', 'Equipment', 'Medication', 'Tool / Instrument', 'Protective Gear'];

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void  { this.loadItems(); }
  ngOnDestroy(): void {
    clearTimeout(this.searchDebounce);
    clearTimeout(this.employeeDebounce);
    clearTimeout(this.toastTimer);
  }

  // ── Table ────────────────────────────────────────────────────────
  loadItems(): void {
    this.inventoryService.getItems({ page: this.currentPage, limit: this.pageSize, search: this.searchTerm || undefined })
      .subscribe({
        next: (res: any) => {
          this.totalItems = res.data?.total ?? 0;
          this.items = (res.data?.rows ?? []).map((r: any) => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const expiry = r.soonest_expire_date ? new Date(r.soonest_expire_date) : null;
            let status: ItemStatus = 'In Stock';
            if (expiry && expiry < today)                      status = 'Expired';
            else if (r.quantity_on_hand === 0)                 status = 'Out of Stock';
            else if (r.quantity_on_hand <= r.low_stock_limit)  status = 'Low Stock';
            return {
              id: String(r.item_id),
              name: r.item_name ?? '—',
              type: r.category ?? '—',
              quantity: r.quantity_on_hand ?? 0,
              lowStockLimit: r.low_stock_limit ?? 0,
              expireDate:    timeUntilExpiry(r.soonest_expire_date),
              expireDateRaw: r.soonest_expire_date ? new Date(r.soonest_expire_date).toISOString() : '—',
              registerDate:  r.register_date ? new Date(r.register_date).toLocaleDateString() : '—',
              assignedBy:    r.assigned_by_email ?? '—',
              status,
              supplier: r.supplier ?? '—',
              cost:     r.unit_cost != null ? String(r.unit_cost) : '—',
            };
          });
        },
        error: () => { this.items = []; this.totalItems = 0; },
      });
  }

  get totalPages():    number { return Math.max(1, Math.ceil(this.totalItems / this.pageSize)); }
  get pageRangeStart():number { return this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():  number { return Math.min(this.currentPage * this.pageSize, this.totalItems); }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => { this.currentPage = 1; this.loadItems(); }, 400);
  }
  goToPage(p: number): void { if (p >= 1 && p <= this.totalPages) { this.currentPage = p; this.loadItems(); } }
  onPageSizeChange(s: number | string): void { this.pageSize = +s; this.currentPage = 1; this.loadItems(); }

  statusClass(s: string): string {
    switch (s) {
      case 'In Stock':     return 'text-green-800 bg-green-100';
      case 'Low Stock':    return 'text-yellow-800 bg-yellow-100';
      case 'Out of Stock': return 'text-red-800 bg-red-100';
      case 'Expired':      return 'text-purple-800 bg-purple-100';
      default:             return 'text-gray-800 bg-gray-100';
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
    };
    this.draft = { ...def };
    this.applied = { ...def };
    this.filterPopupOpen = false;
  }

  onExpiryLtInput(): void {
    this.draft.expiryDate = '';
    this.draft.expiryFrom = '';
    this.draft.expiryTo   = '';
  }

  onExpiryDateInput(): void { this.draft.expiryLtValue = ''; }

  get filteredItems(): InventoryItem[] {
    const a = this.applied;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const hasLtFilter = !!a.expiryLtValue && !isNaN(+a.expiryLtValue) && +a.expiryLtValue > 0;
    const hasDateFilter = !!a.expiryDate || !!a.expiryFrom || !!a.expiryTo;
    const hasExpiryFilter = hasLtFilter || hasDateFilter;

    return this.items.filter(item => {
      const qty = item.quantity;
      if (a.qty === 'Less than 10'  && !(qty < 10))   return false;
      if (a.qty === 'Less than 50'  && !(qty < 50))   return false;
      if (a.qty === 'Less than 100' && !(qty < 100))  return false;
      if (a.qty === '50 or more'    && !(qty >= 50))  return false;
      if (a.qty === '100 or more'   && !(qty >= 100)) return false;

      if (a.type !== 'All' && item.type !== a.type) return false;

      if (hasExpiryFilter) {
        const expDate = item.expireDateRaw === '—' ? null : new Date(item.expireDateRaw);
        if (!expDate) {
          if (!a.includeNoExpiry) return false;
        } else {
          if (hasLtFilter) {
            const val = +a.expiryLtValue;
            let cutoff: Date;
            switch (a.expiryLtUnit) {
              case 'Days':   cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + val); break;
              case 'Weeks':  cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + val * 7); break;
              case 'Years':  cutoff = new Date(today.getFullYear() + val, today.getMonth(), today.getDate()); break;
              default:       cutoff = new Date(today.getFullYear(), today.getMonth() + val, today.getDate()); break;
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
    const ex = this.depositStaged.find(s => s.itemId === found.item_id);
    if (ex) { ex.quantity += this.depositQty; ex.expireDate = this.depositExpireDate; }
    else     { this.depositStaged.push({ itemId: found.item_id, itemName: found.item_name, quantity: this.depositQty, expireDate: this.depositExpireDate }); }
    this.depositItemId = null; this.depositQty = 1; this.depositExpireDate = '';
  }
  removeDepositStaged(id: number): void { this.depositStaged = this.depositStaged.filter(s => s.itemId !== id); }

  confirmDeposit(): void {
    if (!this.depositStaged.length) return;
    this.depositLoading = true;
    forkJoin(this.depositStaged.map(s =>
      this.inventoryService.depositItem(s.itemId, { quantity: s.quantity, expire_date: s.expireDate || null })
    )).subscribe({
      next: () => { this.depositLoading = false; this.closeDepositModal(); this.showToast('success', 'Deposit completed.'); this.loadItems(); },
      error: () => { this.depositLoading = false; this.showToast('error', 'Deposit failed. Please try again.'); },
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

  onEmpSearch(): void {
    this.withdrawSelectedEmp = null;
    clearTimeout(this.employeeDebounce);
    if (!this.withdrawEmpSearch.trim()) { this.withdrawEmpList = []; this.withdrawEmpListOpen = false; return; }
    this.employeeDebounce = setTimeout(() => {
      this.inventoryService.getEmployees(this.withdrawEmpSearch).subscribe({
        next: (res: any) => {
          this.withdrawEmpList = (res.data?.rows ?? []).map((r: any) => ({ userId: r.user_id, fullName: r.full_name, roleName: r.role_name }));
          this.withdrawEmpListOpen = true;
        },
      });
    }, 300);
  }
  selectEmp(emp: Employee): void {
    this.withdrawSelectedEmp = emp; this.withdrawEmpSearch = emp.fullName; this.withdrawEmpListOpen = false;
  }

  confirmWithdraw(): void {
    if (!this.withdrawStaged.length || !this.withdrawSelectedEmp) return;
    this.withdrawLoading = true;
    const emp = this.withdrawSelectedEmp;
    forkJoin(this.withdrawStaged.map(s =>
      this.inventoryService.withdrawItem(s.itemId, { quantity: s.quantity, notes: `Withdrawn by ${emp.fullName}` })
    )).subscribe({
      next: (results: any[]) => {
        this.withdrawLoading = false;
        this.closeWithdrawModal();
        const totalBatches = results.reduce((sum, r) => sum + (r?.data?.consumed?.length ?? 0), 0);
        this.showToast('success', `Withdrawal completed. Consumed from ${totalBatches} batch(es).`);
        this.loadItems();
      },
      error: (err: any) => {
        this.withdrawLoading = false;
        const is409 = err?.status === 409;
        this.showToast(is409 ? 'warning' : 'error', is409 ? (err?.error?.error ?? 'Insufficient stock.') : 'Withdrawal failed. Please try again.');
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
      next: () => { this.registerLoading = false; this.closeRegisterModal(); this.showToast('success', 'Item registered.'); this.loadItems(); },
      error: () => { this.registerLoading = false; this.showToast('error', 'Registration failed. Please try again.'); },
    });
  }
}
