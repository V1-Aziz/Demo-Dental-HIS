import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { InventoryService } from '../../../services/inventory.service';
import { LatestActivityRow } from '../../../models/inventory.models';

@Component({
  standalone: false,
  selector: 'app-inventory-manager-dashboard',
  templateUrl: './inventory-manager-dashboard.component.html',
})
export class InventoryManagerDashboardComponent implements OnInit, OnDestroy {
  latestActivity: LatestActivityRow[] = [];
  isLoading      = false;
  loadError: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private router:           Router,
    private inventoryService: InventoryService,
  ) {}

  ngOnInit(): void {
    this.loadLatestActivity();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadLatestActivity(): void {
    this.isLoading = true;
    this.loadError = null;
    this.inventoryService.getLatestActivity(5)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: rows => {
          this.latestActivity = rows;
          this.isLoading      = false;
        },
        error: err => {
          this.latestActivity = [];
          this.loadError      = err?.error?.message ?? 'Failed to load latest activity.';
          this.isLoading      = false;
        },
      });
  }

  actionLabel(row: LatestActivityRow): string {
    if (row.source_kind === 'transaction') {
      return row.action === 'Reject' ? 'Rejected Request' : row.action;
    }
    return row.action === 'Expired' ? 'Expired (Removed)' : 'Out of Stock (Removed)';
  }

  actionBadgeClass(row: LatestActivityRow): string {
    if (row.source_kind === 'transaction') {
      if (row.action === 'Deposit')  return 'bg-green-100 text-green-800';
      if (row.action === 'Withdraw') return 'bg-red-100 text-red-800';
      return 'bg-gray-100 text-gray-600';           // Reject
    }
    return row.action === 'Expired'
      ? 'bg-red-100 text-red-800'
      : 'bg-orange-100 text-orange-800';            // Out of Stock
  }

  qtyDisplay(row: LatestActivityRow): string {
    if (row.source_kind === 'removal' && row.action === 'Out of Stock') return '—';
    if (row.source_kind === 'transaction' && row.action === 'Reject')   return '—';
    if (row.source_kind === 'transaction') {
      return row.action === 'Deposit' ? `+${row.quantity}` : `-${row.quantity}`;
    }
    return row.quantity != null ? `-${row.quantity}` : '—';
  }

  qtyClass(row: LatestActivityRow): string {
    if (row.source_kind === 'removal' && row.action === 'Out of Stock') return 'text-gray-400';
    if (row.source_kind === 'transaction' && row.action === 'Reject')   return 'text-gray-400';
    if (row.source_kind === 'transaction' && row.action === 'Deposit')  return 'text-[#3B6D11] font-medium';
    if (row.source_kind === 'removal' && row.quantity == null)          return 'text-gray-400';
    return 'text-[#A32D2D] font-medium';
  }

  formatWhen(isoStr: string): string {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Riyadh',
    }).format(d);
  }

  navigateToHistory(row: LatestActivityRow): void {
    const tab = row.source_kind === 'removal' ? 'removed' : 'activity';
    this.router.navigate(['/inventory-manager/history'], { queryParams: { tab } });
  }

  goToInventory(): void { this.router.navigate(['/inventory-manager/inventory']); }
  goToRequests():  void { this.router.navigate(['/inventory-manager/requests']);  }
  goToHistory():   void {
    this.router.navigate(['/inventory-manager/history'], { queryParams: { tab: 'activity' } });
  }
}
