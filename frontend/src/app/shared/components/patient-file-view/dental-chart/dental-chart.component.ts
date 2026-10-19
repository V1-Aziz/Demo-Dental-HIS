import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DentalChartService } from '../../../../services/dental-chart.service';
import { ToothHistoryModalComponent } from './tooth-history-modal/tooth-history-modal.component';

type ToothState = 'Healthy' | 'Caries' | 'Restoration' | 'Missing' | 'Implant' | null;

interface ToothData {
  tooth_number: string;
  tooth_note:   string;
  author_name:  string;
  created_at:   string;
}

@Component({
  standalone: true,
  imports:    [CommonModule, ToothHistoryModalComponent],
  selector:   'app-dental-chart-view',
  template: `
    <div class="chart-wrapper">
      <!-- Legend -->
      <div class="legend">
        <span *ngFor="let c of conditionColors" class="legend-item">
          <span class="legend-dot" [style.background]="c.color"></span>{{ c.label }}
        </span>
      </div>

      <!-- Grid -->
      <div class="chart-grid">
        <div *ngFor="let quad of quadrants" class="quadrant" [class.reversed]="quad.reversed">
          <div class="quad-label">{{ quad.label }}</div>
          <div class="tooth-row" [class.reversed]="quad.reversed">
            <div
              *ngFor="let t of quad.teeth"
              class="tooth-cell"
              [class.has-note]="getState(t)"
              [style.background]="getColor(t)"
              [title]="getNote(t)"
              (click)="openHistory(t)"
            >
              <span class="tooth-num">{{ t }}</span>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="info-text">Loading chart…</div>

      <!-- Tooth history modal -->
      <app-tooth-history-modal
        *ngIf="historyTooth"
        [patientId]="patientId"
        [toothNumber]="historyTooth"
        (close)="historyTooth = null"
      ></app-tooth-history-modal>
    </div>
  `,
  styles: [`
    .chart-wrapper { background: white; border-radius: 8px; padding: 20px; }
    .legend { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; color: #475569; }
    .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .quadrant { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; }
    .quad-label { font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .quadrant.reversed .quad-label { text-align: right; }
    .tooth-row { display: flex; gap: 4px; }
    .tooth-row.reversed { flex-direction: row-reverse; width: fit-content; margin-left: auto; }
    .tooth-cell {
      width: 34px; height: 44px; border: 1px solid #e2e8f0; border-radius: 4px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      transition: transform 0.1s; background: #f8fafc;
    }
    .tooth-cell:hover { transform: scale(1.12); border-color: #94a3b8; z-index: 1; }
    .tooth-cell.has-note { border-color: transparent; }
    .tooth-num { font-size: 0.65rem; font-weight: 700; color: #1e293b; }
    .info-text { color: #94a3b8; font-style: italic; text-align: center; padding: 16px; }
  `],
})
export class DentalChartViewComponent implements OnInit {
  @Input({ required: true }) patientId!: number;
  @Input({ required: true }) recordId!:  number;

  loading    = true;
  notes:     ToothData[] = [];
  historyTooth: string | null = null;

  readonly conditionColors = [
    { label: 'Caries',       color: '#ef4444' },
    { label: 'Restoration',  color: '#3b82f6' },
    { label: 'Missing',      color: '#94a3b8' },
    { label: 'Implant',      color: '#10b981' },
  ];

  readonly quadrants = [
    { label: 'Upper Right (1x)', teeth: [18,17,16,15,14,13,12,11], reversed: true  },
    { label: 'Upper Left (2x)',  teeth: [21,22,23,24,25,26,27,28], reversed: false },
    { label: 'Lower Right (4x)', teeth: [48,47,46,45,44,43,42,41], reversed: true  },
    { label: 'Lower Left (3x)',  teeth: [31,32,33,34,35,36,37,38], reversed: false },
  ];

  private stateMap = new Map<string, ToothData>();

  constructor(private svc: DentalChartService) {}

  ngOnInit(): void {
    this.svc.getByRecord(this.recordId).subscribe({
      next: (res: any) => {
        const rows: any[] = res.data ?? [];
        this.notes = rows;
        this.stateMap.clear();
        // Keep latest note per tooth
        for (const r of rows) {
          const existing = this.stateMap.get(r.tooth_number);
          if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
            this.stateMap.set(r.tooth_number, r);
          }
        }
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  getState(tooth: number): boolean {
    return this.stateMap.has(String(tooth));
  }

  getColor(tooth: number): string {
    const note = this.stateMap.get(String(tooth))?.tooth_note?.toLowerCase() ?? '';
    // Problem conditions (red) — original + new visit vocabulary
    if (note.includes('caries') || note.includes('cavity') ||
        note.includes('fracture') || note.includes('periapical') ||
        note.includes('gingivitis'))
      return '#fecaca';
    // Treated / restored (blue)
    if (note.includes('restoration') || note.includes('treated') ||
        note.includes('filling') || note.includes('crown') ||
        note.includes('rct') || note.includes('scaling'))
      return '#bfdbfe';
    // Missing (gray)
    if (note.includes('missing')) return '#e2e8f0';
    // Implant (green)
    if (note.includes('implant')) return '#a7f3d0';
    // Has some note but no mapped condition
    return this.stateMap.has(String(tooth)) ? '#fef9c3' : '#f8fafc';
  }

  getNote(tooth: number): string {
    return this.stateMap.get(String(tooth))?.tooth_note ?? '';
  }

  openHistory(tooth: number): void {
    this.historyTooth = String(tooth);
  }
}
