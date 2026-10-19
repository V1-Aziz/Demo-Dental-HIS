import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { PatientFileRole } from '../../../types/patient-file.types';

@Component({
  standalone: true,
  imports:    [CommonModule, FormsModule],
  selector:   'app-overview',
  template: `
    <div class="overview-card">
      <div class="overview-field">
        <label>Chief Complaint</label>
        <div *ngIf="!editingField" class="field-value" (click)="canEdit && startEdit('chief_complaint')">
          {{ record?.chief_complaint || '—' }}
          <span *ngIf="canEdit" class="edit-hint">click to edit</span>
        </div>
        <textarea
          *ngIf="editingField === 'chief_complaint'"
          [(ngModel)]="editValue"
          (blur)="save('chief_complaint')"
          rows="3"
          autofocus
          class="edit-area"
        ></textarea>
      </div>

      <div class="overview-field">
        <label>Chronic Conditions / Allergies</label>
        <div *ngIf="editingField !== 'chronic_diseases'" class="field-value" (click)="canEdit && startEdit('chronic_diseases')">
          <span *ngIf="record?.chronic_diseases">{{ record?.chronic_diseases }}</span>
          <span *ngIf="!record?.chronic_diseases" class="none-text">None recorded</span>
          <span *ngIf="canEdit" class="edit-hint">click to edit</span>
        </div>
        <textarea
          *ngIf="editingField === 'chronic_diseases'"
          [(ngModel)]="editValue"
          (blur)="save('chronic_diseases')"
          rows="2"
          autofocus
          class="edit-area"
        ></textarea>
      </div>

      <div *ngIf="loading" class="loading-text">Loading…</div>
      <div *ngIf="error"   class="error-text">{{ error }}</div>
    </div>
  `,
  styles: [`
    .overview-card { background: white; border-radius: 8px; padding: 20px; }
    .overview-field { margin-bottom: 20px; }
    label { display: block; font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .field-value { font-size: 0.95rem; color: #1e293b; line-height: 1.5; cursor: text; padding: 6px 8px; border-radius: 4px; min-height: 34px; }
    .field-value:hover { background: #f8fafc; }
    .edit-hint { font-size: 0.7rem; color: #94a3b8; margin-left: 8px; }
    .edit-area { width: 100%; padding: 8px; border: 1px solid #2563eb; border-radius: 6px; font-size: 0.95rem; resize: vertical; }
    .none-text { color: #94a3b8; font-style: italic; }
    .loading-text { color: #94a3b8; font-style: italic; }
    .error-text { color: #ef4444; font-size: 0.85rem; }
  `],
})
export class OverviewComponent implements OnInit {
  @Input({ required: true }) patientId!: number;
  @Input({ required: true }) userRole!: PatientFileRole;
  @Input() isWriteMode = true;

  record:       any    = null;
  recordId:     number = 0;
  loading       = true;
  error         = '';
  editingField: string | null = null;
  editValue     = '';

  get canEdit(): boolean {
    return this.isWriteMode &&
      (this.userRole === PatientFileRole.Doctor || this.userRole === PatientFileRole.Student);
  }

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<any>(`${environment.apiUrl}/records/patient/${this.patientId}`).subscribe({
      next: (res) => {
        const r = res.data ?? res;
        this.record   = r;
        this.recordId = r.record_id ?? r.recordId ?? 0;
        this.loading  = false;
      },
      error: () => {
        this.error   = 'Failed to load medical record';
        this.loading = false;
      },
    });
  }

  startEdit(field: string): void {
    this.editingField = field;
    this.editValue    = this.record?.[field] ?? '';
  }

  save(field: string): void {
    if (!this.recordId) return;
    const payload: Record<string, string> = { [field]: this.editValue };
    this.http.patch(`${environment.apiUrl}/records/${this.recordId}`, payload).subscribe({
      next: () => {
        if (this.record) this.record[field] = this.editValue;
        this.editingField = null;
      },
      error: () => { this.editingField = null; },
    });
  }
}
