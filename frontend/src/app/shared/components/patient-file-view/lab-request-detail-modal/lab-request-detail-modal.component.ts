import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PatientFileService } from '../../../../services/patient-file.service';

@Component({
  standalone: true,
  imports:    [CommonModule],
  selector:   'app-lab-request-detail-modal',
  template: `
    <div class="overlay" (click)="onOverlayClick($event)">
      <div class="modal">
        <div class="modal-header">
          <h3>Lab Request #{{ labRequestId }}</h3>
          <button class="close-btn" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body" *ngIf="!loading && detail">
          <!-- Status panel -->
          <div class="status-panel">
            <div class="status-item">
              <span class="status-label">Request Status</span>
              <span class="status-badge" [ngClass]="'lrs-' + detail.request_status.toLowerCase().replace(' ', '-')">
                {{ detail.request_status }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-label">Submitted</span>
              <span>{{ detail.request_date | date:'d MMM y' }}</span>
            </div>
          </div>

          <!-- People -->
          <div class="section">
            <div class="section-title">People</div>
            <div class="people-grid">
              <div class="person-card">
                <span class="person-role">Submitted by</span>
                <span class="person-name">{{ detail.submitter_name }}</span>
                <span class="person-type">{{ detail.submitter_role }}</span>
              </div>
              <div class="person-card" *ngIf="detail.approver_name">
                <span class="person-role">Approved by</span>
                <span class="person-name">{{ detail.approver_name }}</span>
              </div>
            </div>
          </div>

          <!-- Work specification -->
          <div class="section">
            <div class="section-title">Work Specification</div>
            <p class="spec-text">{{ detail.request_note }}</p>
          </div>

          <!-- Lab response -->
          <div class="section" *ngIf="detail.response_note">
            <div class="section-title">Lab Response</div>
            <p class="response-text">{{ detail.response_note }}</p>
            <span class="response-date" *ngIf="detail.response_date">
              {{ detail.response_date | date:'d MMM y' }}
            </span>
          </div>
        </div>

        <div *ngIf="loading"  class="info-text">Loading…</div>
        <div *ngIf="!loading && !detail" class="info-text">Lab request not found.</div>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 10px; width: 520px; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
    h3 { margin: 0; font-size: 1rem; color: #1e293b; }
    .close-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #64748b; }
    .modal-body { overflow-y: auto; padding: 20px; }
    .status-panel { display: flex; gap: 24px; margin-bottom: 20px; padding: 12px 16px; background: #f8fafc; border-radius: 6px; }
    .status-item { display: flex; flex-direction: column; gap: 4px; }
    .status-label { font-size: 0.72rem; color: #64748b; text-transform: uppercase; font-weight: 700; }
    .status-badge { border-radius: 10px; padding: 3px 10px; font-size: 0.78rem; font-weight: 700; }
    .lrs-pending     { background: #fef9c3; color: #92400e; }
    .lrs-approved    { background: #dcfce7; color: #15803d; }
    .lrs-in-progress { background: #dbeafe; color: #1d4ed8; }
    .lrs-delivered   { background: #d1fae5; color: #065f46; }
    .lrs-rejected    { background: #fee2e2; color: #b91c1c; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    .people-grid { display: flex; gap: 12px; }
    .person-card { background: #f8fafc; border-radius: 6px; padding: 10px 14px; flex: 1; }
    .person-role { display: block; font-size: 0.72rem; color: #94a3b8; margin-bottom: 4px; }
    .person-name { display: block; font-weight: 600; color: #1e293b; font-size: 0.9rem; }
    .person-type { display: block; font-size: 0.75rem; color: #64748b; margin-top: 2px; }
    .spec-text { font-size: 0.9rem; color: #334155; line-height: 1.5; margin: 0; }
    .response-text { font-size: 0.9rem; color: #334155; line-height: 1.5; margin: 0 0 6px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 5px; }
    .response-date { font-size: 0.75rem; color: #94a3b8; }
    .info-text { padding: 30px; text-align: center; color: #94a3b8; font-style: italic; }
  `],
})
export class LabRequestDetailModalComponent implements OnChanges {
  @Input({ required: true }) patientId!:    number;
  @Input({ required: true }) labRequestId!: number;
  @Output() close = new EventEmitter<void>();

  loading = true;
  detail: any = null;

  constructor(private svc: PatientFileService) {}

  ngOnChanges(): void {
    if (!this.patientId || !this.labRequestId) return;
    this.loading = true;
    this.detail  = null;
    this.svc.getLabRequestDetail(this.patientId, this.labRequestId).subscribe({
      next:  (res: any) => { this.detail = res.data; this.loading = false; },
      error: ()         => { this.loading = false; },
    });
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.close.emit();
  }
}
