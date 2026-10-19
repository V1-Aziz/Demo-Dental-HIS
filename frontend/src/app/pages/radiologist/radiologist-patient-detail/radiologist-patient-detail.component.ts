import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RadiologistService } from '../../../services/radiologist.service';
import { ScreeningService } from '../../../services/screening.service';
import {
  RadiologistPatientRow,
  RadiologistAppointmentDto,
} from '../../../shared/types/screening.types';
import { Screening, ScreeningUploadMeta } from '../../../shared/types/screening.types';
import { ScreeningImageType } from '../../../shared/enums/screening-image-type.enum';

interface UploadFileRow {
  file:       File;
  previewUrl: string;
  imageType:  ScreeningImageType | '';
  notes:      string;
  error:      string | null;
}

@Component({
  standalone: false,
  selector: 'app-radiologist-patient-detail',
  templateUrl: './radiologist-patient-detail.component.html',
})
export class RadiologistPatientDetailComponent implements OnInit {
  patientId!: number;
  patient: RadiologistPatientRow | null = null;
  todaysAppointments: RadiologistAppointmentDto[] = [];
  screenings: Array<Screening & { thumb_url?: string }> = [];

  loading        = true;
  screeningError: string | null = null;

  // Upload modal state
  showUploadModal = false;
  selectedApptId: number | null = null;
  uploadFiles: UploadFileRow[] = [];
  uploading   = false;
  uploadError: string | null = null;

  toast: { kind: 'success' | 'error'; text: string } | null = null;

  readonly IMAGE_TYPES = Object.values(ScreeningImageType);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private radiologistService: RadiologistService,
    private screeningService: ScreeningService,
  ) {}

  ngOnInit(): void {
    this.patientId = parseInt(this.route.snapshot.paramMap.get('id') ?? '0', 10);
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    Promise.all([
      this.radiologistService.getPatient(this.patientId).toPromise(),
      this.radiologistService.getTodaysAppointments(this.patientId).toPromise(),
    ]).then(([patient, appts]) => {
      this.patient            = patient ?? null;
      this.todaysAppointments = appts ?? [];
      if (this.todaysAppointments.length) {
        this.selectedApptId = this.todaysAppointments[0].appointment_id;
      }
      this.loading = false;
      this.loadScreenings();
    }).catch(() => {
      this.loading = false;
      this.screeningError = 'Failed to load patient data';
    });
  }

  private loadScreenings(): void {
    // Load screenings via record — we need the record_id for this patient.
    // We use the appointment's record context indirectly via the screening API.
    // The screening list is per record; we show all available for the patient
    // by querying appointments to get a record_id.
    if (!this.todaysAppointments.length) return;
    // We don't have record_id directly here — the screenings are fetched by
    // the upload-complete flow (onUploaded). Initial gallery loads from what
    // the upload response returns.
  }

  get selectedAppointment(): RadiologistAppointmentDto | null {
    return this.todaysAppointments.find(a => a.appointment_id === this.selectedApptId) ?? null;
  }

  get canUpload(): boolean {
    return this.todaysAppointments.length > 0 && this.selectedApptId !== null;
  }

  // ─── Upload modal ──────────────────────────────────────────────────────────

  openUploadModal(): void {
    if (!this.canUpload) return;
    this.uploadFiles = [];
    this.uploadError = null;
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.revokeFilePreviews();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); }

  private addFiles(files: File[]): void {
    for (const f of files) {
      if (this.uploadFiles.length >= 10) break;
      if (!['image/jpeg', 'image/png'].includes(f.type)) continue;
      if (f.size > 10 * 1024 * 1024) {
        this.uploadError = `"${f.name}" exceeds the 10 MB limit.`;
        continue;
      }
      const previewUrl = URL.createObjectURL(f);
      this.uploadFiles.push({ file: f, previewUrl, imageType: '', notes: '', error: null });
    }
  }

  removeFile(index: number): void {
    URL.revokeObjectURL(this.uploadFiles[index].previewUrl);
    this.uploadFiles.splice(index, 1);
  }

  private revokeFilePreviews(): void {
    this.uploadFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
    this.uploadFiles = [];
  }

  get canSubmit(): boolean {
    return this.uploadFiles.length > 0 &&
      this.uploadFiles.every(f => f.imageType !== '') &&
      this.selectedApptId !== null &&
      !this.uploading;
  }

  submitUpload(): void {
    if (!this.canSubmit || !this.selectedApptId) return;
    this.uploading   = true;
    this.uploadError = null;

    const files = this.uploadFiles.map(f => f.file);
    const metas: ScreeningUploadMeta[] = this.uploadFiles.map(f => ({
      image_type: f.imageType as ScreeningImageType,
      notes:      f.notes || undefined,
    }));

    this.screeningService.upload(this.patientId, files, metas, this.selectedApptId)
      .subscribe({
        next: (created) => {
          this.uploading = false;
          const vms = created.map(c => ({ ...c }));
          this.screenings = [...vms, ...this.screenings];
          this.prefetchThumbs(vms);
          this.closeUploadModal();
          this.showToast('success', `${created.length} screening${created.length === 1 ? '' : 's'} uploaded · doctor notified`);
        },
        error: (err) => {
          this.uploading   = false;
          this.uploadError = err?.error?.error ?? 'Upload failed. Please try again.';
        },
      });
  }

  private prefetchThumbs(items: Array<Screening & { thumb_url?: string }>): void {
    for (const s of items) {
      if (s.thumb_url) continue;
      this.screeningService.fetchAsObjectUrl(s.image_id).subscribe({
        next: (url) => { s.thumb_url = url; },
        error: () => {},
      });
    }
  }

  goBack(): void { this.router.navigate(['/radiologist/patients']); }

  private showToast(kind: 'success' | 'error', text: string): void {
    this.toast = { kind, text };
    setTimeout(() => { this.toast = null; }, 3500);
  }

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
}
