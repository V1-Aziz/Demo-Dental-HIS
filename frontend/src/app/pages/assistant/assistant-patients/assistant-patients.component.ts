import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { PatientService } from '../../../services/patient.service';
import { RecordService }  from '../../../services/record.service';
import { LabService }     from '../../../services/lab.service';

type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
type LabStatus      = 'Pending' | 'Accepted' | 'Rejected';

interface LabRequest {
  id:           string;
  workType:     string;
  dateSent:     string;
  studentName:  string;
  doctorStatus: ApprovalStatus;
  labStatus:    LabStatus;
}

interface Patient {
  id:     number;
  name:   string;
  fileNo: string;
  phone:  string;
  gender: 'M' | 'F';
  civil:  string;
  dob:    string;
}

interface Diagnosis {
  diagnosis_id:          number;
  diagnosis_type:        string;
  clinical_findings:     string;
  radiographic_findings: string;
  progress_note:         string;
  authored_by_name:      string;
  doctor_feedback?:      string | null;
  status?:               string;
}

interface Treatment {
  treatment_id:     number;
  treatment_type:   string;
  treatment_note:   string;
  doctor_feedback:  string | null;
  authored_by_name: string;
  medicine_name:    string;
  dosage:           string;
  duration:         string;
  cost:             number;
}

interface PatientRecord {
  record_id:        number;
  chief_complaint:  string | null;
  chronic_diseases: string | null;
  diagnoses:        Diagnosis[];
  treatments:       Treatment[];
}

