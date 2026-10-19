import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

type ReviewStatus = 'Submitted' | 'Approved' | 'Rejected' | 'Revision_Requested';

@Component({
  standalone: true,
  selector: 'app-status-badge',
  imports: [CommonModule],
  template: `
    <span [class]="badgeClass" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold">
      {{ label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() status: ReviewStatus = 'Submitted';

  get label(): string {
    switch (this.status) {
      case 'Submitted':          return 'Pending Review';
      case 'Approved':           return 'Approved';
      case 'Rejected':           return 'Rejected';
      case 'Revision_Requested': return 'Revision Requested';
    }
  }

  get badgeClass(): string {
    switch (this.status) {
      case 'Submitted':          return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'Approved':           return 'bg-green-50 text-green-800 border border-green-200';
      case 'Rejected':           return 'bg-red-50 text-red-800 border border-red-200';
      case 'Revision_Requested': return 'bg-orange-50 text-orange-800 border border-orange-200';
    }
  }
}
