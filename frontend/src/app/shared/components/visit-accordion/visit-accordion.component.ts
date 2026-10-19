import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PatientFileService } from '../../../services/patient-file.service';

export interface VisitSelection {
  appointmentId: number | 'all';
  dateLabel:     string;
}

@Component({
  standalone: true,
  imports:    [CommonModule],
  selector:   'app-visit-accordion',
  template: `
    <div class="accordion-container">

      <!-- All visits shortcut -->
      <div
        class="accordion-item all-visits-item"
        [class.selected]="selectedId === 'all'"
        (click)="select('all', 'All Visits')"
      >
        <span class="all-label">All Visits</span>
        <span class="badge total-badge">{{ totalVisits }}</span>
      </div>

      <!-- Year groups -->
      <div *ngFor="let yearGroup of grouped" class="year-group">
        <div class="year-header" (click)="toggleYear(yearGroup.year)">
          <span class="chevron" [class.open]="expandedYears.has(yearGroup.year)">›</span>
          <span class="year-label">{{ yearGroup.year }}</span>
          <span class="badge">{{ yearGroup.count }}</span>
        </div>

        <div *ngIf="expandedYears.has(yearGroup.year)" class="month-group-list">
          <div *ngFor="let monthGroup of yearGroup.months" class="month-group">
            <div class="month-header" (click)="toggleMonth(yearGroup.year, monthGroup.month)">
              <span class="chevron" [class.open]="expandedMonths.has(yearGroup.year + '-' + monthGroup.month)">›</span>
              <span class="month-label">{{ monthGroup.name }}</span>
              <span class="badge">{{ monthGroup.count }}</span>
            </div>

            <div *ngIf="expandedMonths.has(yearGroup.year + '-' + monthGroup.month)" class="day-list">
              <div
                *ngFor="let visit of monthGroup.visits"
                class="day-item"
                [class.selected]="selectedId === visit.appointment_id"
                (click)="select(visit.appointment_id, visit.appointment_date)"
              >
                <div class="day-item-header">
                  <span class="day-num">{{ visit.appointment_date | date:'d MMM' }}</span>
                  <span *ngIf="visit.is_today" class="today-badge">Today</span>
                  <span class="entry-count" *ngIf="visit.total_count > 0">{{ visit.total_count }}</span>
                </div>
                <div class="day-summary" *ngIf="visit.one_line_summary">{{ visit.one_line_summary }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading / empty -->
      <div *ngIf="loading" class="accordion-loading">Loading visits…</div>
      <div *ngIf="!loading && grouped.length === 0" class="accordion-empty">No visits recorded</div>
    </div>
  `,
  styles: [`
    .accordion-container { font-family: inherit; font-size: 0.85rem; user-select: none; }
    .all-visits-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; cursor: pointer; border-radius: 6px;
      margin-bottom: 4px; font-weight: 600;
    }
    .all-visits-item:hover, .day-item:hover { background: #f1f5f9; }
    .all-visits-item.selected, .day-item.selected {
      background: #FAEEDA; border-left: 3px solid #d69e2e;
    }
    .year-header, .month-header {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px; cursor: pointer; font-weight: 600; border-radius: 4px;
    }
    .year-header:hover, .month-header:hover { background: #f8fafc; }
    .year-label { flex: 1; }
    .month-label { flex: 1; font-weight: 500; font-size: 0.82rem; }
    .chevron { transition: transform 0.2s; display: inline-block; font-size: 1.1rem; }
    .chevron.open { transform: rotate(90deg); }
    .badge {
      background: #e2e8f0; color: #475569; border-radius: 10px;
      padding: 1px 7px; font-size: 0.75rem; font-weight: 600;
    }
    .total-badge { background: #dbeafe; color: #1d4ed8; }
    .month-group-list { padding-left: 8px; }
    .day-list { padding-left: 8px; }
    .day-item { padding: 7px 10px; cursor: pointer; border-radius: 5px; margin-bottom: 2px; }
    .day-item-header { display: flex; align-items: center; gap: 6px; }
    .day-num { font-weight: 500; }
    .today-badge {
      background: #10b981; color: white; font-size: 0.68rem;
      padding: 1px 6px; border-radius: 8px; font-weight: 700;
    }
    .entry-count {
      margin-left: auto; background: #f1f5f9; color: #64748b;
      font-size: 0.72rem; padding: 1px 6px; border-radius: 8px;
    }
    .day-summary { font-size: 0.76rem; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .accordion-loading, .accordion-empty { padding: 16px 12px; color: #94a3b8; font-style: italic; }
  `],
})
export class VisitAccordionComponent implements OnInit {
  @Input({ required: true }) patientId!: number;
  @Output() visitSelected = new EventEmitter<VisitSelection>();

  loading     = true;
  totalVisits = 0;
  grouped:    any[] = [];
  selectedId: number | 'all' = 'all';

  expandedYears  = new Set<number>();
  expandedMonths = new Set<string>();

  constructor(private svc: PatientFileService) {}

  ngOnInit(): void {
    this.svc.getVisitTimeline(this.patientId).subscribe({
      next: (res: any) => {
        const data = res.data;
        this.totalVisits = data.total_visits;
        this.grouped     = data.grouped;
        this.loading     = false;

        // Auto-expand current year and month
        const now   = new Date();
        const year  = now.getFullYear();
        const month = now.getMonth() + 1;
        this.expandedYears.add(year);
        this.expandedMonths.add(`${year}-${month}`);

        // Pre-select today's visit or 'all'
        if (data.today_visit_id) {
          this.selectedId = data.today_visit_id;
          this.visitSelected.emit({ appointmentId: data.today_visit_id, dateLabel: 'Today' });
        } else {
          this.visitSelected.emit({ appointmentId: 'all', dateLabel: 'All Visits' });
        }
      },
      error: () => { this.loading = false; },
    });
  }

  select(id: number | 'all', label: string): void {
    this.selectedId = id;
    this.visitSelected.emit({ appointmentId: id, dateLabel: label });
  }

  toggleYear(year: number): void {
    this.expandedYears.has(year) ? this.expandedYears.delete(year) : this.expandedYears.add(year);
  }

  toggleMonth(year: number, month: number): void {
    const key = `${year}-${month}`;
    this.expandedMonths.has(key) ? this.expandedMonths.delete(key) : this.expandedMonths.add(key);
  }
}
