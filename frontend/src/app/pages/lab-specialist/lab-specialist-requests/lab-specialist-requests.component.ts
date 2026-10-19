import { Component, OnInit } from '@angular/core';
import { LabService } from '../../../services/lab.service';

type RequestStatus = 'New' | 'In Progress' | 'Ready' | 'Delivered' | 'Approved' | 'Rejected';
type ActiveTab = 'incoming' | 'history';

interface LabRequest {
  id: string;
  patient: string;
  toothNo: string;
  type: string;
  doctor: string;
  dueDate: string;
  status: RequestStatus;
  rawStatus: string;
}

@Component({
  standalone: false,
  selector: 'app-lab-specialist-requests',
  templateUrl: './lab-specialist-requests.component.html',
})
export class LabSpecialistRequestsComponent implements OnInit {
  activeTab: ActiveTab = 'incoming';
  selectedRequest: LabRequest | null = null;
  isModalOpen = false;

  modalStatus = 'In Progress';
  modalNotes  = '';
  saving      = false;
  saveError   = '';

  requests: LabRequest[] = [];
  isLoading = false;

  searchQuery = '';
  statusFilter: RequestStatus | 'All' = 'All';
  showStatusFilter = false;
  readonly statusOptions: (RequestStatus | 'All')[] = ['All', 'New', 'In Progress', 'Delivered', 'Approved', 'Rejected'];

  pageSize = 10;
  currentPage = 1;

  constructor(private labSvc: LabService) {}

  ngOnInit(): void {
    this.isLoading = true;
    this.labSvc.getLabRequests().subscribe({
      next: (res: any) => {
        this.requests = (res.data?.rows ?? []).map((r: any) => ({
          id:        String(r.lab_request_id),
          patient:   r.patient_name ?? r.employee_name ?? '—',
          toothNo:   r.tooth_number ?? '—',
          type:      r.request_note ?? '—',
          doctor:    r.requester_name ?? r.approved_by_name ?? '—',
          dueDate:   r.request_timestamp
            ? new Date(r.request_timestamp).toLocaleDateString('en-GB')
            : '—',
          status:    this.toDisplay(r.request_status),
          rawStatus: r.request_status ?? 'Pending',
        }));
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; },
    });
  }

  private toDisplay(s: string): RequestStatus {
    const map: Record<string, RequestStatus> = {
      'Pending':     'New',
      'In Progress': 'In Progress',
      'Delivered':   'Delivered',
      'Approved':    'Approved',
      'Rejected':    'Rejected',
    };
    return map[s] ?? 'New';
  }

  get filteredRequests(): LabRequest[] {
    const q = this.searchQuery.toLowerCase().trim();
    return this.requests.filter(r => {
      const tabMatch = this.activeTab === 'incoming'
        ? r.status !== 'Delivered' && r.status !== 'Rejected'
        : r.status === 'Delivered' || r.status === 'Rejected';
      const statusMatch = this.statusFilter === 'All' || r.status === this.statusFilter;
      const searchMatch = !q
        || r.id.toLowerCase().includes(q)
        || r.patient.toLowerCase().includes(q)
        || r.doctor.toLowerCase().includes(q);
      return tabMatch && statusMatch && searchMatch;
    });
  }

  get totalPages(): number {
    return Math.ceil(this.filteredRequests.length / this.pageSize) || 1;
  }

  get pagedRequests(): LabRequest[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRequests.slice(start, start + this.pageSize);
  }

  get rangeLabel(): string {
    const total = this.filteredRequests.length;
    if (total === 0) return '0-0 of 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end   = Math.min(this.currentPage * this.pageSize, total);
    return `${start}-${end} of ${total}`;
  }

  switchTab(tab: ActiveTab): void {
    this.activeTab   = tab;
    this.currentPage = 1;
    this.statusFilter = 'All';
  }

  onSearchChange(): void { this.currentPage = 1; }

  setStatusFilter(status: RequestStatus | 'All'): void {
    this.statusFilter    = status;
    this.showStatusFilter = false;
    this.currentPage     = 1;
  }

  onPageSizeChange(size: number): void {
    this.pageSize    = size;
    this.currentPage = 1;
  }

  prevPage(): void { if (this.currentPage > 1) this.currentPage--; }
  nextPage(): void { if (this.currentPage < this.totalPages) this.currentPage++; }

  openProcessModal(req: LabRequest): void {
    this.selectedRequest = req;
    const toBackend: Record<RequestStatus, string> = {
      'New':         'Pending',
      'In Progress': 'In Progress',
      'Ready':       'Delivered',
      'Delivered':   'Delivered',
      'Approved':    'Approved',
      'Rejected':    'Rejected',
    };
    this.modalStatus = toBackend[req.status] ?? 'In Progress';
    this.modalNotes  = '';
    this.saveError   = '';
    this.isModalOpen = true;
  }

  saveChanges(): void {
    if (!this.selectedRequest || this.saving) return;
    this.saving    = true;
    this.saveError = '';

    this.labSvc.updateStatus(Number(this.selectedRequest.id), this.modalStatus).subscribe({
      next: () => {
        const req = this.requests.find(r => r.id === this.selectedRequest!.id);
        if (req) {
          req.rawStatus = this.modalStatus;
          req.status    = this.toDisplay(this.modalStatus);
        }
        this.saving      = false;
        this.isModalOpen = false;
      },
      error: (err: any) => {
        this.saveError = err?.error?.error ?? 'Failed to update status. Please try again.';
        this.saving    = false;
      },
    });
  }

  statusClass(status: RequestStatus): string {
    const map: Record<RequestStatus, string> = {
      'New':         'bg-blue-100 text-blue-800',
      'In Progress': 'bg-yellow-100 text-yellow-800',
      'Ready':       'bg-green-100 text-green-800',
      'Delivered':   'bg-gray-100 text-gray-800',
      'Approved':    'bg-purple-100 text-purple-800',
      'Rejected':    'bg-red-100 text-red-800',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }
}
