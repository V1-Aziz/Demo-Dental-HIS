import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PatientFileService } from '../../../../../services/patient-file.service';

@Component({
  standalone: true,
  imports:    [CommonModule, FormsModule],
  selector:   'app-all-visits-content',
  template: `
    <div class="all-visits-panel">
      <div class="filter-bar">
        <input
          type="text"
          [(ngModel)]="search"
          (ngModelChange)="applyFilter()"
          placeholder="Search visits…"
          class="search-input"
        />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="filter-select">
          <option value="all">All Statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      <div *ngIf="loading" class="info-text">Loading visits…</div>

      <div *ngFor="let v of filtered" class="visit-row" (click)="selectVisit(v)">
        <div class="row-date">{{ v.appointment_date | date:'d MMM y' }}</div>
        <div class="row-main">
          <span class="row-type">{{ v.appointment_type }}</span>
          <span *ngIf="v.is_today" class="today-tag">Today</span>
          <span class="row-summary">{{ v.one_line_summary }}</span>
        </div>
        <div class="row-counts">
          <span *ngIf="v.entry_counts.diagnoses"    class="count-chip purple">Dx {{ v.entry_counts.diagnoses }}</span>
          <span *ngIf="v.entry_counts.treatments"   class="count-chip green">Tx {{ v.entry_counts.treatments }}</span>
          <span *ngIf="v.entry_counts.screenings"   class="count-chip blue">Sc {{ v.entry_counts.screenings }}</span>
          <span *ngIf="v.entry_counts.dental_notes" class="count-chip amber">Dc {{ v.entry_counts.dental_notes }}</span>
        </div>
      </div>

      <div *ngIf="!loading && filtered.length === 0" class="info-text">No visits match your filters.</div>
    </div>
  `,
  styles: [`
    .all-visits-panel { background: white; border-radius: 8px; padding: 16px; }
    .filter-bar { display: flex; gap: 10px; margin-bottom: 16px; }
    .search-input { flex: 1; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.88rem; }
    .filter-select { padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.88rem; }
    .visit-row { display: flex; align-items: center; gap: 12px; padding: 10px; border-bottom: 1px solid #f1f5f9; cursor: pointer; border-radius: 4px; }
    .visit-row:hover { background: #f8fafc; }
    .row-date { font-size: 0.8rem; color: #64748b; width: 90px; flex-shrink: 0; font-weight: 600; }
    .row-main { flex: 1; }
    .row-type { font-weight: 600; font-size: 0.88rem; color: #1e293b; margin-right: 6px; }
    .today-tag { background: #10b981; color: white; font-size: 0.65rem; padding: 1px 6px; border-radius: 8px; margin-right: 6px; font-weight: 700; }
    .row-summary { font-size: 0.8rem; color: #64748b; }
    .row-counts { display: flex; gap: 4px; }
    .count-chip { font-size: 0.68rem; font-weight: 700; border-radius: 8px; padding: 2px 6px; }
    .purple { background: #ede9fe; color: #7c3aed; }
    .green  { background: #dcfce7; color: #15803d; }
    .blue   { background: #dbeafe; color: #1d4ed8; }
    .amber  { background: #fef3c7; color: #b45309; }
    .info-text { color: #94a3b8; font-style: italic; padding: 16px 0; text-align: center; }
  `],
})
export class AllVisitsContentComponent implements OnInit {
  @Input({ required: true }) patientId!: number;

  loading      = true;
  allVisits:   any[] = [];
  filtered:    any[] = [];
  search       = '';
  statusFilter = 'all';

  constructor(private svc: PatientFileService) {}

  ngOnInit(): void {
    this.svc.getVisitTimeline(this.patientId).subscribe({
      next: (res: any) => {
        // Flatten the grouped timeline into a flat sorted list
        const grouped = res.data?.grouped ?? [];
        const flat: any[] = [];
        for (const yr of grouped) {
          for (const mo of yr.months) {
            flat.push(...mo.visits);
          }
        }
        this.allVisits = flat;
        this.filtered  = flat;
        this.loading   = false;
      },
      error: () => { this.loading = false; },
    });
  }

  applyFilter(): void {
    this.filtered = this.allVisits.filter((v) => {
      const matchStatus = this.statusFilter === 'all' || v.status === this.statusFilter;
      const q = this.search.toLowerCase();
      const matchSearch = !q ||
        v.appointment_type.toLowerCase().includes(q) ||
        v.one_line_summary.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }

  selectVisit(_v: any): void {
    // Handled by parent — emitting could be added if needed
  }
}
