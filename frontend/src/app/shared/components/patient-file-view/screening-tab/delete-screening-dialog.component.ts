import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Screening } from '../../../types/screening.types';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-delete-screening-dialog',
  template: `
    <div class="dlg-backdrop" (click)="cancel.emit()">
      <div class="dlg-shell" (click)="$event.stopPropagation()">
        <div class="dlg-icon-wrapper">
          <span class="material-symbols-outlined dlg-icon">warning</span>
        </div>
        <h3 class="dlg-title">Delete this screening?</h3>
        <p class="dlg-desc">
          This will remove the image from the patient's file. The action cannot be undone by you.
        </p>

        <div class="dlg-summary">
          <div class="dlg-type">{{ screening.image_type }}</div>
          <div class="dlg-meta">
            Uploaded {{ screening.uploaded_at | date:'mediumDate' }}
            · {{ screening.uploaded_by_name }}
            <span *ngIf="screening.tooth_numbers"> · Tooth {{ screening.tooth_numbers }}</span>
          </div>
        </div>

        <div class="dlg-actions">
          <button class="btn btn-secondary" (click)="cancel.emit()">Cancel</button>
          <button class="btn btn-danger" (click)="confirm.emit()">Delete image</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dlg-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; z-index: 85;
    }
    .dlg-shell {
      background: #fff; border-radius: 12px; width: min(420px, 100%);
      padding: 22px 24px 18px 24px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
      text-align: center;
    }
    .dlg-icon-wrapper {
      width: 56px; height: 56px;
      background: #fee2e2; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 10px auto;
    }
    .dlg-icon { color: #dc2626; font-size: 1.8rem !important; }
    .dlg-title { font-size: 1.05rem; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; }
    .dlg-desc { font-size: 0.85rem; color: #475569; margin: 0 0 14px 0; }
    .dlg-summary {
      background: #f1f5f9; border-radius: 8px; padding: 10px 12px;
      text-align: left; margin-bottom: 16px;
    }
    .dlg-type { font-size: 0.85rem; font-weight: 700; color: #0f172a; }
    .dlg-meta { font-size: 0.78rem; color: #64748b; margin-top: 2px; }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .btn {
      padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
      font-size: 0.85rem; font-weight: 600;
    }
    .btn-secondary { background: #e2e8f0; color: #334155; }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
  `],
})
export class DeleteScreeningDialogComponent {
  @Input({ required: true }) screening!: Screening;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel  = new EventEmitter<void>();
}
