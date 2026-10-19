import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuditService } from '../../../services/audit.service';
import { DashboardService } from '../../../services/dashboard.service';
import { AdminStatsService, ActiveUsersStats } from '../../../core/services/admin-stats.service';
import { timeAgo } from '../../../utils/time.util';

interface RecentLog {
  description: string;
  eventType:   string;
  timeAgo:     string;
  userEmail:   string;
  roleName:    string;
  status:      string;
}

@Component({
  standalone: false,
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  // Active users — driven by live polling via AdminStatsService
  activeUsersStats: ActiveUsersStats | null = null;
  activeUsersError = false;

  // Other daily report stats (unchanged)
  appointmentsToday = 0;
  pendingApprovals  = 0;
  lowStockItems     = 0;

  recentLogs: RecentLog[] = [];

  // System performance
  cpuPercent    = 0;
  cpuCoreCount  = 0;
  cpuSpeedMHz   = 0;
  cpuHistory:    number[] = [];

  memoryPercent = 0;
  memoryUsedGB  = 0;
  memoryTotalGB = 0;
  memoryHistory: number[] = [];

  diskPercent   = 0;
  diskTotalGB   = 0;
  diskFreeGB    = 0;

  perfLoading = true;

  private readonly GAUGE_CIRCUMFERENCE = 238.76; // 2π × r38
  private readonly MAX_HISTORY         = 20;
  private readonly POLL_INTERVAL_MS    = 5000;
  private perfInterval?: ReturnType<typeof setInterval>;
  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private auditService: AuditService,
    private dashboardService: DashboardService,
    private adminStatsService: AdminStatsService,
  ) {}

  ngOnInit(): void {
    // Active users: 15s polling stream
    this.adminStatsService
      .streamActiveUsers(15_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.activeUsersStats  = res.data;
          this.activeUsersError  = false;
        },
        error: (err) => {
          console.error('[AdminDashboard] active-users error:', err);
          this.activeUsersError = true;
        },
      });

    // Other stats remain as a one-time fetch
    this.dashboardService.getAdminStats().subscribe({
      next: (res: any) => {
        const d = res.data ?? {};
        this.appointmentsToday = d.appointmentsToday ?? 0;
        this.pendingApprovals  = d.pendingApprovals  ?? 0;
        this.lowStockItems     = d.lowStockItems     ?? 0;
      },
      error: (err) => console.error('[AdminDashboard] stats error:', err),
    });

    this.auditService.getLogs({ limit: 3, page: 1 }).subscribe({
      next: (res: any) => {
        this.recentLogs = (res.data?.rows ?? []).map((r: any) => ({
          description: r.event_description ?? r.details ?? '—',
          eventType:   r.event_type ?? '—',
          timeAgo:     timeAgo(r.timestamp),
          userEmail:   r.user_email ?? '—',
          roleName:    r.role_name ?? '—',
          status:      r.operation_status ?? 'Success',
        }));
      },
    });

    this.fetchSystemPerformance();
    this.perfInterval = setInterval(() => this.fetchSystemPerformance(), this.POLL_INTERVAL_MS);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.perfInterval) clearInterval(this.perfInterval);
  }

  private fetchSystemPerformance(): void {
    this.dashboardService.getSystemPerformance().subscribe({
      next: (res: any) => {
        const d = res.data ?? {};

        this.cpuPercent   = d.cpu?.usedPercent ?? 0;
        this.cpuCoreCount = d.cpu?.coreCount   ?? 0;
        this.cpuSpeedMHz  = d.cpu?.speedMHz    ?? 0;
        this.cpuHistory   = [...this.cpuHistory, this.cpuPercent].slice(-this.MAX_HISTORY);

        this.memoryPercent = d.memory?.usedPercent ?? 0;
        this.memoryUsedGB  = d.memory?.usedGB      ?? 0;
        this.memoryTotalGB = d.memory?.totalGB     ?? 0;
        this.memoryHistory = [...this.memoryHistory, this.memoryPercent].slice(-this.MAX_HISTORY);

        this.diskPercent = d.disk?.usedPercent ?? 0;
        this.diskTotalGB = d.disk?.totalGB     ?? 0;
        this.diskFreeGB  = d.disk?.freeGB      ?? 0;

        this.perfLoading = false;
      },
      error: () => { this.perfLoading = false; },
    });
  }

  gaugeOffset(percent: number): number {
    return this.GAUGE_CIRCUMFERENCE * (1 - Math.min(Math.max(percent, 0), 100) / 100);
  }

  getSparklinePoints(history: number[]): string {
    if (history.length < 2) return '';
    const w = 100, h = 40, pad = 3;
    return history.map((v, i) => {
      const x = pad + (i / (history.length - 1)) * (w - pad * 2);
      const y = h - pad - (Math.min(v, 100) / 100) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  goToHistory(): void {
    this.router.navigate(['/admin/history']);
  }
}
