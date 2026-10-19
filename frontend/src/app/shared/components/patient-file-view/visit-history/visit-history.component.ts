import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VisitAccordionComponent, VisitSelection } from '../../visit-accordion/visit-accordion.component';
import { VisitContentComponent } from './visit-content/visit-content.component';
import { AllVisitsContentComponent } from './all-visits-content/all-visits-content.component';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    VisitAccordionComponent,
    VisitContentComponent,
    AllVisitsContentComponent,
  ],
  selector: 'app-visit-history',
  template: `
    <div class="vh-shell">
      <aside class="accordion-pane">
        <app-visit-accordion
          [patientId]="patientId"
          (visitSelected)="onVisitSelected($event)"
        ></app-visit-accordion>
      </aside>

      <section class="content-pane">
        <app-all-visits-content
          *ngIf="selectedVisit === 'all'"
          [patientId]="patientId"
        ></app-all-visits-content>

        <app-visit-content
          *ngIf="selectedVisit !== 'all' && selectedVisit !== null"
          [patientId]="patientId"
          [appointmentId]="$any(selectedVisit)"
        ></app-visit-content>

        <div *ngIf="selectedVisit === null" class="placeholder">Select a visit from the left panel.</div>
      </section>
    </div>
  `,
  styles: [`
    .vh-shell {
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 420px;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    .accordion-pane {
      background: #f9fafb;
      border-right: 1px solid #e5e7eb;
      padding: 12px 10px;
      overflow-y: auto;
    }
    .content-pane {
      padding: 16px 20px;
      background: #ffffff;
      overflow-y: auto;
    }
    .placeholder {
      color: #94a3b8;
      font-style: italic;
      padding: 40px;
      text-align: center;
    }
  `],
})
export class VisitHistoryComponent {
  @Input({ required: true }) patientId!: number;

  selectedVisit: number | 'all' | null = null;

  onVisitSelected(sel: VisitSelection): void {
    this.selectedVisit = sel.appointmentId;
  }
}
