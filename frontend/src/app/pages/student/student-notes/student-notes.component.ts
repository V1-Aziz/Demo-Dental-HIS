import { Component, OnInit } from '@angular/core';
import { AcademicService } from '../../../services/academic.service';
import { DiagnosisService } from '../../../services/diagnosis.service';
import { PatientService } from '../../../services/patient.service';

type ReviewStatus = 'Submitted' | 'Approved' | 'Rejected' | 'Revision_Requested';

interface Submission {
  submission_id:    number;
  submission_type:  'Diagnosis' | 'Treatment';
  patient_name:     string;
  patient_file_no:  number;
  procedure_label:  string;
  status:           ReviewStatus;
  submitted_at:     string;
  revision_count:   number;
  doctor_feedback:  string | null;
  // Diagnosis fields
  clinical_findings?:     string;
  radiographic_findings?: string;
  progress_note?:         string;
  // Treatment fields
  treatment_note?: string;
}

@Component({
  standalone: false,
  selector: 'app-student-notes',
  templateUrl: './student-notes.component.html',
})
export class StudentNotesComponent implements OnInit {
  submissions: Submission[] = [];
  searchTerm = '';
  loading = false;

  // Expanded row for revision flow
  expandedId: number | null = null;
  expandedType: 'Diagnosis' | 'Treatment' | null = null;

  // Edit form for resubmission
  resubmitForm: Record<string, string> = {};
  resubmitError = '';
  isResubmitting = false;

  // Withdraw
  confirmWithdrawId: number | null = null;
  confirmWithdrawType: 'Diagnosis' | 'Treatment' | null = null;
  isWithdrawing = false;

  // Add new diagnosis modal
  isAddModalOpen = false;
  patients: { id: number; name: string }[] = [];
  noteForm = { patientId: '', diagnosisType: '', clinicalFindings: '', radiographicFindings: '', progressNote: '' };
  isSavingNote = false;
  noteError = '';

  // Toast
  toastMessage = '';
  toastVisible = false;

  constructor(
    private academicService: AcademicService,
    private diagnosisService: DiagnosisService,
    private patientService: PatientService,
  ) {}

  ngOnInit(): void {
    this.loadSubmissions();
    this.patientService.getMyPatients().subscribe({
      next: (res: any) => {
        this.patients = (res.data?.rows ?? []).map((r: any) => ({ id: r.patient_id, name: r.full_name }));
      },
    });
  }

