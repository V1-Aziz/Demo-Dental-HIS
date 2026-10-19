import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabService } from '../../../../services/lab.service';
import { LabRequestDetailModalComponent } from '../lab-request-detail-modal/lab-request-detail-modal.component';
import { LabRequestFormModalComponent } from '../../../components/lab-request-form-modal/lab-request-form-modal.component';

@Component({
  standalone: true,
  imports: [CommonModule, LabRequestDetailModalComponent, LabRequestFormModalComponent],
  selector: 'app-lab-request-list-embed',
  template: `
    <div class="lab-list-wrapper">

      @if (canCreate && isWriteMode) {
        <div class="lab-toolbar">
          <button (click)="showFormModal = true" class="new-btn">
            <span class="material-symbols-outlined">add</span>
            New Lab Request
          </button>
        </div>
      }

      @if (loading) {
        <div class="info-text">Loading lab requests…</div>
      } @else if (requests.length === 0) {
        <div class="info-text">No lab requests for this patient.</div>
      } @else {
        <table class="lab-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Work Type</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            @for (lr of requests; track lr.lab_request_id) {
              <tr (click)="open(lr)" class="lab-row">
                <td>#{{ lr.lab_request_id }}</td>
                <td class="note-cell">{{ workType(lr.request_note) }}</td>
                <td>
                  <span class="status-badge" [ngClass]="'lrs-' + statusKey(lr.request_status)">
                    {{ lr.request_status }}
                  </span>
                </td>
                <td>{{ lr.request_timestamp | date:'d MMM y' }}</td>
              </tr>
            }
          </tbody>
        </table>
      }

      @if (selectedLabId) {
        <app-lab-request-detail-modal
          [patientId]="patientId"
          [labRequestId]="selectedLabId"
          (close)="selectedLabId = null"
        ></app-lab-request-detail-modal>
      }

      @if (showFormModal) {
        <app-lab-request-form-modal
          [lockedPatientId]="patientId"
          [lockedFileNoDisplay]="lockedFileNoDisplay"
          (closed)="showFormModal = false"
          (submitted)="onSubmitted()"
        ></app-lab-request-form-modal>
      }
    </div>
  `,
  styles: [`
    .lab-list-wrapper { padding: 16px; }
    .lab-toolbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .new-btn {
      display: flex; align-items: center; gap: 6px;
      background: #1a365d; color: #fff;
      border: none; border-radius: 8px; padding: 8px 16px;
      font-size: 0.85rem; font-weight: 700; cursor: pointer;
      transition: background 0.15s;
    }
    .new-btn:hover { background: #2c5282; }
    .new-btn .material-symbols-outlined { font-size: 18px; }
    .info-text { color: #94a3b8; font-style: italic; padding: 20px; text-align: center; }
    .lab-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    .lab-table th { text-align: left; padding: 8px 12px; font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
    .lab-row { cursor: pointer; }
    .lab-row:hover td { background: #f8fafc; }
    .lab-row td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    .note-cell { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status-badge { border-radius: 10px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700; }
    .lrs-pending     { background: #fef9c3; color: #92400e; }
    .lrs-approved    { background: #dcfce7; color: #15803d; }
    .lrs-in-progress { background: #dbeafe; color: #1d4ed8; }
    .lrs-delivered   { background: #d1fae5; color: #065f46; }
    .lrs-rejected    { background: #fee2e2; color: #b91c1c; }
  `],
})
export class LabRequestListEmbedComponent implements OnInit {
  @Input({ required: true }) patientId!: number;
  @Input() canCreate            = false;
  @Input() isWriteMode          = true;
  @Input() lockedFileNoDisplay?: string;

  loading       = true;
  requests:     any[] = [];
  selectedLabId: number | null = null;
  showFormModal  = false;

  constructor(private labService: LabService) {}

  ngOnInit(): void {
    this.loadRequests();
  }

  loadRequests(): void {
    this.loading = true;
    this.labService.getLabRequests({ patientId: this.patientId }).subscribe({
      next:  (res: any) => { this.requests = res.data?.rows ?? res.data ?? []; this.loading = false; },
      error: ()         => { this.loading = false; },
    });
  }

  open(lr: any): void { this.selectedLabId = lr.lab_request_id; }

  onSubmitted(): void {
    this.showFormModal = false;
    this.loadRequests();
  }

  workType(note: string): string {
    return note?.split('\n')[0] ?? '—';
  }

  statusKey(status: string): string {
    return status.toLowerCase().replace(' ', '-');
  }
}