@Component({
  standalone: false,
  selector: 'app-assistant-patients',
  templateUrl: './assistant-patients.component.html',
  styles: [`
    :host {
      --vdc-navy: #1e3a5f;
      --vdc-border: #e2e8f0;
      --vdc-muted: #64748b;
      --vdc-hint: #94a3b8;
      --vdc-bg: #f8fafc;
      --vdc-text: #1e293b;
      --c-caries-bg: #fee2e2;      --c-caries-bd: #ef4444;      --c-caries-tx: #991b1b;
      --c-restoration-bg: #dbeafe; --c-restoration-bd: #3b82f6; --c-restoration-tx: #1e40af;
      --c-missing-bg: #f1f5f9;     --c-missing-bd: #94a3b8;     --c-missing-tx: #4b5563;
      --c-implant-bg: #fef9c3;     --c-implant-bd: #eab308;     --c-implant-tx: #854d0e;
    }
    .vdc-section { background:#fff; border:1px solid var(--vdc-border); border-radius:12px; padding:28px 24px; }
    .vdc-legend { display:flex; align-items:center; flex-wrap:wrap; gap:20px; margin-bottom:28px; justify-content:center; }
    .vdc-leg { display:flex; align-items:center; gap:7px; font-size:13px; color:var(--vdc-muted); user-select:none; border:1.5px solid transparent; border-radius:20px; padding:4px 12px 4px 8px; cursor:default; pointer-events:none; }
    .vdc-leg-selected { background:#fff; border-color:var(--vdc-navy); }
    .vdc-leg-dot { width:14px; height:14px; border-radius:3px; border:1.5px solid; flex-shrink:0; }
    .vdc-dot-healthy     { background:#fff;                     border-color:#cbd5e1; }
    .vdc-dot-caries      { background:var(--c-caries-bg);      border-color:var(--c-caries-bd); }
    .vdc-dot-restoration { background:var(--c-restoration-bg); border-color:var(--c-restoration-bd); }
    .vdc-dot-missing     { background:var(--c-missing-bg);     border-color:var(--c-missing-bd); }
    .vdc-dot-implant     { background:var(--c-implant-bg);     border-color:var(--c-implant-bd); }
    .vdc-grid { display:flex; flex-direction:column; gap:8px; align-items:center; }
    .vdc-jaw-row { display:flex; align-items:center; gap:8px; }
    .vdc-quadrant { display:flex; gap:6px; flex-wrap:nowrap; }
    .vdc-div-v { width:18px; display:flex; align-items:center; justify-content:center; color:var(--vdc-border); font-size:18px; user-select:none; }
    .vdc-div-h { width:100%; max-width:680px; height:1px; background:var(--vdc-border); margin:4px 0; }
    .vdc-tooth { width:42px; height:42px; border-radius:8px; border:1.5px solid #d1d5db; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:default; position:relative; font-size:12px; font-weight:500; color:#374151; user-select:none; flex-shrink:0; transition:transform 0.12s, box-shadow 0.12s; }
    .vdc-tooth-clickable { cursor:pointer; }
    .vdc-tooth-clickable:hover { transform:scale(1.12); box-shadow:0 0 0 3px #93c5fd55; z-index:2; }
    .vdc-pip { width:6px; height:6px; border-radius:50%; position:absolute; bottom:4px; display:none; }
    .vdc-tooth.vt-caries      { background:var(--c-caries-bg);      border-color:var(--c-caries-bd);      color:var(--c-caries-tx); }
    .vdc-tooth.vt-restoration { background:var(--c-restoration-bg); border-color:var(--c-restoration-bd); color:var(--c-restoration-tx); }
    .vdc-tooth.vt-missing     { background:var(--c-missing-bg);     border-color:var(--c-missing-bd);     color:var(--c-missing-tx); }
    .vdc-tooth.vt-implant     { background:var(--c-implant-bg);     border-color:var(--c-implant-bd);     color:var(--c-implant-tx); }
    .vdc-tooth.vt-caries .vdc-pip      { background:var(--c-caries-bd);      display:block; }
    .vdc-tooth.vt-restoration .vdc-pip { background:var(--c-restoration-bd); display:block; }
    .vdc-tooth.vt-missing .vdc-pip     { background:var(--c-missing-bd);     display:block; }
    .vdc-tooth.vt-implant .vdc-pip     { background:var(--c-implant-bd);     display:block; }
    .vdc-summary { display:none; margin-top:24px; border-top:1px solid var(--vdc-border); padding-top:20px; }
    .vdc-summary-visible { display:block; }
    .vdc-sum-title { font-size:13px; font-weight:500; color:var(--vdc-muted); margin-bottom:10px; }
    .vdc-sum-list { display:flex; flex-direction:column; gap:7px; }
    .vdc-sum-item { padding:10px 14px; border-radius:8px; border:1px solid var(--vdc-border); border-left-width:3px; cursor:pointer; background:#fff; transition:opacity 0.12s; }
    .vdc-sum-item:hover { opacity:0.75; }
    .vdc-sum-item.caries      { border-left-color:var(--c-caries-bd); }
    .vdc-sum-item.restoration { border-left-color:var(--c-restoration-bd); }
    .vdc-sum-item.missing     { border-left-color:var(--c-missing-bd); }
    .vdc-sum-item.implant     { border-left-color:var(--c-implant-bd); }
    .vdc-si-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
    .vdc-si-num { font-size:13px; font-weight:500; }
    .vdc-si-badge { font-size:11px; padding:2px 9px; border-radius:20px; border:1px solid; }
    .vdc-si-badge.caries      { background:var(--c-caries-bg);      border-color:var(--c-caries-bd);      color:var(--c-caries-tx); }
    .vdc-si-badge.restoration { background:var(--c-restoration-bg); border-color:var(--c-restoration-bd); color:var(--c-restoration-tx); }
    .vdc-si-badge.missing     { background:var(--c-missing-bg);     border-color:var(--c-missing-bd);     color:var(--c-missing-tx); }
    .vdc-si-badge.implant     { background:var(--c-implant-bg);     border-color:var(--c-implant-bd);     color:var(--c-implant-tx); }
    .vdc-si-badge.healthy     { background:#f8fafc; border-color:#cbd5e1; color:#475569; }
    .vdc-si-note { font-size:13px; color:var(--vdc-muted); line-height:1.5; }
    .vdc-si-time { font-size:11px; color:var(--vdc-hint); margin-top:2px; }
    .view-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.38); display:flex; align-items:center; justify-content:center; z-index:9999; opacity:0; pointer-events:none; transition:opacity 0.18s; }
    .view-overlay-open { opacity:1; pointer-events:all; }
    .vdc-modal { background:#fff; border-radius:14px; padding:26px 28px; width:400px; max-width:94vw; border:1px solid var(--vdc-border); transform:translateY(14px) scale(0.98); transition:transform 0.2s; }
    .view-overlay-open .vdc-modal { transform:translateY(0) scale(1); }
    .vdc-mhd { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
    .vdc-m-lbl { font-size:10px; font-weight:700; letter-spacing:0.7px; text-transform:uppercase; color:var(--vdc-hint); }
    .vdc-m-num { font-size:26px; font-weight:600; line-height:1.1; }
    .vdc-m-x { background:none; border:none; cursor:pointer; font-size:22px; color:var(--vdc-hint); padding:2px 6px; border-radius:4px; line-height:1; }
    .vdc-m-x:hover { background:var(--vdc-bg); }
    .vdc-m-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
    .vdc-m-field-lbl { font-size:12px; color:var(--vdc-muted); font-weight:500; display:block; }
    .vdc-m-note { font-size:13px; color:var(--vdc-text); line-height:1.6; background:var(--vdc-bg); border:1px solid var(--vdc-border); border-radius:8px; padding:10px 12px; margin-top:8px; }
    .vdc-m-time { font-size:11px; color:var(--vdc-hint); margin-top:6px; }
    .vdc-mactions { display:flex; justify-content:flex-end; margin-top:18px; }
    .vdc-btn { padding:8px 20px; border-radius:8px; font-size:13px; cursor:pointer; font-family:inherit; transition:all 0.12s; }
    .vdc-btn-close { background:none; border:1px solid var(--vdc-border); color:var(--vdc-muted); }
    .vdc-btn-close:hover { background:var(--vdc-bg); }
  `],
})
export class AssistantPatientsComponent implements OnInit, OnDestroy {
  selectedPatient: Patient | null  = null;
  record:          PatientRecord | null = null;
  recordLoading    = false;

