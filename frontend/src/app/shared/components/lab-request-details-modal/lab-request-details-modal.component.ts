// Shared lab-request details modal.
// Standalone, OnPush. Input `request` drives visibility (null = hidden).
// Used by StudentLabRequestsComponent; can be reused by any future consumer.
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LabRequestDetail } from '../../types/lab-request.types';
import { LabRequestStatus } from '../../enums/lab-request-status.enum';
import {
  getSupervisorStatus,
  getLabSpecialistStatus,
  supervisorBadgeClass,
  labBadgeClass,
  supervisorStatusIcon,
  labStatusIcon,
} from '../../utils/lab-status.util';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-lab-request-details-modal',
  imports: [CommonModule],
  template: `
    @if (request) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        (click)="onBackdropClick($event)"
      >
        <!-- Panel -->
        <div
          class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden"
          (click)="$event.stopPropagation()"
        >

          <!-- Header -->
          <div class="bg-royal px-6 py-4 flex items-center justify-between text-white flex-shrink-0">
            <div class="flex items-center gap-3">
              <div class="bg-white/10 p-2 rounded-lg">
                <span class="material-symbols-outlined text-2xl text-gold">science</span>
              </div>
              <div>
                <h3 class="text-lg font-bold">Lab Request #{{ request.lab_request_id }}</h3>
                <p class="text-[10px] text-gray-300 font-semibold tracking-widest uppercase">
                  {{ request.patient_name }}
                </p>
              </div>
            </div>
            <button
              (click)="close.emit()"
              class="hover:bg-white/10 p-1.5 rounded-full transition-colors"
              aria-label="Close"
            >
              <span class="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <!-- Scrollable body -->
          <div class="overflow-y-auto flex-1 p-6 space-y-6">

            <!-- (a) Submitted date -->
            <p class="text-xs text-slate-400 font-semibold uppercase tracking-widest">
              Submitted {{ request.request_timestamp | date:'d MMM y' }}
            </p>

            <!-- (b) Dual status cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <!-- Supervisor card -->
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Supervisor Review</p>
                <span
                  [class]="'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ' + supervisorBadge"
                >
                  <span class="material-symbols-outlined" style="font-size:14px">{{ supervisorIcon }}</span>
                  {{ supervisorInfo.label }}
                </span>

                @if (supervisorInfo.isApproved && request.approved_by_name) {
                  <p class="text-xs text-slate-500 mt-1">
                    By <span class="font-semibold text-slate-700">{{ request.approved_by_name }}</span>
                  </p>
                }

                @if (supervisorInfo.isRejected && request.supervisor_feedback) {
                  <div class="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <p class="text-xs text-red-700 leading-relaxed">{{ request.supervisor_feedback }}</p>
                  </div>
                }
              </div>

              <!-- Lab specialist card -->
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lab Specialist</p>
                <span
                  [class]="'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ' + labBadge"
                >
                  <span class="material-symbols-outlined" style="font-size:14px">{{ labIcon }}</span>
                  {{ labInfo.label }}
                </span>

                @if (request.lab_response_note) {
                  <div class="mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <p class="text-xs text-emerald-800 leading-relaxed">{{ request.lab_response_note }}</p>
                  </div>
                }
              </div>

            </div>

            <!-- (c) People grid -->
            <div>
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">People</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Submitted by</p>
                  <p class="text-sm font-semibold text-slate-800">{{ request.submitted_by_name }}</p>
                  <p class="text-xs text-slate-500 mt-0.5">{{ request.submitted_by_role }}</p>
                </div>

                @if (request.approved_by_name) {
                  <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <p class="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Approved by</p>
                    <p class="text-sm font-semibold text-slate-800">{{ request.approved_by_name }}</p>
                  </div>
                }
              </div>
            </div>

            <!-- (d) Work specification -->
            <div>
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Work Specification</p>
              <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p class="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{{ request.request_note }}</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    }
  `,
})
export class LabRequestDetailsModalComponent {
  @Input() request: LabRequestDetail | null = null;
  @Output() close = new EventEmitter<void>();

  // Esc closes the modal when it is open.
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.request !== null) this.close.emit();
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close.emit();
  }

  get supervisorInfo() {
    return getSupervisorStatus(
      (this.request?.request_status ?? LabRequestStatus.Pending) as LabRequestStatus,
    );
  }

  get labInfo() {
    return getLabSpecialistStatus(
      (this.request?.request_status ?? LabRequestStatus.Pending) as LabRequestStatus,
    );
  }

  get supervisorBadge(): string {
    return supervisorBadgeClass(this.supervisorInfo.label);
  }

  get labBadge(): string {
    return labBadgeClass(this.labInfo.label);
  }

  get supervisorIcon(): string {
    return supervisorStatusIcon(this.supervisorInfo.label);
  }

  get labIcon(): string {
    return labStatusIcon(this.labInfo.label);
  }
}
