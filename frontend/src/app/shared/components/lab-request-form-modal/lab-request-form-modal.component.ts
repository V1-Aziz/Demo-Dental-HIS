import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LabService } from '../../../services/lab.service';
import { PatientService } from '../../../services/patient.service';
import { LookupPublicService } from '../../../services/lookup-public.service';

// Fallback list used only while the API call is in-flight.
const LAB_WORK_TYPES_FALLBACK = [
  'PFM crown', 'Zirconia crown', 'Veneer', 'Full denture', 'Partial denture',
  'Bridge 3-unit', 'Bridge 4-unit', 'Inlay', 'Onlay', 'Night guard', 'Retainer', 'Bleaching tray',
];

@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  selector: 'app-lab-request-form-modal',
  template: `
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
         (click)="onOverlay($event)">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="bg-[#1a365d] p-5 flex items-center justify-between text-white">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-2xl" style="color:#d69e2e">science</span>
            <h3 class="text-xl font-bold">Laboratory Order Form</h3>
          </div>
          <button (click)="close()" class="hover:bg-white/10 p-1.5 rounded-full">
            <span class="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="submit()" class="p-8 space-y-6">

          @if (error) {
            <p class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{{ error }}</p>
          }

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Patient File No -->
            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase mb-1">Patient File No</label>
              @if (isLocked) {
                <input type="text" [value]="lockedFileNoDisplay"
                       readonly
                       class="w-full p-3 border border-gray-200 bg-gray-100 text-gray-700 rounded-lg cursor-not-allowed" />
              } @else {
                <input type="text" formControlName="fileNo" placeholder="e.g. 43982"
                       class="w-full p-3 border border-gray-300 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-[#1a365d]/20 focus:border-[#1a365d] outline-none" />
              }
            </div>

            <!-- Work Type -->
            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase mb-1">Work Type <span class="text-red-500">*</span></label>
              <select formControlName="workType"
                      class="w-full p-3 border border-gray-300 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-[#1a365d]/20 focus:border-[#1a365d] outline-none">
                <option value="" disabled>— Select type —</option>
                @for (t of workTypes; track t) {
                  <option [value]="t">{{ t }}</option>
                }
              </select>
            </div>

            <!-- Tooth Number -->
            <div>
              <label class="block text-sm font-bold text-gray-500 uppercase mb-1">
                Tooth Number <span class="text-gray-400 font-normal normal-case text-xs">(optional)</span>
              </label>
              <input type="text" formControlName="toothNumber" placeholder="e.g. 16, 21-23"
                     class="w-full p-3 border border-gray-300 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-[#1a365d]/20 focus:border-[#1a365d] outline-none" />
            </div>
          </div>

          <!-- Clinical Instructions -->
          <div>
            <label class="block text-sm font-bold text-gray-500 uppercase mb-1">Clinical Instructions <span class="text-red-500">*</span></label>
            <textarea rows="4" formControlName="clinicalInstructions"
                      placeholder="Details for the laboratory..."
                      class="w-full p-3 border border-gray-300 bg-white text-gray-900 rounded-lg focus:ring-2 focus:ring-[#1a365d]/20 focus:border-[#1a365d] outline-none resize-none"></textarea>
          </div>

          <div class="flex justify-end gap-3 pt-6 border-t">
            <button type="button" (click)="close()"
                    class="px-6 py-2.5 text-gray-600 font-bold hover:bg-gray-50 rounded-lg">Cancel</button>
            <button type="submit" [disabled]="isSaving"
                    class="px-8 py-2.5 bg-[#1a365d] text-white font-bold rounded-lg hover:bg-[#2c5282] shadow-md disabled:opacity-50">
              {{ isSaving ? 'Sending…' : 'Send to Lab' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class LabRequestFormModalComponent implements OnInit {
  @Input() lockedPatientId?:    number;
  @Input() lockedFileNoDisplay?: string;

  @Output() closed    = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  form!:     FormGroup;
  isSaving = false;
  error    = '';

  workTypes: string[] = LAB_WORK_TYPES_FALLBACK;

  get isLocked(): boolean { return this.lockedPatientId != null; }

  constructor(
    private fb:             FormBuilder,
    private labService:     LabService,
    private patientService: PatientService,
    private lookups:        LookupPublicService,
  ) {}

  ngOnInit(): void {
    this.lookups.getLabels('lab_service_type').subscribe(v => { if (v.length) this.workTypes = v; });
    this.form = this.fb.group({
      fileNo:               [{ value: '', disabled: this.isLocked }],
      workType:             ['', Validators.required],
      toothNumber:          [''],
      clinicalInstructions: ['', [Validators.required, Validators.minLength(1)]],
    });

    if (!this.isLocked) {
      this.form.get('fileNo')!.setValidators(Validators.required);
      this.form.get('fileNo')!.updateValueAndValidity();
    }
  }

  close(): void { this.closed.emit(); }

  onOverlay(e: MouseEvent): void {
    if ((e.target as HTMLElement) === e.currentTarget) this.close();
  }

  submit(): void {
    this.error = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isLocked) {
      this.send(this.lockedPatientId!);
    } else {
      const fileNo = this.form.get('fileNo')!.value?.trim();
      if (!fileNo) { this.error = 'Patient File No is required.'; return; }
      this.resolvePatient(fileNo);
    }
  }

  private resolvePatient(fileNo: string): void {
    this.isSaving = true;
    this.patientService.searchPatients(fileNo).subscribe({
      next: (res: any) => {
        const patients: any[] = res.data ?? [];
        const patient = patients.find((p: any) => String(p.file_number) === fileNo);
        if (!patient) {
          this.error   = `No patient found with file number ${fileNo}.`;
          this.isSaving = false;
          return;
        }
        this.send(patient.patient_id);
      },
      error: () => {
        this.error   = 'Failed to look up patient. Please try again.';
        this.isSaving = false;
      },
    });
  }

  private send(patientId: number): void {
    const { workType, toothNumber, clinicalInstructions } = this.form.value;
    const requestNote = `${workType}\n${clinicalInstructions}`;
    const tooth = toothNumber?.trim() || null;

    this.isSaving = true;
    this.labService.createLabRequest({ patientId, requestNote, toothNumber: tooth }).subscribe({
      next: () => {
        this.isSaving = false;
        this.submitted.emit();
      },
      error: (err: any) => {
        this.error   = err?.error?.error ?? 'Failed to create lab request. Please try again.';
        this.isSaving = false;
      },
    });
  }
}
