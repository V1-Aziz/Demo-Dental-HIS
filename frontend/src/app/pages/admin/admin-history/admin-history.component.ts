import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { AuditService } from '../../../services/audit.service';

@Component({
  standalone: false,
  selector: 'app-admin-history',
  templateUrl: './admin-history.component.html',
})
export class AdminHistoryComponent implements OnInit, OnDestroy {
  searchTerm = '';
  selectedRole = '';
  selectedAction = '';
  selectedDate = '';

  logs: any[] = [];
  loading = false;
  page = 1;
  limit = 10;
  total = 0;
  pageSizeOptions = [10, 25, 50];

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(private auditService: AuditService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.page = 1;
      this.loadLogs();
    });
    this.loadLogs();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  onFilterChange(): void {
    this.page = 1;
    this.loadLogs();
  }

  loadLogs(): void {
    this.loading = true;
    this.auditService.getLogs({
      search: this.searchTerm,
      role: this.selectedRole,
      action: this.selectedAction,
      date: this.selectedDate,
      page: this.page,
      limit: this.limit,
    }).subscribe({
      next: (res: any) => {
        this.total = res.data?.total ?? 0;
        this.logs = (res.data?.rows ?? []).map((r: any) => ({
          eventId: r.event_id,
          eventType: r.event_type,
          description: r.event_description,
          details: r.details,
          status: r.operation_status,
          timestamp: r.timestamp ? new Date(r.timestamp).toLocaleString() : '—',
          userEmail: r.user_email,
          role: r.role_name,
          patientId: r.patient_id,
          ...this.getIconConfig(r.event_type),
        }));
        this.loading = false;
      },
      error: () => {
        this.logs = [];
        this.loading = false;
      },
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }

  get pageRangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.limit + 1;
  }

  get pageRangeEnd(): number {
    return Math.min(this.page * this.limit, this.total);
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages) return;
    this.page = p;
    this.loadLogs();
  }

  onPageSizeChange(size: number | string): void {
    this.limit = +size;
    this.page  = 1;
    this.loadLogs();
  }

  private getIconConfig(eventType: string): { icon: string; iconBg: string; iconText: string } {
    const t = (eventType ?? '').toLowerCase();
    if (t.includes('login') || t.includes('logout'))
      return { icon: 'login', iconBg: 'bg-yellow-100', iconText: 'text-yellow-600' };
    if (t.includes('delete') || t.includes('remov'))
      return { icon: 'delete', iconBg: 'bg-red-100', iconText: 'text-red-600' };
    if (t.includes('creat') || t.includes('add') || t.includes('register'))
      return { icon: 'add_circle', iconBg: 'bg-green-100', iconText: 'text-green-600' };
    if (t.includes('inventory'))
      return { icon: 'inventory_2', iconBg: 'bg-green-100', iconText: 'text-green-600' };
    return { icon: 'edit', iconBg: 'bg-blue-100', iconText: 'text-blue-600' };
  }
}
