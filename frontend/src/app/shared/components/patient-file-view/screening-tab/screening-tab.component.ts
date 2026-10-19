import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScreeningService, TodaysAppointmentDto } from '../../../../services/screening.service';
import { ScreeningRequestsService } from '../../../../services/screening-requests.service';
import { PatientFileRole } from '../../../types/patient-file.types';
import { Screening } from '../../../types/screening.types';
import {
  ScreeningImageType,
  SCREENING_IMAGE_TYPES,
} from '../../../enums/screening-image-type.enum';
import { ScreeningLightboxComponent } from './screening-lightbox.component';
import { DeleteScreeningDialogComponent } from './delete-screening-dialog.component';

interface ScreeningVM extends Screening {
  thumb_url?: string;
}

type TodaysApptView = TodaysAppointmentDto;

// Screening request status as returned by the screening-requests API.
interface ActiveRequest {
  request_id:   number;
  patient_id:   number;
  appointment_id: number | null;
  request_status: string;
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ScreeningLightboxComponent,
    DeleteScreeningDialogComponent,
  ],
  providers: [DatePipe],
  selector: 'app-screening-tab',
  templateUrl: './screening-tab.component.html',
  styleUrls: ['./screening-tab.component.css'],
})
export class ScreeningTabComponent implements OnInit, OnDestroy {
  @Input({ required: true }) patientId!: number;
  @Input({ required: true }) recordId!: number;
  @Input({ required: true }) userRole!: PatientFileRole;
  @Input() isWriteMode = true;
  @Input() appointmentId: number | null = null;  // current appointment context

  screenings: ScreeningVM[] = [];
  loading = true;
  error: string | null = null;

  // Doctor/Student: pending screening request for the current appointment
  activeRequest: ActiveRequest | null = null;
  requestLoading  = false;
  requestSent     = false;
  showRequestConfirm = false;

  filterType: ScreeningImageType | 'all' = 'all';
  readonly typeOptions = SCREENING_IMAGE_TYPES;

  showDeleteDialog = false;
  pendingDelete: Screening | null = null;

  lightboxOpen: ScreeningVM | null = null;

  toast: { kind: 'success' | 'error'; text: string } | null = null;

  constructor(
    private screeningService: ScreeningService,
    private screeningRequestsService: ScreeningRequestsService,
  ) {}

  ngOnInit(): void {
    if (this.recordId) this.loadScreenings();
    if (this.isClinician && this.appointmentId) this.checkActiveRequest();
  }

