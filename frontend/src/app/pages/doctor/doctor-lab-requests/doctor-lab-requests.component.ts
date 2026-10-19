import { Component, OnDestroy, OnInit } from '@angular/core';
import { LabService } from '../../../services/lab.service';

interface LabOrderRow {
  id:                 number;
  requesterKind:      'doctor' | 'student';
  requesterName:      string;
  patientName:        string;
  patientFileNo:      string;
  workType:           string;
  clinicalNote:       string;
  dateSent:           string;
  status:             string;
  supervisorFeedback: string | null;
}

@Component({
  standalone: false,
  selector: 'app-doctor-lab-requests',
  templateUrl: './doctor-lab-requests.component.html',
})
export class DoctorLabRequestsComponent implements OnInit, OnDestroy {
  orders:  LabOrderRow[] = [];
  loading  = false;

  searchTerm = '';
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  currentPage      = 1;
  pageSize         = 10;
  totalRows        = 0;
  readonly pageSizeOptions = [10, 25, 50];

  isFormModalOpen = false;
  selectedDetail: LabOrderRow | null = null;

  rejectTarget: LabOrderRow | null = null;
  rejectReason = '';
  rejectError  = '';
  isReviewing  = false;

  constructor(private labService: LabService) {}

  ngOnInit(): void { this.loadOrders(); }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  loadOrders(): void {
    this.loading = true;
    this.labService.getLabRequests({
      search: this.searchTerm.trim() || undefined,
      page:   this.currentPage,
      limit:  this.pageSize,
    }).subscribe({
      next: (res: any) => {
        this.totalRows = res.data?.total ?? 0;
        this.orders    = (res.data?.rows ?? []).map((r: any) => ({
          id:                 r.lab_request_id,
          requesterKind:      r.requester_kind ?? 'doctor',
          requesterName:      r.requester_name ?? '—',
          patientName:        r.patient_name   ?? '—',
          patientFileNo:      r.patient_file_no != null ? String(r.patient_file_no) : '—',
          workType:           r.request_note?.split('\n')[0] ?? '—',
          clinicalNote:       r.request_note ?? '',
          dateSent:           r.request_timestamp ? this.formatDate(r.request_timestamp) : '—',
          status:             r.request_status ?? 'Pending',
          supervisorFeedback: r.supervisor_feedback ?? null,
        }));
        this.loading = false;
      },
      error: () => { this.orders = []; this.loading = false; },
    });
  }

  onSearchChange(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.currentPage = 1;
      this.loadOrders();
    }, 300);
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.totalRows / this.pageSize)); }
  get rangeStart(): number { return this.totalRows === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get rangeEnd(): number   { return Math.min(this.currentPage * this.pageSize, this.totalRows); }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadOrders();
  }

  onPageSizeChange(size: number | string): void {
    this.pageSize    = +size;
    this.currentPage = 1;
    this.loadOrders();
  }

  approve(order: LabOrderRow): void {
    this.isReviewing = true;
    this.labService.reviewLabRequest(order.id, { status: 'Approved' }).subscribe({
      next:  () => { this.isReviewing = false; this.loadOrders(); },
      error: () => { this.isReviewing = false; },
    });
  }

  startReject(order: LabOrderRow): void {
    this.rejectTarget = order;
    this.rejectReason = '';
    this.rejectError  = '';
  }

  cancelReject(): void { this.rejectTarget = null; }

  confirmReject(): void {
    if (!this.rejectReason.trim()) { this.rejectError = 'Please provide a rejection reason.'; return; }
    this.isReviewing = true;
    this.labService.reviewLabRequest(this.rejectTarget!.id, {
      status:             'Rejected',
      supervisorFeedback: this.rejectReason.trim(),
    }).subscribe({
      next:  () => { this.isReviewing = false; this.rejectTarget = null; this.loadOrders(); },
      error: () => { this.rejectError = 'Failed to reject. Please try again.'; this.isReviewing = false; },
    });
  }

  onFormSubmitted(): void {
    this.isFormModalOpen = false;
    this.currentPage     = 1;
    this.loadOrders();
  }

  initials(name: string): string {
    const parts = (name ?? '').trim().split(/\s+/);
    const a = parts[0]?.[0] ?? '';
    const b = parts[parts.length - 1]?.[0] ?? '';
    return (a + (b !== a ? b : '')).toUpperCase();
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      'Pending':     'bg-yellow-100 text-yellow-800',
      'Approved':    'bg-green-100 text-green-800',
      'Rejected':    'bg-red-100 text-red-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      'Delivered':   'bg-emerald-100 text-emerald-800',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