  activeSection: 'patient-file' | 'lab-request' | 'procedure-note' = 'patient-file';
  activeTab    = 'chief';
  searchTerm   = '';

  patients:        Patient[] = [];
  currentPage      = 1;
  pageSize         = 10;
  totalPatients    = 0;
  pageSizeOptions  = [10, 25, 50];

  labRequests:       LabRequest[] = [];
  labRequestsLoading = false;

  selectedDiagnosis: Diagnosis | null = null;

  private searchDebounce?: ReturnType<typeof setTimeout>;

  constructor(
    private patientService: PatientService,
    private recordService:  RecordService,
    private labService:     LabService,
  ) {}

  ngOnInit(): void  { this.loadPatients(); }
  ngOnDestroy(): void { clearTimeout(this.searchDebounce); }

  loadPatients(): void {
    this.patientService.getPatients({
      page: this.currentPage, limit: this.pageSize, search: this.searchTerm || undefined,
    }).subscribe({
      next: (res: any) => {
        this.totalPatients = res.data?.total ?? 0;
        this.patients = (res.data?.rows ?? []).map((r: any) => ({
          id:     r.patient_id,
          name:   r.full_name,
          fileNo: String(r.file_number),
          phone:  r.phone_number ?? '—',
          gender: r.gender === 'Male' ? 'M' : 'F',
          civil:  String(r.national_id ?? ''),
          dob:    r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString() : '—',
        }));
      },
      error: () => { this.patients = []; this.totalPatients = 0; },
    });
  }

