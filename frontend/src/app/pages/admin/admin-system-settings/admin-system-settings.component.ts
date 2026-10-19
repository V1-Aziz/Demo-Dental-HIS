import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { filter, startWith, switchMap } from 'rxjs/operators';
import { PendingRegistrationService } from '../../../services/pending-registration.service';

@Component({
  standalone: false,
  selector: 'app-admin-system-settings',
  templateUrl: './admin-system-settings.component.html',
})
export class AdminSystemSettingsComponent implements OnInit, OnDestroy {
  pendingCount = 0;
  activeTab = 'pending-approvals';
  private sub?: Subscription;

  constructor(
    private router: Router,
    private pendingSvc: PendingRegistrationService,
  ) {}

  ngOnInit(): void {
    this.setActiveTab(this.router.url);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.setActiveTab(e.urlAfterRedirects));

    // Poll pending count every 60 seconds
    this.sub = interval(60_000)
      .pipe(
        startWith(0),
        switchMap(() => this.pendingSvc.getPendingCount()),
      )
      .subscribe({
        next: res => { this.pendingCount = res.data?.count ?? 0; },
        error: () => {},
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private setActiveTab(url: string): void {
    if (url.includes('dropdowns')) {
      this.activeTab = 'dropdowns';
    } else {
      this.activeTab = 'pending-approvals';
    }
  }

  navigate(tab: string): void {
    this.router.navigate(['/admin/system-settings', tab]);
  }
}
