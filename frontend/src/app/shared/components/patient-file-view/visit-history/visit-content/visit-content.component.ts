import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PatientFileService } from '../../../../../services/patient-file.service';

@Component({
  standalone: true,
  imports:    [CommonModule],
  selector:   'app-visit-content',
  template: `
    <div class="visit-panel" *ngIf="!loading && content">
      <!-- Visit header -->
      <div class="visit-header">
        <div class="visit-meta">
          <span class="visit-date">{{ content.appointment_date | date:'EEEE, d MMMM y' }}</span>
          <span class="visit-time">{{ content.appointment_time }}</span>
          <span class="visit-type-badge">{{ content.appointment_type }}</span>
        </div>
        <div class="visit-details">
          <span *ngIf="content.attending_doctor">
            <span class="detail-label">Doctor:</span> {{ content.attending_doctor }}
          </span>
          <span *ngIf="content.clinic_name">
            <span class="detail-label">Clinic:</span> {{ content.clinic_name }}
          </span>
        </div>
      </div>

      <!-- Diagnoses section -->
      <div class="section">
        <div class="section-header">
          <span class="chip chip-purple">Dx</span>
          <span class="section-title">Diagnoses</span>
          <span class="section-count">{{ content.diagnoses.length }}</span>
        </div>
        <div *ngIf="content.diagnoses.length === 0" class="empty-state">No diagnoses recorded on this visit.</div>
        <div *ngFor="let dx of content.diagnoses" class="entry-card">
          <div class="entry-top">
            <span class="entry-type">{{ dx.diagnosis_type }}</span>
            <span *ngIf="dx.tooth_number" class="tooth-badge">Tooth {{ dx.tooth_number }}</span>
            <span class="status-chip" [ngClass]="'status-' + dx.status.toLowerCase()">{{ dx.status | titlecase }}</span>
          </div>
          <p class="entry-field"><span class="field-label">Clinical:</span> {{ dx.clinical_findings }}</p>
          <p class="entry-field"><span class="field-label">Radiographic:</span> {{ dx.radiographic_findings }}</p>
          <p class="entry-field"><span class="field-label">Note:</span> {{ dx.progress_note }}</p>
          <p *ngIf="dx.doctor_feedback" class="feedback-box">
            <span class="field-label">Feedback:</span> {{ dx.doctor_feedback }}
          </p>
          <div class="authorship-row">
            <ng-container *ngTemplateOutlet="authorTpl; context: { $implicit: dx.authorship, status: dx.status }"></ng-container>
          </div>
        </div>
      </div>

      <!-- Treatments section -->
      <div class="section">
        <div class="section-header">
          <span class="chip chip-green">Tx</span>
          <span class="section-title">Treatments</span>
          <span class="section-count">{{ content.treatments.length }}</span>
        </div>
        <div *ngIf="content.treatments.length === 0" class="empty-state">No treatments recorded on this visit.</div>
        <div *ngFor="let tx of content.treatments" class="entry-card">
          <div class="entry-top">
            <span class="entry-type">{{ tx.treatment_type }}</span>
            <span class="status-chip" [ngClass]="'status-' + tx.status.toLowerCase()">{{ tx.status | titlecase }}</span>
          </div>
          <p class="entry-field">{{ tx.treatment_note }}</p>
          <p *ngIf="tx.doctor_feedback" class="feedback-box">
            <span class="field-label">Feedback:</span> {{ tx.doctor_feedback }}
          </p>
          <div class="authorship-row">
            <ng-container *ngTemplateOutlet="authorTpl; context: { $implicit: tx.authorship, status: tx.status }"></ng-container>
          </div>
        </div>
      </div>

      <!-- Dental chart notes section -->
      <div class="section">
        <div class="section-header">
          <span class="chip chip-amber">Dc</span>
          <span class="section-title">Dental Chart Notes</span>
          <span class="section-count">{{ content.dental_chart_notes.length }}</span>
        </div>
        <div *ngIf="content.dental_chart_notes.length === 0" class="empty-state">No dental chart notes added on this visit.</div>
        <div *ngFor="let dc of content.dental_chart_notes" class="dc-row">
          <span class="tooth-badge">T{{ dc.tooth_number }}</span>
          <span class="dc-note">{{ dc.tooth_note }}</span>
          <span class="dc-author">{{ dc.authorship.author_name }}</span>
        </div>
      </div>
    </div>

    <div *ngIf="loading" class="loading-panel">Loading visit…</div>
    <div *ngIf="!loading && !content" class="loading-panel">Visit not found.</div>

    <!-- Authorship template -->
    <ng-template #authorTpl let-a let-status="status">
      <div class="authorship">
        <span *ngIf="a.author_role === 'Doctor'" class="author-chip chip-doc">
          Dr. {{ a.author_name }}
        </span>
        <ng-container *ngIf="a.author_role === 'Student'">
          <span class="author-chip chip-stu">{{ a.author_name }}</span>
          <span *ngIf="status === 'Approved' && a.reviewer_name" class="author-detail">
            · Approved by Dr. {{ a.reviewer_name }}
          </span>
          <span *ngIf="status === 'Submitted' && a.supervisor_name" class="author-detail">
            · Supervisor: Dr. {{ a.supervisor_name }}
          </span>
          <span *ngIf="status === 'Revision_Requested' && a.reviewer_name" class="author-detail">
            · Revision requested by Dr. {{ a.reviewer_name }}
          </span>
          <span *ngIf="status === 'Rejected' && a.reviewer_name" class="author-detail">
            · Rejected by Dr. {{ a.reviewer_name }}
          </span>
        </ng-container>
      </div>
    </ng-template>
  `,
  styles: [`
    .visit-panel { background: white; border-radius: 8px; padding: 20px; }
    .visit-header { border-bottom: 2px solid #f1f5f9; padding-bottom: 14px; margin-bottom: 20px; }
    .visit-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .visit-date { font-size: 1rem; font-weight: 700; color: #1e293b; }
    .visit-time { color: #64748b; font-size: 0.9rem; }
    .visit-type-badge { background: #dbeafe; color: #1d4ed8; border-radius: 10px; padding: 2px 10px; font-size: 0.78rem; font-weight: 600; }
    .visit-details { font-size: 0.82rem; color: #64748b; display: flex; gap: 16px; }
    .detail-label { font-weight: 600; color: #475569; }
    .section { margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .chip { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; }
    .chip-purple { background: #ede9fe; color: #7c3aed; }
    .chip-green  { background: #dcfce7; color: #15803d; }
    .chip-blue   { background: #dbeafe; color: #1d4ed8; }
    .chip-amber  { background: #fef3c7; color: #b45309; }
    .section-title { font-weight: 700; color: #1e293b; font-size: 0.95rem; flex: 1; }
    .section-count { background: #f1f5f9; color: #64748b; border-radius: 10px; padding: 1px 8px; font-size: 0.75rem; }
    .empty-state { color: #94a3b8; font-style: italic; font-size: 0.85rem; padding: 8px 0; }
    .entry-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 8px; }
    .entry-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .entry-type { font-weight: 700; color: #1e293b; }
    .tooth-badge { background: #e0e7ff; color: #3730a3; border-radius: 8px; padding: 1px 8px; font-size: 0.75rem; font-weight: 600; }
    .status-chip { border-radius: 8px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700; margin-left: auto; }
    .status-approved           { background: #dcfce7; color: #15803d; }
    .status-submitted          { background: #fef9c3; color: #92400e; }
    .status-revision_requested { background: #fff7ed; color: #c2410c; }
    .status-rejected           { background: #fee2e2; color: #b91c1c; }
    .entry-field { font-size: 0.85rem; color: #334155; margin: 4px 0; line-height: 1.4; }
    .field-label { font-weight: 600; color: #475569; }
    .feedback-box { background: #fef3c7; border: 1px solid #fde68a; border-radius: 4px; padding: 6px 10px; font-size: 0.82rem; margin-top: 6px; }
    .authorship-row { margin-top: 8px; }
    .authorship { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; }
    .author-chip { border-radius: 12px; padding: 2px 9px; font-weight: 600; }
    .chip-doc { background: #d1fae5; color: #065f46; }
    .chip-stu { background: #ede9fe; color: #5b21b6; }
    .author-detail { color: #64748b; }
    .dc-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; }
    .dc-note { flex: 1; color: #334155; }
    .dc-author { font-size: 0.75rem; color: #94a3b8; }
    .loading-panel { padding: 40px; text-align: center; color: #94a3b8; font-style: italic; }
  `],
})
export class VisitContentComponent implements OnChanges {
  @Input({ required: true }) patientId!:     number;
  @Input({ required: true }) appointmentId!: number;

  loading  = true;
  content: any = null;

  constructor(private svc: PatientFileService) {}

  ngOnChanges(): void {
    if (!this.patientId || !this.appointmentId) return;
    this.loading = true;
    this.content = null;
    this.svc.getVisitContent(this.patientId, this.appointmentId).subscribe({
      next:  (res: any) => { this.content = res.data; this.loading = false; },
      error: ()         => { this.loading = false; },
    });
  }

}