  get totalPages():    number { return Math.max(1, Math.ceil(this.totalPatients / this.pageSize)); }
  get pageRangeStart(): number { return this.totalPatients === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():   number { return Math.min(this.currentPage * this.pageSize, this.totalPatients); }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => { this.currentPage = 1; this.loadPatients(); }, 400);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page; this.loadPatients();
  }

  onPageSizeChange(size: number | string): void {
    this.pageSize = +size; this.currentPage = 1; this.loadPatients();
  }

  selectPatient(p: Patient): void {
    this.selectedPatient   = p;
    this.activeSection     = 'patient-file';
    this.activeTab         = 'chief';
    this.record            = null;
    this.labRequests       = [];
    this.selectedDiagnosis = null;
    this.loadRecord(p.id);
  }

  setSection(sectionId: 'patient-file' | 'lab-request' | 'procedure-note'): void {
    this.activeSection     = sectionId;
    this.selectedDiagnosis = null;
    if (sectionId === 'lab-request' && this.labRequests.length === 0 && !this.labRequestsLoading) {
      this.loadLabRequests();
    }
  }

  loadRecord(patientId: number): void {
    this.recordLoading = true;
    this.recordService.getPatientRecord(patientId).subscribe({
      next: (res: any) => {
        this.record        = res.data;
        this.recordLoading = false;
      },
      error: () => { this.recordLoading = false; },
    });
  }

  loadLabRequests(): void {
    if (!this.selectedPatient?.id) return;
    this.labRequestsLoading = true;
    this.labService.getLabRequests({ patientId: this.selectedPatient.id, limit: 50 }).subscribe({
      next: (res: any) => {
        this.labRequests = (res.data?.rows ?? []).map((r: any) => ({
          id:           String(r.lab_request_id),
          workType:     r.request_note    ?? '—',
          dateSent:     r.request_timestamp
            ? new Date(r.request_timestamp).toLocaleDateString()
            : '—',
          studentName:  r.student_name    ?? '—',
          doctorStatus: (r.approved_by_name ? 'Approved' : 'Pending') as ApprovalStatus,
          labStatus:    (r.request_status  ?? 'Pending') as LabStatus,
        }));
        this.labRequestsLoading = false;
      },
      error: () => { this.labRequests = []; this.labRequestsLoading = false; },
    });
  }

  labStatusClass(status: string): string {
    switch (status) {
      case 'Approved':
      case 'Accepted':  return 'bg-green-100 text-green-700 border-green-200';
      case 'Rejected':  return 'bg-red-100 text-red-700 border-red-200';
      case 'Canceled':  return 'bg-slate-100 text-slate-500 border-slate-200';
      default:          return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
  }

  labStatusIcon(status: string): string {
    switch (status) {
      case 'Approved':
      case 'Accepted': return 'check_circle';
      case 'Rejected':
      case 'Canceled': return 'cancel';
      default:         return 'schedule';
    }
  }

  effectiveLabStatus(req: LabRequest): string {
    return req.doctorStatus === 'Rejected' ? 'Canceled' : req.labStatus;
  }

  readonly patientFileTabs = [
    { id: 'chief',     label: 'Chief Complaint' },
    { id: 'medical',   label: 'Medical History' },
    { id: 'dental',    label: 'Dental Chart'    },
    { id: 'treatment', label: 'Treatment Plan'  },
    { id: 'screening', label: 'Screening'       },
  ];

  readonly sections: { id: 'patient-file' | 'lab-request' | 'procedure-note'; label: string; icon: string }[] = [
    { id: 'patient-file',   label: 'Patient File',   icon: 'folder_shared' },
    { id: 'lab-request',    label: 'Lab Request',    icon: 'science'       },
    { id: 'procedure-note', label: 'Procedure Note', icon: 'edit_note'     },
  ];

  // ── View-only dental chart ────────────────────────────────────────────────

  readonly viewConditions = [
    { id: 'healthy',     label: 'Healthy'     },
    { id: 'caries',      label: 'Caries'      },
    { id: 'restoration', label: 'Restoration' },
    { id: 'missing',     label: 'Missing'     },
    { id: 'implant',     label: 'Implant'     },
  ];

  readonly upperLeft  = [18, 17, 16, 15, 14, 13, 12, 11];
  readonly upperRight = [21, 22, 23, 24, 25, 26, 27, 28];
  readonly lowerLeft  = [48, 47, 46, 45, 44, 43, 42, 41];
  readonly lowerRight = [31, 32, 33, 34, 35, 36, 37, 38];

  viewDb: Record<number, { condition: string; note: string; savedAt: string }> = {};
  viewModalOpen    = false;
  viewActiveTooth: number | null = null;

  get viewAnnotatedTeeth(): Array<{ tooth: number; record: { condition: string; note: string; savedAt: string } }> {
    return Object.entries(this.viewDb)
      .map(([k, r]) => ({ tooth: +k, record: r }))
      .sort((a, b) => a.tooth - b.tooth);
  }

  get viewAnnotatedCount(): number { return this.viewAnnotatedTeeth.length; }

  toothHasDiagnosis(id: number): boolean { return !!this.viewDb[id]; }

  viewOpenModal(id: number): void {
    if (!this.viewDb[id]) return;
    this.viewActiveTooth = id;
    this.viewModalOpen   = true;
  }

  viewCloseModal(): void {
    this.viewActiveTooth = null;
    this.viewModalOpen   = false;
  }

  viewOnOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('view-overlay')) {
      this.viewCloseModal();
    }
  }

  @HostListener('document:keydown.escape')
  onViewEscape(): void { if (this.viewModalOpen) this.viewCloseModal(); }

  viewGetConditionClasses(id: number): Record<string, boolean> {
    const cond = this.viewDb[id]?.condition;
    return {
      'vt-caries':      cond === 'caries',
      'vt-restoration': cond === 'restoration',
      'vt-missing':     cond === 'missing',
      'vt-implant':     cond === 'implant',
    };
  }

  capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
}
