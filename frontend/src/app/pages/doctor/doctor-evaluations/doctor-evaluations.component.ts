import { Component, OnInit } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AcademicService } from '../../../services/academic.service';

type ReviewStatus = 'Submitted' | 'Approved' | 'Rejected' | 'Revision_Requested';
type FilterTab    = 'pending' | 'revision' | 'decided' | 'all';
type MainTab      = 'reviews' | 'gradebook';

interface QueueItem {
  submission_id:     number;
  submission_type:   'Diagnosis' | 'Treatment';
  student_id:        number;
  student_name:      string;
  student_level:     number;
  patient_name:      string;
  patient_file_no:   number;
  has_medical_alert: boolean;
  procedure_label:   string;
  status:            ReviewStatus;
  submitted_at:      string;
  reviewed_at:       string | null;
  revision_count:    number;
  is_stale:          boolean;
}

interface QueueStats {
  pending_count:             number;
  revision_requested_count:  number;
  approved_today_count:      number;
  rejected_today_count:      number;
}

interface ReviewDetail extends QueueItem {
  clinical_findings?:     string;
  radiographic_findings?: string;
  progress_note?:         string;
  treatment_note?:        string;
  chronic_conditions?:    string;
  history: {
    round_number:  number;
    action:        string;
    feedback:      string | null;
    reviewer_name: string;
    created_at:    string;
  }[];
}

interface GradeSummaryRow {
  student_id:     number;
  student_name:   string;
  student_level:  number;
  total_count:    number;
  graded_count:   number;
  avg_grade:      number | null;
  last_graded_at: string | null;
}

interface StudentGradeRecord {
  submission_id:   number;
  submission_type: 'Diagnosis' | 'Treatment';
  student_id:      number;
  student_name:    string;
  procedure_label: string;
  patient_name:    string;
  patient_file_no: number;
  submitted_at:    string;
  status:          string;
  grade:           number | null;
  feedback_note:   string | null;
  graded_at:       string | null;
}

interface GradeOnlyInfo {
  submissionType:  'Diagnosis' | 'Treatment';
  submissionId:    number;
  studentId:       number;
  studentName:     string;
  studentLevel:    number;
  procedureLabel:  string;
  patientName:     string;
  patientFileNo:   number;
}

@Component({
  standalone: false,
  selector: 'app-doctor-evaluations',
  templateUrl: './doctor-evaluations.component.html',
  styles: [`
    .eval-tab-bar {
      display: flex;
      border-bottom: 0.5px solid #e5e7eb;
      margin-bottom: 16px;
    }
    .eval-tab-item {
      padding: 10px 20px;
      cursor: pointer;
      font-size: 13px;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      color: #6b7280;
    }
    .eval-tab-item.active {
      border-bottom-color: #f59e0b;
      font-weight: 500;
      color: #111827;
    }
    .eval-grade-badge {
      text-align: center;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid;
      min-width: 64px;
    }
    .eval-badge-value {
      font-size: 18px;
      font-weight: 500;
      line-height: 1.2;
    }
    .eval-badge-label {
      font-size: 10px;
      opacity: 0.8;
    }
    .eval-grade-tile {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.12s;
      border: 0.5px solid #e5e7eb;
      background: #f9fafb;
      user-select: none;
    }
    .eval-student-card {
      background: #ffffff;
      border: 0.5px solid #e5e7eb;
      border-radius: 12px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: opacity 0.12s;
    }
    .eval-student-card:hover {
      opacity: 0.8;
    }
  `],
})
export class DoctorEvaluationsComponent implements OnInit {

  // ─── Reviews tab state ──────────────────────────────────────────────────────
  items:     QueueItem[] = [];
  stats:     QueueStats  = { pending_count: 0, revision_requested_count: 0, approved_today_count: 0, rejected_today_count: 0 };
  filter:    FilterTab   = 'pending';
  loading    = false;
  searchTerm = '';