  ngOnDestroy(): void {
    for (const s of this.screenings) if (s.thumb_url) URL.revokeObjectURL(s.thumb_url);
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  private loadScreenings(): void {
    this.loading = true;
    this.screeningService.listByRecord(this.recordId).subscribe({
      next: (rows) => {
        this.screenings = rows.map(r => ({ ...r }));
        this.loading = false;
        this.prefetchThumbnails();
      },
      error: () => { this.loading = false; this.error = 'Failed to load screenings'; },
    });
  }

  private checkActiveRequest(): void {
    if (!this.appointmentId) return;
    this.screeningRequestsService.listByRecord(this.recordId).subscribe({
      next: (requests) => {
        const pending = requests.find(
          r => r.appointment_id === this.appointmentId && r.request_status === 'Pending',
        );
        this.activeRequest = pending
          ? {
              request_id:     pending.request_id,
              patient_id:     pending.patient_id,
              appointment_id: pending.appointment_id,
              request_status: pending.request_status,
            }
          : null;
      },
      error: () => {},
    });
  }

  private prefetchThumbnails(): void {
    for (const s of this.screenings) {
      if (s.thumb_url) continue;
      this.screeningService.fetchAsObjectUrl(s.image_id).subscribe({
        next: (url) => { s.thumb_url = url; },
        error: () => {},
      });
    }
  }

  // ─── Derived state ─────────────────────────────────────────────────────────

  // Upload is Radiologist-only — no other portal shows the upload button here.
  get canUpload(): boolean { return false; }

  get isAdmin(): boolean { return this.userRole === PatientFileRole.Admin; }
  get isDA():    boolean { return this.userRole === PatientFileRole.DentalAssistant; }
  get isClinician(): boolean {
    return this.userRole === PatientFileRole.Doctor || this.userRole === PatientFileRole.Student;
  }
  get isRadiologist(): boolean { return this.userRole === PatientFileRole.Radiologist; }

  // Doctor/Student can request a screening if:
  //   - they have a current appointment context
  //   - no active pending request already exists for this appointment
  get canRequestScreening(): boolean {
    return this.isClinician && !!this.appointmentId && !this.activeRequest;
  }

  get hasPendingRequest(): boolean {
    return this.isClinician && !!this.appointmentId && !!this.activeRequest;
  }

  get filteredScreenings(): ScreeningVM[] {
    if (this.filterType === 'all') return this.screenings;
    return this.screenings.filter(s => s.image_type === this.filterType);
  }

  get groupedByDate(): Array<{ date: string; label: string; items: ScreeningVM[] }> {
    const groups = new Map<string, ScreeningVM[]>();
    for (const s of this.filteredScreenings) {
      const key = s.uploaded_at.slice(0, 10);
      const list = groups.get(key) ?? [];
      list.push(s);
      groups.set(key, list);
    }
    const today = new Date().toISOString().slice(0, 10);
    return Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, items]) => ({
        date,
        label: date === today ? 'Today' : this.formatDateLabel(date),
        items,
      }));
  }

  get summaryStats(): { total: number; byType: Array<{ type: string; count: number }> } {
    const counts = new Map<string, number>();
    for (const s of this.screenings) counts.set(s.image_type, (counts.get(s.image_type) ?? 0) + 1);
    return {
      total: this.screenings.length,
      byType: Array.from(counts.entries()).map(([type, count]) => ({ type, count })),
    };
  }

  countForType(type: string): number {
    return this.screenings.filter(s => s.image_type === type).length;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  openRequestConfirm(): void { this.showRequestConfirm = true; }
  cancelRequestConfirm(): void { this.showRequestConfirm = false; }

  sendScreeningRequest(): void {
    if (!this.canRequestScreening || !this.appointmentId) return;
    this.showRequestConfirm = false;
    this.requestLoading = true;
    this.screeningRequestsService.create({
      record_id:      this.recordId,
      patient_id:     this.patientId,
      appointment_id: this.appointmentId,
    }).subscribe({
      next: (result) => {
        this.requestLoading = false;
        this.activeRequest  = {
          request_id:     result.request_id,
          patient_id:     this.patientId,
          appointment_id: this.appointmentId,
          request_status: 'Pending',
        };
        this.showToast('success', 'Tell the patient to see the Radiologist for screening.');
      },
      error: () => {
        this.requestLoading = false;
        this.showToast('error', 'Failed to send screening request. Please try again.');
      },
    });
  }

  askDelete(s: ScreeningVM): void {
    this.pendingDelete = s;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.pendingDelete) return;
    const id = this.pendingDelete.image_id;
    this.screeningService.delete(id).subscribe({
      next: () => {
        this.screenings = this.screenings.filter(s => s.image_id !== id);
        this.showDeleteDialog = false;
        this.pendingDelete = null;
        this.showToast('success', 'Image deleted');
      },
      error: () => { this.showToast('error', 'Failed to delete image'); },
    });
  }

  cancelDelete(): void { this.showDeleteDialog = false; this.pendingDelete = null; }

  openLightbox(s: ScreeningVM): void { this.lightboxOpen = s; }
  closeLightbox(): void { this.lightboxOpen = null; }

  navigateLightbox(direction: 'prev' | 'next'): void {
    if (!this.lightboxOpen) return;
    const list = this.filteredScreenings;
    const idx  = list.findIndex(s => s.image_id === this.lightboxOpen!.image_id);
    if (idx === -1) return;
    const next = direction === 'next' ? idx + 1 : idx - 1;
    if (next < 0 || next >= list.length) return;
    this.lightboxOpen = list[next];
  }

  // ─── Display helpers ───────────────────────────────────────────────────────

  typeBadgeClass(type: string): string {
    const map: Record<string, string> = {
      'Panoramic (OPG)':   'bg-indigo-100 text-indigo-700',
      'Periapical (PA)':   'bg-emerald-100 text-emerald-700',
      'Bitewing (BW)':     'bg-sky-100 text-sky-700',
      'Occlusal':          'bg-amber-100 text-amber-700',
      'Cephalometric':     'bg-purple-100 text-purple-700',
      'CBCT':              'bg-rose-100 text-rose-700',
      'Intraoral Photo':   'bg-orange-100 text-orange-700',
      'Extraoral Photo':   'bg-pink-100 text-pink-700',
    };
    return map[type] ?? 'bg-gray-100 text-gray-700';
  }

  private formatDateLabel(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  private showToast(kind: 'success' | 'error', text: string): void {
    this.toast = { kind, text };
    setTimeout(() => { this.toast = null; }, 3500);
  }
}
