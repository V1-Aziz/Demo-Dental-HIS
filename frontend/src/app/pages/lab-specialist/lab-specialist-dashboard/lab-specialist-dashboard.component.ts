import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LabService } from '../../../services/lab.service';

type RequestStatus = 'New' | 'In Progress' | 'Ready' | 'Delivered';

interface RecentRequest {
  id: string;
  patient: string;
  procedure: string;
  doctor: string;
  status: RequestStatus;
}

@Component({
  standalone: false,
  selector: 'app-lab-specialist-dashboard',
  templateUrl: './lab-specialist-dashboard.component.html',
})
export class LabSpecialistDashboardComponent implements OnInit {
  allRequests: RecentRequest[] = [];

  pageSize = 10;
  currentPage = 1;

  get totalPages(): number {
    return Math.ceil(this.allRequests.length / this.pageSize) || 1;
  }

  get pagedRequests(): RecentRequest[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.allRequests.slice(start, start + this.pageSize);
  }

  get rangeLabel(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.allRequests.length);
    return `${start}-${end} of ${this.allRequests.length}`;
  }

  constructor(
    private router: Router,
    private labService: LabService,
  ) {}

  ngOnInit(): void {
    this.labService.getLabRequests().subscribe((res: any) => {
      this.allRequests = (res.data?.rows ?? res.data ?? []).map((r: any) => {
        const statusMap: Record<string, RequestStatus> = {
          'Pending': 'New',
          'Approved': 'In Progress',
          'Completed': 'Ready',
        };
        return {
          id: 'LR-' + r.lab_request_id,
          patient: 'N/A',
          procedure: r.request_note || '',
          doctor: r.requester_name || '—',
          status: statusMap[r.request_status] ?? (r.request_status as RequestStatus),
        };
      });
    });
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
  }

  prevPage(): void { if (this.currentPage > 1) this.currentPage--; }
  nextPage(): void { if (this.currentPage < this.totalPages) this.currentPage++; }

  goToRequests(): void { this.router.navigate(['/lab-specialist/requests']); }

  statusClass(status: RequestStatus): string {
    const map: Record<RequestStatus, string> = {
      'New':         'bg-blue-100 text-blue-800',
      'In Progress': 'bg-yellow-100 text-yellow-800',
      'Ready':       'bg-green-100 text-green-800',
      'Delivered':   'bg-gray-100 text-gray-800',
    };
    return map[status];
  }
}