  loadSubmissions(): void {
    this.loading = true;
    this.academicService.getMySubmissions().subscribe({
      next: (res: any) => {
        this.submissions = (res.data?.items ?? []).map((r: any): Submission => ({
          submission_id:        r.submission_id,
          submission_type:      r.submission_type,
          patient_name:         r.patient_name ?? '—',
          patient_file_no:      r.patient_file_no ?? 0,
          procedure_label:      r.procedure_label ?? '—',
          status:               r.status as ReviewStatus,
          submitted_at:         r.submitted_at,
          revision_count:       r.revision_count ?? 0,
          doctor_feedback:      r.doctor_feedback ?? null,
          clinical_findings:    r.clinical_findings ?? undefined,
          radiographic_findings: r.radiographic_findings ?? undefined,
          progress_note:        r.progress_note ?? undefined,
          treatment_note:       r.treatment_note ?? undefined,
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get revisionCount(): number {
    return this.submissions.filter(s => s.status === 'Revision_Requested').length;
  }

  get filteredSubmissions(): Submission[] {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.submissions;
    return this.submissions.filter(s =>
      s.patient_name.toLowerCase().includes(term) ||
      s.procedure_label.toLowerCase().includes(term),
    );
  }

  // ─── Row expansion for revision ────────────────────────────────────────────

  toggleExpand(sub: Submission): void {
    if (this.expandedId === sub.submission_id && this.expandedType === sub.submission_type) {
      this.expandedId   = null;
      this.expandedType = null;
    } else {
      this.expandedId   = sub.submission_id;
      this.expandedType = sub.submission_type;
      this.resubmitError = '';
      // Pre-fill edit form with current values
      if (sub.submission_type === 'Diagnosis') {
        this.resubmitForm = {
          diagnosis_type:        sub.procedure_label,
          clinical_findings:     sub.clinical_findings    ?? '',
          radiographic_findings: sub.radiographic_findings ?? '',
          progress_note:         sub.progress_note        ?? '',
        };
      } else {
        this.resubmitForm = {
          treatment_type: sub.procedure_label,
          treatment_note: sub.treatment_note ?? '',
        };
      }
    }
  }

  isExpanded(sub: Submission): boolean {
    return this.expandedId === sub.submission_id && this.expandedType === sub.submission_type;
  }

  // ─── Resubmit ──────────────────────────────────────────────────────────────

  resubmit(sub: Submission): void {
    const fields = { ...this.resubmitForm };
    const hasContent = Object.values(fields).some(v => v.trim().length > 0);
    if (!hasContent) { this.resubmitError = 'At least one field must be filled.'; return; }

    this.isResubmitting = true;
    this.resubmitError = '';
    this.academicService.resubmitNote(sub.submission_type, sub.submission_id, fields).subscribe({
      next: () => {
        this.isResubmitting = false;
        this.expandedId   = null;
        this.expandedType = null;
        this.showToast('Resubmitted for review');
        this.loadSubmissions();
      },
      error: (err: any) => {
        this.resubmitError = err?.error?.error ?? 'Resubmit failed. Please try again.';
        this.isResubmitting = false;
      },
    });
  }

  // ─── Withdraw ──────────────────────────────────────────────────────────────

  requestWithdraw(sub: Submission): void {
    this.confirmWithdrawId   = sub.submission_id;
    this.confirmWithdrawType = sub.submission_type;
  }

  confirmWithdraw(): void {
    if (!this.confirmWithdrawId || !this.confirmWithdrawType) return;
    this.isWithdrawing = true;
    this.academicService.withdrawSubmission(this.confirmWithdrawType, this.confirmWithdrawId).subscribe({
      next: () => {
        this.isWithdrawing = false;
        this.confirmWithdrawId   = null;
        this.confirmWithdrawType = null;
        this.expandedId   = null;
        this.expandedType = null;
        this.showToast('Submission withdrawn');
        this.loadSubmissions();
      },
      error: (err: any) => {
        this.resubmitError = err?.error?.error ?? 'Withdraw failed.';
        this.isWithdrawing = false;
      },
    });
  }

  cancelWithdraw(): void {
    this.confirmWithdrawId   = null;
    this.confirmWithdrawType = null;
  }

  // ─── Add new diagnosis ─────────────────────────────────────────────────────

  openAddModal(): void {
    this.noteForm  = { patientId: '', diagnosisType: '', clinicalFindings: '', radiographicFindings: '', progressNote: '' };
    this.noteError = '';
    this.isAddModalOpen = true;
  }

  submitNote(): void {
    const f = this.noteForm;
    if (!f.patientId || !f.diagnosisType || !f.clinicalFindings || !f.radiographicFindings || !f.progressNote) {
      this.noteError = 'All fields are required.';
      return;
    }
    this.isSavingNote = true;
    this.noteError = '';
    this.diagnosisService.submitDiagnosis({
      patientId:            parseInt(f.patientId, 10),
      diagnosisType:        f.diagnosisType,
      clinicalFindings:     f.clinicalFindings,
      radiographicFindings: f.radiographicFindings,
      progressNote:         f.progressNote,
    }).subscribe({
      next: () => {
        this.isAddModalOpen = false;
        this.isSavingNote   = false;
        this.showToast('Note submitted for review');
        this.loadSubmissions();
      },
      error: (err: any) => {
        this.noteError    = err?.error?.error ?? 'Failed to submit note.';
        this.isSavingNote = false;
      },
    });
  }

  // ─── Display helpers ────────────────────────────────────────────────────────

  statusLabel(status: ReviewStatus): string {
    if (status === 'Submitted')          return 'Pending Review';
    if (status === 'Revision_Requested') return 'Revision Requested';
    return status;
  }

  statusRowClass(status: ReviewStatus): string {
    if (status === 'Revision_Requested') return 'bg-orange-50 border-l-4 border-orange-400';
    return '';
  }

  timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  typeLabel(type: 'Diagnosis' | 'Treatment'): string {
    return type;
  }

  typeClass(type: 'Diagnosis' | 'Treatment'): string {
    return type === 'Diagnosis'
      ? 'bg-blue-50 text-blue-700 border border-blue-200'
      : 'bg-purple-50 text-purple-700 border border-purple-200';
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastVisible = true;
    setTimeout(() => { this.toastVisible = false; }, 3000);
  }
}
