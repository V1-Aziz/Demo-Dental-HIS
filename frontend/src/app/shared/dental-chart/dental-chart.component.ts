import { Component, HostListener, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DentalChartService } from '../../services/dental-chart.service';

interface DiagnosisRecord {
  condition: string;
  note:      string;
  savedAt:   string;
}

export interface FileAccessInfo {
  accessType:            'write' | 'read';
  isAssigned:            boolean;
  isExpired:             boolean;
  hoursRemaining:        number;
  writeAccessExpiresAt?: string;
  expiredAt?:            string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector:    'app-dental-chart',
  templateUrl: './dental-chart.component.html',
  styleUrls:   ['./dental-chart.component.scss'],
})
export class DentalChartComponent implements OnInit {

  // When provided, the component fetches the student's write-access status
  // for this patient and enforces read-only mode on expiry.
  @Input() patientId: number | null = null;
  @Input() recordId:  number        = 0;

  readonly quadrants = {
    upperLeft:  [18, 17, 16, 15, 14, 13, 12, 11],
    upperRight: [21, 22, 23, 24, 25, 26, 27, 28],
    lowerLeft:  [48, 47, 46, 45, 44, 43, 42, 41],
    lowerRight: [31, 32, 33, 34, 35, 36, 37, 38],
  };

  readonly conditions = [
    { id: 'healthy',     label: 'Healthy'     },
    { id: 'caries',      label: 'Caries'      },
    { id: 'restoration', label: 'Restoration' },
    { id: 'missing',     label: 'Missing'     },
    { id: 'implant',     label: 'Implant'     },
  ];

  @Input() fileAccess: FileAccessInfo | null = null;

  db: Record<number, DiagnosisRecord> = {};
  activeTooth:      number | null = null;
  selectedCondition = 'healthy';
  noteText          = '';
  modalOpen         = false;

  constructor(private dentalChartService: DentalChartService) {}

  ngOnInit(): void {
    if (this.recordId) {
      this.loadHistoricalNotes();
    }
  }

  private loadHistoricalNotes(): void {
    this.dentalChartService.getByRecord(this.recordId).subscribe({
      next: (res: any) => {
        const rows: any[] = res.data ?? [];
        // Keep only the latest note per tooth (same logic as the read-only view)
        const latestPerTooth = new Map<number, any>();
        for (const r of rows) {
          const toothNum = parseInt(r.tooth_number, 10);
          const existing = latestPerTooth.get(toothNum);
          if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
            latestPerTooth.set(toothNum, r);
          }
        }
        const loaded: Record<number, DiagnosisRecord> = {};
        latestPerTooth.forEach((r, toothNum) => {
          loaded[toothNum] = {
            condition: this.detectCondition(r.tooth_note),
            note:      r.tooth_note ?? '',
            savedAt:   new Date(r.created_at).toLocaleString('en-GB', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            }),
          };
        });
        // Only set if the student hasn't already started local drafts
        this.db = { ...loaded, ...this.db };
      },
      error: () => {},
    });
  }

  private detectCondition(toothNote: string): string {
    const n = (toothNote ?? '').toLowerCase();
    if (n.includes('caries'))      return 'caries';
    if (n.includes('restoration')) return 'restoration';
    if (n.includes('missing'))     return 'missing';
    if (n.includes('implant'))     return 'implant';
    return 'healthy';
  }

  // True only when the student has an active write window for this patient.
  // When patientId is absent the component is not access-gated.
  get isWriteMode(): boolean {
    if (!this.patientId) return true;
    return this.fileAccess !== null && this.fileAccess.accessType === 'write';
  }

  // ─── Existing methods (unchanged) ──────────────────────────────────────────

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalOpen) this.closeModal();
  }

  get annotatedTeeth(): Array<{ tooth: number; record: DiagnosisRecord }> {
    return Object.entries(this.db)
      .filter(([, r]) => r.note)
      .map(([k, r]) => ({ tooth: +k, record: r }))
      .sort((a, b) => a.tooth - b.tooth);
  }

  get annotatedCount(): number {
    return this.annotatedTeeth.length;
  }

  openModal(toothNum: number): void {
    this.activeTooth       = toothNum;
    const existing         = this.db[toothNum];
    this.selectedCondition = existing ? existing.condition : 'healthy';
    this.noteText          = existing ? existing.note      : '';
    this.modalOpen         = true;
  }

  closeModal(): void {
    this.activeTooth       = null;
    this.noteText          = '';
    this.selectedCondition = 'healthy';
    this.modalOpen         = false;
  }

  saveModal(): void {
    if (this.activeTooth === null) return;
    const now = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    this.db = {
      ...this.db,
      [this.activeTooth]: {
        condition: this.selectedCondition,
        note:      this.noteText.trim(),
        savedAt:   now,
      },
    };
    this.closeModal();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('overlay')) {
      this.closeModal();
    }
  }

  deleteToothConfirm: number | null = null;

  confirmDelete(toothNum: number, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteToothConfirm = toothNum;
  }

  cancelDelete(): void {
    this.deleteToothConfirm = null;
  }

  executeDelete(): void {
    if (this.deleteToothConfirm === null) return;
    const updated = { ...this.db };
    delete updated[this.deleteToothConfirm];
    this.db = updated;
    this.deleteToothConfirm = null;
  }

  getConditionClasses(toothNum: number): Record<string, boolean> {
    const cond = this.db[toothNum]?.condition;
    return {
      caries:          cond === 'caries',
      restoration:     cond === 'restoration',
      missing:         cond === 'missing',
      implant:         cond === 'implant',
      'no-pointer-events': !this.isWriteMode && !this.db[toothNum],
    };
  }

  capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
