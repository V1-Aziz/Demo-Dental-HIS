import { Component, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  PendingRegistrationService,
  PendingRegistrationItem,
} from '../../../../services/pending-registration.service';

@Component({
  standalone: false,
  selector: 'app-pending-approvals',
  templateUrl: './pending-approvals.component.html',
})
export class PendingApprovalsComponent implements OnInit {
  rows: PendingRegistrationItem[] = [];
  total = 0;
  isLoading = false;

  statusFilter = 'Pending';
  searchQuery = '';
  private search$ = new Subject<string>();

  selected: PendingRegistrationItem | null = null;
  detailLoading = false;

  // approve fields
  approveLoading = false;
  approveSupervisorId: number | null = null;
  approveHireDate = '';
  approveAcademicLevel = 1;

  // reject fields
  rejectLoading = false;
  rejectReason = '';
  showRejectForm = false;

  toast = '';
  toastType: 'success' | 'error' = 'success';

  readonly statusOptions = ['Pending', 'Approved', 'Rejected', 'All'];
  readonly STUDENT_ROLE = 'Student';

  constructor(private svc: PendingRegistrationService) {}

  ngOnInit(): void {
    this.loadList();
    this.search$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.loadList());
  }

  loadList(): void {
    this.isLoading = true;
    this.svc.list({ status: this.statusFilter, q: this.searchQuery || undefined }).subscribe({
      next: res => {
        this.rows  = res.data?.rows ?? [];
        this.total = res.data?.total ?? 0;
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; },
    });
  }

  onSearchChange(val: string): void {
    this.searchQuery = val;
    this.search$.next(val);
  }

  setStatus(s: string): void {
    this.statusFilter = s;
    this.selected = null;
    this.loadList();
  }

  selectRow(row: PendingRegistrationItem): void {
    if (this.selected?.registrationId === row.registrationId) {
      this.selected = null;
      return;
    }
    this.selected = row;
    this.showRejectForm = false;
    this.rejectReason = '';
    this.approveSupervisorId = null;
    this.approveHireDate = '';
    this.approveAcademicLevel = 1;
  }

  get primaryContact(): string {
    const p = this.selected?.contacts.find(c => c.isPrimary);
    return p ? `${p.contactType}: ${p.value}` : '—';
  }

  approve(): void {
    if (!this.selected) return;
    if (this.selected.requestedRoleName === this.STUDENT_ROLE && !this.approveSupervisorId) return;

    this.approveLoading = true;
    const payload: any = {};
    if (this.approveSupervisorId) payload.supervisingEmployeeId = this.approveSupervisorId;
    if (this.approveHireDate)     payload.hireDate = this.approveHireDate;
    if (this.selected.requestedRoleName === this.STUDENT_ROLE) {
      payload.academicLevel = this.approveAcademicLevel;
    }

    this.svc.approve(this.selected.registrationId, payload).subscribe({
      next: () => {
        this.approveLoading = false;
        this.showToast(`Account activated for ${this.selected!.firstName} ${this.selected!.lastName}`, 'success');
        this.selected = null;
        this.loadList();
      },
      error: (err) => {
        this.approveLoading = false;
        this.showToast(err?.error?.error ?? 'Approval failed', 'error');
      },
    });
  }

  reject(): void {
    if (!this.selected || this.rejectReason.trim().length < 5) return;
    this.rejectLoading = true;

    this.svc.reject(this.selected.registrationId, this.rejectReason.trim()).subscribe({
      next: () => {
        this.rejectLoading = false;
        this.showToast('Registration rejected', 'success');
        this.selected = null;
        this.showRejectForm = false;
        this.loadList();
      },
      error: (err) => {
        this.rejectLoading = false;
        this.showToast(err?.error?.error ?? 'Rejection failed', 'error');
      },
    });
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast = msg;
    this.toastType = type;
    setTimeout(() => (this.toast = ''), 4000);
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d}d ago` : new Date(dateStr).toLocaleDateString();
  }

  rolePillClass(role: string): string {
    const map: Record<string, string> = {
      Doctor: 'bg-blue-100 text-blue-700',
      Student: 'bg-green-100 text-green-700',
      Receptionist: 'bg-purple-100 text-purple-700',
      LabTechnician: 'bg-orange-100 text-orange-700',
      DentalAssistant: 'bg-pink-100 text-pink-700',
      InventoryManager: 'bg-yellow-100 text-yellow-700',
      Radiologist: 'bg-teal-100 text-teal-700',
    };
    return map[role] ?? 'bg-gray-100 text-gray-700';
  }

  statusPillClass(status: string): string {
    if (status === 'Pending')  return 'bg-amber-100 text-amber-700';
    if (status === 'Approved') return 'bg-green-100 text-green-700';
    if (status === 'Rejected') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  }

  get needsSupervisor(): boolean {
    return this.selected?.requestedRoleName === this.STUDENT_ROLE;
  }

  get canApprove(): boolean {
    if (!this.selected || this.selected.status !== 'Pending') return false;
    if (this.needsSupervisor && !this.approveSupervisorId) return false;
    return true;
  }
}
