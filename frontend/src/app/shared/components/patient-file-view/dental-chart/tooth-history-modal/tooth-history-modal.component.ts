import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PatientFileService } from '../../../../../services/patient-file.service';

@Component({
  standalone: true,
  imports:    [CommonModule],
  selector:   'app-tooth-history-modal',
  template: `
    <div class="overlay" (click)="onOverlayClick($event)">
      <div class="modal">
        <div class="modal-header">
          <h3>Tooth {{ toothNumber }} — History</h3>
          <button class="close-btn" (click)="close.emit()">✕</button>
        </div>
        <div class="modal-body">
          <div *ngIf="loading" class="info-text">Loading…</div>
          <div *ngIf="!loading && history.length === 0" class="info-text">No annotations recorded for this tooth.</div>
          <div *ngFor="let entry of history" class="history-row">
            <div class="history-date">{{ entry.recorded_at | date:'d MMM y' }}
              <span *ngIf="entry.visit_date" class="visit-date-tag">Visit {{ entry.visit_date | date:'d MMM' }}</span>
            </div>
            <div class="history-note">{{ entry.note }}</div>
            <div class="history-author">{{ entry.authored_by }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal { background: white; border-radius: 10px; width: 480px; max-height: 70vh; overflow: hidden; display: flex; flex-direction: column; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; }
    h3 { margin: 0; font-size: 1rem; color: #1e293b; }
    .close-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #64748b; }
    .modal-body { overflow-y: auto; padding: 16px 20px; }
    .history-row { padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .history-date { font-size: 0.78rem; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .visit-date-tag { background: #dbeafe; color: #1d4ed8; border-radius: 8px; padding: 1px 7px; font-size: 0.7rem; margin-left: 6px; }
    .history-note { font-size: 0.9rem; color: #1e293b; margin-bottom: 4px; line-height: 1.4; }
    .history-author { font-size: 0.75rem; color: #94a3b8; }
    .info-text { color: #94a3b8; font-style: italic; text-align: center; padding: 20px 0; }
  `],
})
export class ToothHistoryModalComponent implements OnChanges {
  @Input({ required: true }) patientId!:   number;
  @Input({ required: true }) toothNumber!: string;
  @Output() close = new EventEmitter<void>();

  loading = true;
  history: any[] = [];

  constructor(private svc: PatientFileService) {}

  ngOnChanges(): void {
    if (!this.patientId || !this.toothNumber) return;
    this.loading = true;
    this.history = [];
    this.svc.getToothHistory(this.patientId, this.toothNumber).subscribe({
      next:  (res: any) => { this.history = res.data ?? []; this.loading = false; },
      error: ()         => { this.loading = false; },
    });
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.close.emit();
  }
}
