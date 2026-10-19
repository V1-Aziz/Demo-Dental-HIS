// Layout shell for the Admin portal.
import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { NotificationService, AppNotification } from '../../../services/notification.service';
import { notifIcon, notifColor } from '../../../shared/utils/notification-icon.util';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

@Component({
  standalone: false,
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  isSidebarOpen = false;
  currentPath = '';

  notifOpen = false;
  notifications: AppNotification[] = [];
  unreadCount = 0;
  private countSub?: Subscription;

  readonly menuItems: MenuItem[] = [
    { id: 'dashboard',       label: 'Dashboard',          icon: 'dashboard',  route: '/admin/dashboard' },
    { id: 'users',           label: 'User Management',    icon: 'people',     route: '/admin/users' },
    { id: 'patients',        label: 'Patient Files',      icon: 'folder',     route: '/admin/patients' },
    { id: 'inventory',       label: 'Inventory',          icon: 'inventory',  route: '/admin/inventory' },
    { id: 'reports',         label: 'Operational Reports',icon: 'bar_chart',  route: '/admin/reports' },
    { id: 'system-settings', label: 'System Settings',   icon: 'settings',   route: '/admin/system-settings' },
    { id: 'history',         label: 'History Log',        icon: 'history',    route: '/admin/history' },
  ];

  readonly pageTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard:       { title: 'System Overview',         subtitle: 'Monitor key metrics and system performance.' },
    users:           { title: 'User Management',         subtitle: 'Manage users, roles, and permissions.' },
    patients:        { title: 'Patient Files',           subtitle: 'Access and manage patient records.' },
    inventory:       { title: 'Inventory Management',    subtitle: 'Track stock levels and supplies.' },
    reports:         { title: 'Operational Reports',     subtitle: 'Generate and analyze key performance indicators.' },
    'system-settings': { title: 'System Settings',      subtitle: 'Manage registrations, dropdowns, and system-wide configuration.' },
    history:         { title: 'Log History',             subtitle: 'Track all system and user activities.' },
  };

  constructor(
    private router: Router,
    private auth: AuthService,
    private notifService: NotificationService,
  ) {}

  ngOnInit(): void {
    this.currentPath = this.router.url.split('/')[2] || 'dashboard';
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentPath = e.urlAfterRedirects.split('/')[2] || 'dashboard';
      this.isSidebarOpen = false;
    });

    this.notifService.startPolling();
    this.countSub = this.notifService.unreadCount$.subscribe(c => (this.unreadCount = c));
  }

  ngOnDestroy(): void {
    this.notifService.stopPolling();
    this.countSub?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.notif-panel') && !target.closest('.notif-bell')) {
      this.notifOpen = false;
    }
  }

  toggleNotif(): void {
    this.notifOpen = !this.notifOpen;
    if (this.notifOpen) this.loadNotifications();
  }

  private loadNotifications(): void {
    this.notifService.getNotifications({ limit: 10 }).subscribe({
      next: (res: any) => {
        const dismissed = this.notifService.getDismissedIds();
        this.notifications = (res.data?.rows ?? []).filter(
          (n: AppNotification) => !dismissed.has(n.notification_id),
        );
      },
      error: () => {},
    });
  }

  markRead(n: AppNotification): void {
    if (n.is_read) return;
    this.notifService.markRead(n.notification_id).subscribe();
    n.is_read = true;
    this.unreadCount = Math.max(0, this.unreadCount - 1);
  }

  markAllRead(): void {
    this.notifService.markAllRead().subscribe();
    this.notifications.forEach(n => (n.is_read = true));
    this.unreadCount = 0;
  }

  dismiss(n: AppNotification, event: Event): void {
    event.stopPropagation();
    this.notifService.dismissLocally(n.notification_id);
    this.notifications = this.notifications.filter(x => x.notification_id !== n.notification_id);
    if (!n.is_read) this.unreadCount = Math.max(0, this.unreadCount - 1);
  }

  readonly notifIcon  = notifIcon;
  readonly notifColor = notifColor;

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  get pageTitle(): string    { return this.pageTitles[this.currentPath]?.title    ?? ''; }
  get pageSubtitle(): string { return this.pageTitles[this.currentPath]?.subtitle ?? ''; }
  isActive(item: MenuItem): boolean { return this.currentPath === item.id; }
  navigate(item: MenuItem): void    { this.router.navigate([item.route]); }
  logout(): void                    { this.auth.logout(); }
}
