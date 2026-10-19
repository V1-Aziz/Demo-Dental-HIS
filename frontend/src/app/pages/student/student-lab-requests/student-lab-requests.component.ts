// Student lab-requests page.
// Lists the student's own lab requests; clicking "View Details" opens the shared
// LabRequestDetailsModalComponent populated via GET /lab/:id.
import { Component, OnInit, signal } from '@angular/core';
import { LabService } from '../../../services/lab.service';
import { LabRequestStatus } from '../../../shared/enums/lab-request-status.enum';
import { LabRequestDetail, LabRequestSummary } from '../../../shared/types/lab-request.types';
import {
  getSupervisorStatus,
  getLabSpecialistStatus,
  supervisorBadgeClass,
  labBadgeClass,
  supervisorStatusIcon,
  labStatusIcon,
  SupervisorLabel,
  LabLabel,
} from '../../../shared/utils/lab-status.util';

@Component({
  standalone: false,
  selector: 'app-student-lab-requests',
  templateUrl: './student-lab-requests.component.html',
})
export class StudentLabRequestsComponent implements OnInit {
  isModalOpen     = false;
  searchTerm      = '';
  loading         = false;
  loadError       = false;
  detailLoading   = false;

  requests: LabRequestSummary[] = [];

  // Signal drives the details modal: null = closed, object = open with data.
  selectedRequest = signal<LabRequestDetail | null>(null);

  constructor(private labService: LabService) {}

  ngOnInit(): void {
    this.loading   = true;
    this.loadError = false;
    this.labService.getLabRequests().subscribe({
      next: (res: any) => {
        this.requests = (res.data?.rows ?? []).map((r: any): LabRequestSummary => ({
          lab_request_id:      r.lab_request_id,
          request_timestamp:   r.request_timestamp,
          request_note:        r.request_note ?? '—',
          request_status:      (r.request_status ?? LabRequestStatus.Pending) as LabRequestStatus,
          requester_name:      r.requester_name ?? '—',
          requester_kind:      r.requester_kind ?? 'student',
          patient_name:        r.patient_name ?? '—',
          patient_file_no:     r.patient_file_no ?? null,
          supervisor_feedback: r.supervisor_feedback ?? null,
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; this.loadError = true; },
    });
  }

  viewDetails(id: number): void {
    this.detailLoading = true;
    this.labService.getLabRequestById(id).subscribe({
      next: (res: any) => {
        this.selectedRequest.set(res.data as LabRequestDetail);
        this.detailLoading = false;
      },
      error: () => { this.detailLoading = false; },
    });
  }

  closeModal(): void {
    this.selectedRequest.set(null);
  }

  // --- Status helpers wired to the shared utility ---

  supervisorLabel(req: LabRequestSummary): SupervisorLabel {
    return getSupervisorStatus(req.request_status).label;
  }

  labLabel(req: LabRequestSummary): LabLabel {
    return getLabSpecialistStatus(req.request_status).label;
  }

  supervisorClass(req: LabRequestSummary): string {
    return supervisorBadgeClass(this.supervisorLabel(req));
  }

  labClass(req: LabRequestSummary): string {
    return labBadgeClass(this.labLabel(req));
  }

  supervisorIcon(req: LabRequestSummary): string {
    return supervisorStatusIcon(this.supervisorLabel(req));
  }

  labIcon(req: LabRequestSummary): string {
    return labStatusIcon(this.labLabel(req));
  }
}
