import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScreeningService, TodaysAppointmentDto } from '../../../../services/screening.service';
import { Screening, ScreeningUploadMeta } from '../../../types/screening.types';
import {
  ScreeningImageType,
  SCREENING_IMAGE_TYPES,
} from '../../../enums/screening-image-type.enum';

interface PendingFile {
  file:          File;
  previewUrl:    string;
  imageType:     ScreeningImageType | '';
  notes:         string;
  sizeError?:    string;
  typeError?:    string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES     = 10;
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png']);

@Component({
  standalone: true,
  imports:    [CommonModule, FormsModule],
  selector:   'app-upload-screening-modal',
  templateUrl: './upload-screening-modal.component.html',
  styleUrls:  ['./upload-screening-modal.component.css'],
})
export class UploadScreeningModalComponent implements OnInit {
  @Input({ required: true }) patientId!: number;
  // Seed appointment shown by default (first/earliest eligible).  The dropdown
  // below is populated from `todaysAppointments`; `todaysAppt` is the initial
  // selection.
  @Input({ required: true }) todaysAppt!: TodaysAppointmentDto;
  // Full list of today's eligible appointments — when >1 the modal renders a
  // picker so the DA attaches the upload to the right visit.  Defaults to a
  // single-entry array containing `todaysAppt` if the parent didn't hydrate it.
  @Input() todaysAppointments: TodaysAppointmentDto[] = [];

  @Output() uploaded  = new EventEmitter<Screening[]>();
  @Output() cancelled = new EventEmitter<void>();

  pending: PendingFile[] = [];
  submitting = false;
  globalError: string | null = null;

  selectedAppointmentId!: number;

  readonly typeOptions = SCREENING_IMAGE_TYPES;

  constructor(private screeningService: ScreeningService) {}

  ngOnInit(): void {
    if (!this.todaysAppointments || this.todaysAppointments.length === 0) {
      this.todaysAppointments = [this.todaysAppt];
    }
    this.selectedAppointmentId = this.todaysAppt?.appointment_id
      ?? this.todaysAppointments[0].appointment_id;
  }

  // ─── Appointment picker ────────────────────────────────────────────────────

  get hasMultipleAppointments(): boolean { return this.todaysAppointments.length > 1; }

  get selectedAppointment(): TodaysAppointmentDto {
    return this.todaysAppointments.find(a => a.appointment_id === this.selectedAppointmentId)
        ?? this.todaysAppt;
  }

  // ─── File selection ────────────────────────────────────────────────────────

  onFilesChosen(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    if (!input.files) return;
    this.addFiles(Array.from(input.files));
    input.value = ''; // allow re-choosing the same file later if user removed it
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    if (!ev.dataTransfer?.files) return;
    this.addFiles(Array.from(ev.dataTransfer.files));
  }

  onDragOver(ev: DragEvent): void { ev.preventDefault(); }

  private addFiles(files: File[]): void {
    this.globalError = null;
    for (const f of files) {
      if (this.pending.length >= MAX_FILES) {
        this.globalError = `Maximum ${MAX_FILES} images per upload`;
        break;
      }
      // Dedupe by name + size + lastModified — covers the common "drag the
      // same file twice" mistake without needing a content hash.
      const isDup = this.pending.some(p =>
        p.file.name === f.name &&
        p.file.size === f.size &&
        p.file.lastModified === f.lastModified,
      );
      if (isDup) continue;

      const entry: PendingFile = {
        file: f,
        previewUrl: URL.createObjectURL(f),
        imageType: '',
        notes: '',
      };
      this.validateEntry(entry);
      this.pending.push(entry);
    }
  }

  removeEntry(i: number): void {
    const [removed] = this.pending.splice(i, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
  }

  // ─── Per-entry validation ──────────────────────────────────────────────────

  onTypeChange(entry: PendingFile): void { this.validateEntry(entry); }

  private validateEntry(entry: PendingFile): void {
    entry.sizeError = entry.file.size > MAX_FILE_SIZE ? 'File exceeds 10 MB' : undefined;
    const mime = (entry.file.type || '').toLowerCase();
    entry.typeError = !ACCEPTED_MIME.has(mime) ? 'Only JPEG or PNG is accepted' : undefined;
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  get canSubmit(): boolean {
    if (this.submitting) return false;
    if (this.pending.length === 0) return false;
    if (!this.selectedAppointmentId) return false;
    return this.pending.every(p => !!p.imageType && !p.sizeError && !p.typeError);
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.globalError = null;

    const files = this.pending.map(p => p.file);
    const metas: ScreeningUploadMeta[] = this.pending.map(p => {
      const meta: ScreeningUploadMeta = { image_type: p.imageType as ScreeningImageType };
      if (p.notes.trim()) meta.notes = p.notes.trim();
      return meta;
    });

    this.screeningService
      .upload(this.patientId, files, metas, this.selectedAppointmentId)
      .subscribe({
        next: (created) => {
          this.submitting = false;
          this.cleanupPreviews();
          this.uploaded.emit(created);
        },
        error: (err) => {
          this.submitting = false;
          this.globalError = err?.error?.error ?? 'Upload failed';
        },
      });
  }

  cancel(): void {
    this.cleanupPreviews();
    this.cancelled.emit();
  }

  private cleanupPreviews(): void {
    for (const p of this.pending) URL.revokeObjectURL(p.previewUrl);
    this.pending = [];
  }

  trackByRef(_i: number, p: PendingFile): File { return p.file; }

  get totalSizeMb(): string {
    const bytes = this.pending.reduce((acc, p) => acc + p.file.size, 0);
    return (bytes / (1024 * 1024)).toFixed(1);
  }
}