  readonly filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'pending',  label: 'Pending' },
    { key: 'revision', label: 'In Revision' },
    { key: 'decided',  label: 'Decided Today' },
    { key: 'all',      label: 'All' },
  ];

  // ─── Review modal state ─────────────────────────────────────────────────────
  selectedDetail: ReviewDetail | null = null;
  detailLoading   = false;
  feedback        = '';
  reviewError     = '';
  isReviewing     = false;
  showHistory     = false;
  confirmReject   = false;

  // ─── Grading step state (within modal) ─────────────────────────────────────
  gradingStep       = false;
  selectedGrade:    number | null = null;
  gradeFeedback     = '';
  isSubmittingGrade = false;
  gradeError        = '';
  gradeOnlyMode     = false;
  gradeOnlyInfo:    GradeOnlyInfo | null = null;

  readonly gradeNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  // ─── Gradebook tab state ────────────────────────────────────────────────────
  activeTab:              MainTab          = 'reviews';
  gradeSummary:           GradeSummaryRow[]     = [];
  gradeSummaryLoading     = false;
  selectedGradeStudent:   GradeSummaryRow | null = null;
  studentGrades:          StudentGradeRecord[]   = [];
  studentGradesLoading    = false;
  gbPage                  = 1;
  readonly gbPageSize     = 10;

  get gbTotalPages(): number {
    return Math.max(1, Math.ceil(this.studentGrades.length / this.gbPageSize));
  }

  get gbPagedItems(): StudentGradeRecord[] {
    const start = (this.gbPage - 1) * this.gbPageSize;
    return this.studentGrades.slice(start, start + this.gbPageSize);
  }

  gbPrev(): void { if (this.gbPage > 1) this.gbPage--; }
  gbNext(): void { if (this.gbPage < this.gbTotalPages) this.gbPage++; }

  constructor(private academicService: AcademicService) {}

  ngOnInit(): void {
    this.loadQueue();
    this.loadStats();
  }

  // ─── Reviews tab ────────────────────────────────────────────────────────────

  loadQueue(): void {
    this.loading = true;
    this.academicService.getPendingReviews(this.filter).subscribe({
      next: (res: any) => {
        this.items = (res.data?.items ?? []).map((r: any) => ({
          submission_id:     r.submission_id,
          submission_type:   r.submission_type,
          student_id:        r.student_id,
          student_name:      r.student_name ?? '—',
          student_level:     r.student_level ?? 0,
          patient_name:      r.patient_name ?? '—',
          patient_file_no:   r.patient_file_no ?? 0,
          has_medical_alert: !!r.has_medical_alert,
          procedure_label:   r.procedure_label ?? '—',
          status:            r.status as ReviewStatus,
          submitted_at:      r.submitted_at,
          reviewed_at:       r.reviewed_at ?? null,
          revision_count:    r.revision_count ?? 0,
          is_stale:          !!r.is_stale,
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  loadStats(): void {
    this.academicService.getReviewQueueStats().subscribe({
      next: (res: any) => { this.stats = res.data ?? this.stats; },
    });
  }

  setFilter(f: FilterTab): void {
    this.filter = f;
    this.loadQueue();
  }

  openReview(item: QueueItem): void {
    this.detailLoading  = true;
    this.selectedDetail = null;
    this.feedback       = '';
    this.reviewError    = '';
    this.showHistory    = false;
    this.confirmReject  = false;
    this.gradingStep    = false;
    this.gradeOnlyMode  = false;
    this.gradeOnlyInfo  = null;
    this.academicService.getReviewDetail(item.submission_type, item.submission_id).subscribe({
      next: (res: any) => {
        this.selectedDetail = res.data;
        this.detailLoading  = false;
      },
      error: () => { this.detailLoading = false; },
    });
  }

  closeModal(): void {
    this.selectedDetail = null;
    this.detailLoading  = false;
    this.reviewError    = '';
    this.confirmReject  = false;
    this.gradingStep    = false;
    this.selectedGrade  = null;
    this.gradeFeedback  = '';
    this.gradeError     = '';
    this.gradeOnlyMode  = false;
    this.gradeOnlyInfo  = null;
  }

  canRequestRevision(item: QueueItem | ReviewDetail): boolean {
    return item.revision_count < 3;
  }

  submitReview(action: 'approve' | 'request_revision' | 'reject'): void {
    if (!this.selectedDetail) return;
    if (action === 'request_revision' && !this.feedback.trim()) {
      this.reviewError = 'Feedback is required when requesting revision.';
      return;
    }
    if (action === 'reject') {
      if (!this.confirmReject) { this.confirmReject = true; return; }
      if (!this.feedback.trim()) { this.reviewError = 'Feedback is required when rejecting.'; return; }
    }
    this.isReviewing = true;
    this.reviewError = '';
    const { submission_type, submission_id } = this.selectedDetail;
    this.academicService.submitReview(submission_type, submission_id, action, this.feedback.trim() || undefined).subscribe({
      next: () => {
        this.isReviewing = false;
        if (action === 'approve') {
          this.gradingStep   = true;
          this.selectedGrade = null;
          this.gradeFeedback = '';
          this.gradeError    = '';
        } else {
          this.closeModal();
          this.loadQueue();
          this.loadStats();
        }
      },
      error: (err: any) => {
        this.reviewError = err?.error?.error ?? 'Review failed. Please try again.';
        this.isReviewing = false;
      },
    });
  }

  // ─── Grading ────────────────────────────────────────────────────────────────

  openGradeOnlyModal(record: StudentGradeRecord): void {
    this.gradeOnlyMode  = true;
    this.gradingStep    = true;
    this.selectedDetail = null;
    this.detailLoading  = false;
    this.gradeOnlyInfo  = {
      submissionType: record.submission_type,
      submissionId:   record.submission_id,
      studentId:      record.student_id,
      studentName:    record.student_name,
      studentLevel:   this.selectedGradeStudent?.student_level ?? 0,
      procedureLabel: record.procedure_label,
      patientName:    record.patient_name,
      patientFileNo:  record.patient_file_no,
    };
    this.selectedGrade = null;
    this.gradeFeedback = '';
    this.gradeError    = '';
  }

  submitGrade(): void {
    if (this.selectedGrade === null) return;

    let submissionType: 'Diagnosis' | 'Treatment';
    let submissionId:   number;
    let studentId:      number;

    if (this.gradeOnlyMode && this.gradeOnlyInfo) {
      submissionType = this.gradeOnlyInfo.submissionType;
      submissionId   = this.gradeOnlyInfo.submissionId;
      studentId      = this.gradeOnlyInfo.studentId;
    } else if (this.selectedDetail) {
      submissionType = this.selectedDetail.submission_type;
      submissionId   = this.selectedDetail.submission_id;
      studentId      = this.selectedDetail.student_id;
    } else {
      return;
    }

    this.isSubmittingGrade = true;
    this.gradeError        = '';
    const cachedStudent    = this.selectedGradeStudent;

    this.academicService
      .submitGrade(submissionType, submissionId, studentId, this.selectedGrade, this.gradeFeedback.trim() || undefined)
      .pipe(
        catchError((err: any) => {
          this.gradeError        = err?.error?.error ?? 'Failed to submit grade. Please try again.';
          this.isSubmittingGrade = false;
          return EMPTY;
        }),
      )
      .subscribe({
        next: () => {
          this.isSubmittingGrade = false;
          this.closeModal();
          this.loadQueue();
          this.loadStats();
          if (cachedStudent) {
            this.loadStudentGrades(cachedStudent);
          } else if (this.activeTab === 'gradebook') {
            this.loadGradeSummary();
          }
        },
      });
  }

  // ─── Gradebook tab ──────────────────────────────────────────────────────────

  setMainTab(tab: MainTab): void {
    this.activeTab = tab;
    if (tab === 'gradebook') {
      this.loadGradeSummary();
    }
  }

  loadGradeSummary(): void {
    this.gradeSummaryLoading = true;
    this.academicService
      .getGradeSummary()
      .pipe(catchError(() => { this.gradeSummaryLoading = false; return EMPTY; }))
      .subscribe({
        next: (res: any) => {
          this.gradeSummary        = res.data?.students ?? [];
          this.gradeSummaryLoading = false;
        },
      });
  }

  selectGradeStudent(row: GradeSummaryRow): void {
    this.selectedGradeStudent = row;
    this.loadStudentGrades(row);
  }

  loadStudentGrades(row: GradeSummaryRow): void {
    this.studentGradesLoading = true;
    this.academicService
      .getStudentGrades(row.student_id)
      .pipe(catchError(() => { this.studentGradesLoading = false; return EMPTY; }))
      .subscribe({
        next: (res: any) => {
          const records: StudentGradeRecord[] = res.data?.records ?? [];
          this.studentGrades = records.sort((a, b) =>
            new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
          );
          this.studentGradesLoading = false;
          this.gbPage               = 1;
        },
      });
  }

  backToSummary(): void {
    this.selectedGradeStudent = null;
    this.studentGrades        = [];
    this.gbPage               = 1;
  }

  // ─── Display helpers ────────────────────────────────────────────────────────

  initials(name: string): string {
    return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  }

  avatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#10b981'];
    let hash = 0;
    for (const c of name) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  gradeColors(grade: number | null): { bg: string; text: string; border: string } {
    if (grade === null) return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' };
    if (grade >= 8)     return { bg: '#eaf3de', text: '#3b6d11', border: '#c0dd97' };
    if (grade >= 6)     return { bg: '#faeeda', text: '#854f0b', border: '#fac775' };
    return                     { bg: '#fcebeb', text: '#a32d2d', border: '#f7c1c1' };
  }

  tileStyle(n: number): { [k: string]: string } {
    if (this.selectedGrade !== n) return {};
    const c = this.gradeColors(n);
    return { background: c.bg, color: c.text, 'border-color': c.border };
  }

  statusLabel(status: ReviewStatus): string {
    if (status === 'Submitted')          return 'Pending Review';
    if (status === 'Revision_Requested') return 'Revision Requested';
    return status;
  }

  statusClass(status: ReviewStatus): string {
    if (status === 'Approved')           return 'bg-green-100 text-green-700 border-green-200';
    if (status === 'Rejected')           return 'bg-red-100 text-red-700 border-red-200';
    if (status === 'Revision_Requested') return 'bg-orange-100 text-orange-700 border-orange-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  }

  typeClass(type: 'Diagnosis' | 'Treatment'): string {
    return type === 'Diagnosis'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-purple-50 text-purple-700 border-purple-200';
  }

  timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m    = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  formatDate(iso: string): string {
    const d        = new Date(iso);
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${datePart}, ${timePart}`;
  }

  revisionRequestedLine(item: QueueItem): string {
    if (!item.reviewed_at) return '';
    const d = new Date(item.reviewed_at);
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `Revision requested ${dateStr} at ${timeStr}`;
  }

  reviewDecisionLine(item: QueueItem): string {
    if (!item.reviewed_at) return '';
    const d = new Date(item.reviewed_at);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const when = isToday ? `today at ${timeStr}` : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at ${timeStr}`;
    return `${item.status === 'Approved' ? 'Approved' : 'Rejected'} ${when}`;
  }

  historyActionLabel(action: string): string {
    if (action === 'Approved')           return 'Approved';
    if (action === 'Rejected')           return 'Rejected';
    if (action === 'Revision_Requested') return 'Requested revision';
    if (action === 'Resubmitted')        return 'Resubmitted';
    return action;
  }

  historyActionClass(action: string): string {
    if (action === 'Approved')           return 'text-green-700';
    if (action === 'Rejected')           return 'text-red-700';
    if (action === 'Revision_Requested') return 'text-orange-700';
    return 'text-gray-500';
  }

  get filteredItems(): QueueItem[] {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.items;
    return this.items.filter(i =>
      i.student_name.toLowerCase().includes(term) ||
      i.patient_name.toLowerCase().includes(term) ||
      i.procedure_label.toLowerCase().includes(term),
    );
  }
}
