import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute }          from '@angular/router';
import { PatientService }          from '../../../services/patient.service';
import { DiagnosisService }        from '../../../services/diagnosis.service';
import { LabService }              from '../../../services/lab.service';
import { RecordService }           from '../../../services/record.service';
import { DentalChartService }      from '../../../services/dental-chart.service';

type NoteStatus    = 'Approved' | 'Waiting Supervisor Approval' | 'Denied';
type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';
type LabStatus      = 'Pending' | 'Accepted' | 'Rejected';

interface Treatment {
  treatment_id:     number;
  treatment_type:   string;
  treatment_note:   string;
  medicine_name:    string;
  dosage:           string;
  duration:         string;
  cost:             number;
  authored_by_name: string;
}

interface ProcedureNote {
  id:                  number;
  procedure:           string;
  supervisor:          string;
  status:              NoteStatus;
  clinicalFindings:    string;
  radiographicFindings: string;
  progressNote:        string;
  supervisorNotes:     string;
}

interface LabRequest {
  id:                 string;
  workType:           string;
  dateSent:           string;
  doctorStatus:       ApprovalStatus;
  labStatus:          LabStatus;
  supervisorName:     string;
  labFeedback:        string;
  parsedWorkType:     string;
  parsedTooth:        string;
  parsedShade:        string;
  parsedInstructions: string;
}

interface Patient {
  patientId:       number;
  recordId:        number | null;
  name:            string;
  fileNo:          string;
  phone:           string;
  gender:          'Male' | 'Female';
  dob:             string;
  age:             number;
  nextAppointment: string;
  allergies:       string[];
  chronic:         string[];
  chiefComplaint:  string;
  medicalHistory:  string;
  odontogram:      Record<number, string>;
}

@Component({
  standalone: false,
  selector: 'app-student-patients',
  templateUrl: './student-patients.component.html',
  styles: [`
    :host {
      --sdc-navy: #1e3a5f;
      --sdc-border: #e2e8f0;
      --sdc-muted: #64748b;
      --sdc-hint: #94a3b8;
      --sdc-bg: #f8fafc;
      --sdc-text: #1e293b;
      --c-caries-bg: #fee2e2;      --c-caries-bd: #ef4444;      --c-caries-tx: #991b1b;
      --c-restoration-bg: #dbeafe; --c-restoration-bd: #3b82f6; --c-restoration-tx: #1e40af;
      --c-missing-bg: #f1f5f9;     --c-missing-bd: #94a3b8;     --c-missing-tx: #4b5563;
      --c-implant-bg: #fef9c3;     --c-implant-bd: #eab308;     --c-implant-tx: #854d0e;
      --c-draft-bg: #fff7ed;       --c-draft-bd: #f97316;       --c-draft-tx: #9a3412;
    }
    .sdc-section { background:#fff; border:1px solid var(--sdc-border); border-radius:12px; padding:28px 24px; }
    .sdc-legend { display:flex; align-items:center; flex-wrap:wrap; gap:20px; margin-bottom:28px; justify-content:center; }
    .sdc-leg { display:flex; align-items:center; gap:7px; font-size:13px; color:var(--sdc-muted); user-select:none; border:1.5px solid transparent; border-radius:20px; padding:4px 12px 4px 8px; cursor:default; pointer-events:none; }
    .sdc-leg-selected { background:#fff; border-color:var(--sdc-navy); }
    .sdc-leg-dot { width:14px; height:14px; border-radius:3px; border:1.5px solid; flex-shrink:0; }
    .sdc-dot-healthy     { background:#fff;                     border-color:#cbd5e1; }
    .sdc-dot-caries      { background:var(--c-caries-bg);      border-color:var(--c-caries-bd); }
    .sdc-dot-restoration { background:var(--c-restoration-bg); border-color:var(--c-restoration-bd); }
    .sdc-dot-missing     { background:var(--c-missing-bg);     border-color:var(--c-missing-bd); }
    .sdc-dot-implant     { background:var(--c-implant-bg);     border-color:var(--c-implant-bd); }
    .sdc-dot-draft       { background:var(--c-draft-bg);       border-color:var(--c-draft-bd); }
    .sdc-grid { display:flex; flex-direction:column; gap:8px; align-items:center; }
    .sdc-jaw-row { display:flex; align-items:center; gap:8px; }
    .sdc-quadrant { display:flex; gap:6px; flex-wrap:nowrap; }
    .sdc-div-v { width:18px; display:flex; align-items:center; justify-content:center; color:var(--sdc-border); font-size:18px; user-select:none; }
    .sdc-div-h { width:100%; max-width:680px; height:1px; background:var(--sdc-border); margin:4px 0; }
    .sdc-tooth { width:42px; height:42px; border-radius:8px; border:1.5px solid #d1d5db; background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative; font-size:12px; font-weight:500; color:#374151; user-select:none; flex-shrink:0; transition:transform 0.12s, box-shadow 0.12s; }
    .sdc-tooth:hover { transform:scale(1.12); box-shadow:0 0 0 3px #93c5fd55; z-index:2; }
    .sdc-pip { width:6px; height:6px; border-radius:50%; position:absolute; bottom:4px; display:none; }
    .sdc-tooth.st-caries      { background:var(--c-caries-bg);      border-color:var(--c-caries-bd);      color:var(--c-caries-tx); }
    .sdc-tooth.st-restoration { background:var(--c-restoration-bg); border-color:var(--c-restoration-bd); color:var(--c-restoration-tx); }
    .sdc-tooth.st-missing     { background:var(--c-missing-bg);     border-color:var(--c-missing-bd);     color:var(--c-missing-tx); }
    .sdc-tooth.st-implant     { background:var(--c-implant-bg);     border-color:var(--c-implant-bd);     color:var(--c-implant-tx); }
    .sdc-tooth.st-draft       { background:var(--c-draft-bg);       border-color:var(--c-draft-bd);       color:var(--c-draft-tx); }
    .sdc-tooth.st-caries .sdc-pip      { background:var(--c-caries-bd);      display:block; }
    .sdc-tooth.st-restoration .sdc-pip { background:var(--c-restoration-bd); display:block; }
    .sdc-tooth.st-missing .sdc-pip     { background:var(--c-missing-bd);     display:block; }
    .sdc-tooth.st-implant .sdc-pip     { background:var(--c-implant-bd);     display:block; }
    .sdc-tooth.st-draft .sdc-pip       { background:var(--c-draft-bd);       display:block; }
    .sdc-summary { display:none; margin-top:24px; border-top:1px solid var(--sdc-border); padding-top:20px; }
    .sdc-summary-visible { display:block; }
    .sdc-sum-title { font-size:13px; font-weight:500; color:var(--sdc-muted); margin-bottom:10px; }
    .sdc-sum-list { display:flex; flex-direction:column; gap:7px; }
    .sdc-sum-item { padding:10px 14px; border-radius:8px; border:1px solid var(--sdc-border); border-left-width:3px; cursor:pointer; background:#fff; transition:opacity 0.12s; }
    .sdc-sum-item:hover { opacity:0.75; }
    .sdc-sum-item.caries      { border-left-color:var(--c-caries-bd); }
    .sdc-sum-item.restoration { border-left-color:var(--c-restoration-bd); }
    .sdc-sum-item.missing     { border-left-color:var(--c-missing-bd); }
    .sdc-sum-item.implant     { border-left-color:var(--c-implant-bd); }
    .sdc-sum-item.draft       { border-left-color:var(--c-draft-bd); }
    .sdc-si-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
    .sdc-si-num { font-size:13px; font-weight:500; }
    .sdc-si-badge { font-size:11px; padding:2px 9px; border-radius:20px; border:1px solid; }
    .sdc-si-badge.caries      { background:var(--c-caries-bg);      border-color:var(--c-caries-bd);      color:var(--c-caries-tx); }
    .sdc-si-badge.restoration { background:var(--c-restoration-bg); border-color:var(--c-restoration-bd); color:var(--c-restoration-tx); }
    .sdc-si-badge.missing     { background:var(--c-missing-bg);     border-color:var(--c-missing-bd);     color:var(--c-missing-tx); }
    .sdc-si-badge.implant     { background:var(--c-implant-bg);     border-color:var(--c-implant-bd);     color:var(--c-implant-tx); }
    .sdc-si-badge.draft       { background:var(--c-draft-bg);       border-color:var(--c-draft-bd);       color:var(--c-draft-tx); }
    .sdc-si-badge.healthy     { background:#f8fafc; border-color:#cbd5e1; color:#475569; }
    .sdc-si-note { font-size:13px; color:var(--sdc-muted); line-height:1.5; }
    .sdc-si-time { font-size:11px; color:var(--sdc-hint); margin-top:2px; }
    .sdc-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.38); display:flex; align-items:center; justify-content:center; z-index:9999; opacity:0; pointer-events:none; transition:opacity 0.18s; }
    .sdc-overlay-open { opacity:1; pointer-events:all; }
    .sdc-modal { background:#fff; border-radius:14px; padding:26px 28px; width:400px; max-width:94vw; border:1px solid var(--sdc-border); transform:translateY(14px) scale(0.98); transition:transform 0.2s; }
    .sdc-overlay-open .sdc-modal { transform:translateY(0) scale(1); }
    .sdc-mhd { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
    .sdc-m-lbl { font-size:10px; font-weight:700; letter-spacing:0.7px; text-transform:uppercase; color:var(--sdc-hint); }
    .sdc-m-num { font-size:26px; font-weight:600; line-height:1.1; }
    .sdc-m-x { background:none; border:none; cursor:pointer; font-size:22px; color:var(--sdc-hint); padding:2px 6px; border-radius:4px; line-height:1; }
    .sdc-m-x:hover { background:var(--sdc-bg); }
    .sdc-flbl { font-size:12px; color:var(--sdc-muted); font-weight:500; margin-bottom:7px; display:block; }
    .sdc-pills { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:18px; }
    .sdc-pill { font-size:12px; padding:5px 14px; border-radius:20px; border:1.5px solid var(--sdc-border); background:var(--sdc-bg); color:var(--sdc-muted); cursor:pointer; transition:all 0.12s; }
    .sdc-pill.active.healthy     { background:#f8fafc;                  border-color:#94a3b8;             color:var(--sdc-text); }
    .sdc-pill.active.caries      { background:var(--c-caries-bg);       border-color:var(--c-caries-bd);  color:var(--c-caries-tx); font-weight:500; }
    .sdc-pill.active.restoration { background:var(--c-restoration-bg);  border-color:var(--c-restoration-bd); color:var(--c-restoration-tx); font-weight:500; }
    .sdc-pill.active.missing     { background:var(--c-missing-bg);      border-color:var(--c-missing-bd); color:var(--c-missing-tx); font-weight:500; }
    .sdc-pill.active.implant     { background:var(--c-implant-bg);      border-color:var(--c-implant-bd); color:var(--c-implant-tx); font-weight:500; }
    .sdc-textarea { width:100%; resize:vertical; border:1px solid var(--sdc-border); border-radius:8px; padding:10px 12px; font-size:13px; font-family:inherit; line-height:1.6; color:var(--sdc-text); background:var(--sdc-bg); outline:none; transition:border-color 0.15s; box-sizing:border-box; }
    .sdc-textarea:focus { border-color:#3b82f6; background:#fff; box-shadow:0 0 0 3px #93c5fd33; }
    .sdc-saved-at { font-size:11px; color:var(--sdc-hint); margin-top:5px; min-height:15px; }
    .sdc-mactions { display:flex; gap:10px; justify-content:flex-end; margin-top:18px; }
    .sdc-btn { padding:8px 20px; border-radius:8px; font-size:13px; cursor:pointer; font-family:inherit; transition:all 0.12s; }
    .sdc-btn-cancel { background:none; border:1px solid var(--sdc-border); color:var(--sdc-muted); }
    .sdc-btn-cancel:hover { background:var(--sdc-bg); }
    .sdc-btn-draft { background:#f97316; border:none; color:#fff; font-weight:500; }
    .sdc-btn-draft:hover { background:#ea6c0a; }
    .sdc-btn-draft:active { transform:scale(0.97); }
    .sdc-si-actions { display:flex; align-items:center; gap:8px; }
    .sdc-si-trash { display:flex; align-items:center; justify-content:center; background:none; border:none; cursor:pointer; padding:3px; border-radius:6px; color:#94a3b8; transition:color 0.12s, background 0.12s; }
    .sdc-si-trash .material-symbols-outlined { font-size:17px; }
    .sdc-si-trash:hover { color:#ef4444; background:#fee2e2; }
    .sdc-si-confirm { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:2px 0; }
    .sdc-si-confirm-msg { font-size:13px; font-weight:500; color:#dc2626; }
    .sdc-si-confirm-actions { display:flex; gap:8px; flex-shrink:0; }
    .sdc-btn-confirm-cancel { padding:5px 14px; border-radius:7px; border:1px solid var(--sdc-border); background:#fff; font-size:12px; font-weight:500; color:var(--sdc-muted); cursor:pointer; }
    .sdc-btn-confirm-cancel:hover { background:var(--sdc-bg); }
    .sdc-btn-confirm-delete { padding:5px 14px; border-radius:7px; border:none; background:#ef4444; font-size:12px; font-weight:600; color:#fff; cursor:pointer; }
    .sdc-btn-confirm-delete:hover { background:#dc2626; }
  `],
})
export class StudentPatientsComponent implements OnInit, OnDestroy {
  selectedPatient: Patient | null = null;
  activeSection: 'patient-file' | 'lab-request' | 'procedure-note' = 'patient-file';
  activeTab    = 'chief';
  searchTerm = '';

  // List state
  patients:        Patient[] = [];
  currentPage      = 1;
  pageSize         = 10;
  totalPatients    = 0;
  pageSizeOptions  = [10, 25, 50];

  // Procedure notes
  procedureNotes:        ProcedureNote[] = [];
  procedureNotesLoading  = false;
  selectedNote:          ProcedureNote | null = null;

  // Lab requests
  labRequests:        LabRequest[] = [];
  labRequestsLoading  = false;
  selectedLabRequest: LabRequest | null = null;

  // Modals
  showNoteModal  = false;
  showLabModal   = false;
  noteSubmitting = false;
  labSubmitting  = false;
  noteError = '';
  labError  = '';

  noteForm = {
    diagnosisType:        '',
    clinicalFindings:     '',
    radiographicFindings: '',
    progressNote:         '',
  };

  labForm = {
    toothNumber:          '',
    workType:             '',
    shade:                '',
    instructions:         '',
    supervisorEmployeeId: null as number | null,
  };

  // Treatments
  treatments:        Treatment[] = [];
  treatmentsLoading  = false;
  showTreatModal     = false;
  treatSubmitting    = false;
  treatError         = '';
  treatForm = {
    treatmentType: '',
    treatmentNote: '',
    medicineName:  '',
    dosage:        '',
    duration:      '',
    cost:          '' as string,
  };

  private searchDebounce?: ReturnType<typeof setTimeout>;

  private autoOpenFileNo: string | null = null;

  constructor(
    private route:              ActivatedRoute,
    private patientService:     PatientService,
    private diagnosisService:   DiagnosisService,
    private labService:         LabService,
    private recordService:      RecordService,
    private dentalChartService: DentalChartService,
  ) {}

  ngOnInit(): void {
    this.autoOpenFileNo = this.route.snapshot.queryParamMap.get('fileNo');
    if (this.autoOpenFileNo) {
      const fileNo = this.autoOpenFileNo;
      this.patientService.getMyPatients({ page: 1, limit: 1, search: fileNo }).subscribe({
        next: (res: any) => {
          const rows = res.data?.rows ?? [];
          if (rows.length) {
            const r = rows[0];
            const patient: Patient = {
              patientId:       r.patient_id,
              recordId:        r.record_id ?? null,
              name:            r.full_name,
              fileNo:          String(r.file_number),
              phone:           r.phone_number ?? '—',
              gender:          r.gender ?? 'Male',
              dob:             r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString() : '—',
              age:             r.date_of_birth
                ? Math.floor((Date.now() - new Date(r.date_of_birth).getTime()) / 31557600000)
                : 0,
              nextAppointment: '—',
              allergies:       [],
              chronic:         r.chronic_diseases ? r.chronic_diseases.split(',').map((s: string) => s.trim()) : [],
              chiefComplaint:  r.chief_complaint ?? '',
              medicalHistory:  r.chief_complaint ?? '',
              odontogram:      {},
            };
            this.selectPatient(patient);
          }
          this.autoOpenFileNo = null;
        },
        error: () => { this.autoOpenFileNo = null; },
      });
    }
    this.loadPatients();
  }
  ngOnDestroy(): void { clearTimeout(this.searchDebounce); }

  loadPatients(): void {
    this.patientService.getMyPatients({
      page: this.currentPage, limit: this.pageSize, search: this.searchTerm || undefined,
    }).subscribe({
      next: (res: any) => {
        this.totalPatients = res.data?.total ?? 0;
        this.patients = (res.data?.rows ?? []).map((r: any) => ({
          patientId:       r.patient_id,
          recordId:        r.record_id ?? null,
          name:            r.full_name,
          fileNo:          String(r.file_number),
          phone:           r.phone_number ?? '—',
          gender:          r.gender ?? 'Male',
          dob:             r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString() : '—',
          age:             r.date_of_birth
            ? Math.floor((Date.now() - new Date(r.date_of_birth).getTime()) / 31557600000)
            : 0,
          nextAppointment: '—',
          allergies:       [] as string[],
          chronic:         r.chronic_diseases
            ? r.chronic_diseases.split(',').map((s: string) => s.trim())
            : [] as string[],
          chiefComplaint:  r.chief_complaint ?? '',
          medicalHistory:  r.chief_complaint ?? '',
          odontogram:      {} as Record<number, string>,
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

  // ── Tabs / Sections ───────────────────────────────────────────────────────

  readonly patientFileTabs = [
    { id: 'chief',     label: 'Chief Complaint' },
    { id: 'medical',   label: 'Medical History' },
    { id: 'dental',    label: 'Dental Chart' },
    { id: 'treatment', label: 'Treatment Plan' },
    { id: 'screening', label: 'Screening' },
  ];

  readonly sections: { id: 'patient-file' | 'lab-request' | 'procedure-note'; label: string; icon: string }[] = [
    { id: 'patient-file',   label: 'Patient File',   icon: 'folder_shared' },
    { id: 'lab-request',    label: 'Lab Request',    icon: 'science' },
    { id: 'procedure-note', label: 'Procedure Note', icon: 'edit_note' },
  ];

  // ── Navigation ────────────────────────────────────────────────────────────

  hasAlert(p: Patient): boolean {
    return p.allergies.length > 0 || p.chronic.length > 0;
  }

  selectPatient(p: Patient): void {
    this.selectedPatient    = p;
    this.activeSection      = 'patient-file';
    this.activeTab          = 'chief';
    this.procedureNotes     = [];
    this.labRequests        = [];
    this.treatments         = [];
    this.selectedNote       = null;
    this.selectedLabRequest = null;
    this.dentalChartService.createAssignment(String(p.patientId)).subscribe();
  }

  setSection(sectionId: 'patient-file' | 'lab-request' | 'procedure-note'): void {
    this.activeSection      = sectionId;
    this.selectedNote       = null;
    this.selectedLabRequest = null;
    if (sectionId === 'procedure-note' && this.procedureNotes.length === 0 && !this.procedureNotesLoading) {
      this.loadProcedureNotes();
    }
    if (sectionId === 'lab-request' && this.labRequests.length === 0 && !this.labRequestsLoading) {
      this.loadLabRequests();
    }
  }

  setTab(tabId: string): void {
    this.activeTab = tabId;
    if (tabId === 'treatment' && this.treatments.length === 0 && !this.treatmentsLoading) {
      this.loadTreatments();
    }
  }

  // ── Data loaders ──────────────────────────────────────────────────────────

  loadProcedureNotes(): void {
    if (!this.selectedPatient?.patientId) return;
    this.procedureNotesLoading = true;
    this.diagnosisService.getMyNotes({ patientId: this.selectedPatient.patientId, limit: 50 }).subscribe({
      next: (res: any) => {
        this.procedureNotes = (res.data?.rows ?? res.data ?? []).map((r: any) => ({
          id:                   r.diagnosis_id,
          procedure:            r.diagnosis_type,
          supervisor:           'Dr. ' + (r.supervisor_name || ''),
          status:               this.mapNoteStatus(r.status),
          clinicalFindings:     r.clinical_findings    || '',
          radiographicFindings: r.radiographic_findings || '',
          progressNote:         r.progress_note        || '',
          supervisorNotes:      r.doctor_feedback       || '',
        }));
        this.procedureNotesLoading = false;
      },
      error: () => { this.procedureNotes = []; this.procedureNotesLoading = false; },
    });
  }

  loadLabRequests(): void {
    if (!this.selectedPatient?.patientId) return;
    this.labRequestsLoading = true;
    this.labService.getLabRequests({ patientId: this.selectedPatient.patientId, limit: 50 }).subscribe({
      next: (res: any) => {
        this.labRequests = (res.data?.rows ?? []).map((r: any) => {
          const parsed = this.parseRequestNote(r.request_note ?? '');
          return {
            id:                 String(r.lab_request_id),
            workType:           parsed.workType || r.request_note || '—',
            dateSent:           r.request_timestamp
              ? new Date(r.request_timestamp).toLocaleDateString()
              : '—',
            doctorStatus:       (r.approved_by_name ? 'Approved' : 'Pending') as ApprovalStatus,
            labStatus:          (r.request_status ?? 'Pending') as LabStatus,
            supervisorName:     r.approved_by_name ?? '',
            labFeedback:        r.response_note    ?? '',
            parsedWorkType:     parsed.workType,
            parsedTooth:        parsed.tooth,
            parsedShade:        parsed.shade,
            parsedInstructions: parsed.instructions,
          };
        });
        this.labRequestsLoading = false;
      },
      error: () => { this.labRequests = []; this.labRequestsLoading = false; },
    });
  }

  private parseRequestNote(note: string): { workType: string; tooth: string; shade: string; instructions: string } {
    const get = (key: string) => {
      const m = note.match(new RegExp(`${key}:\\s*([^|]+)`));
      return m ? m[1].trim() : '';
    };
    return { workType: get('Work'), tooth: get('Tooth'), shade: get('Shade'), instructions: get('Instructions') };
  }

  labFeedbackBoxClass(req: LabRequest): string {
    const s = this.effectiveLabStatus(req);
    if (s === 'Accepted' || s === 'Approved') return 'bg-green-100 text-green-800';
    if (s === 'Rejected')                     return 'bg-red-100 text-red-800';
    return 'bg-gray-50 text-gray-500';
  }

  loadTreatments(): void {
    if (!this.selectedPatient?.recordId) return;
    this.treatmentsLoading = true;
    this.recordService.getPatientRecord(this.selectedPatient.patientId).subscribe({
      next: (res: any) => {
        this.treatments = res.data?.treatments ?? [];
        this.treatmentsLoading = false;
      },
      error: () => { this.treatments = []; this.treatmentsLoading = false; },
    });
  }

  openTreatModal(): void {
    this.treatForm  = { treatmentType: '', treatmentNote: '', medicineName: '', dosage: '', duration: '', cost: '' };
    this.treatError = '';
    this.showTreatModal = true;
  }

  closeTreatModal(): void { this.showTreatModal = false; }

  submitTreatment(): void {
    const f = this.treatForm;
    if (!f.treatmentType.trim() || !f.treatmentNote.trim() || !f.medicineName.trim() || !f.dosage.trim() || !f.duration.trim() || !f.cost) {
      this.treatError = 'All fields are required.'; return;
    }
    const recordId = this.selectedPatient?.recordId;
    if (!recordId) { this.treatError = 'No medical record found for this patient.'; return; }
    this.treatSubmitting = true;
    this.treatError = '';
    this.recordService.addTreatment(recordId, {
      treatmentType: f.treatmentType,
      treatmentNote: f.treatmentNote,
      medicineName:  f.medicineName,
      dosage:        f.dosage,
      duration:      f.duration,
      cost:          parseFloat(f.cost),
    }).subscribe({
      next: () => {
        this.treatSubmitting = false;
        this.showTreatModal  = false;
        this.treatments      = [];
        this.loadTreatments();
      },
      error: (err: any) => {
        this.treatSubmitting = false;
        this.treatError = err?.error?.error ?? err?.error?.message ?? 'Failed to save treatment.';
      },
    });
  }

  private mapNoteStatus(s: string): NoteStatus {
    if (s === 'Approved') return 'Approved';
    if (s === 'Rejected') return 'Denied';
    return 'Waiting Supervisor Approval';
  }

  // ── Procedure Note modal ──────────────────────────────────────────────────

  openNoteModal(): void {
    this.noteForm  = { diagnosisType: '', clinicalFindings: '', radiographicFindings: '', progressNote: '' };
    this.noteError = '';
    this.showNoteModal = true;
  }

  closeNoteModal(): void { this.showNoteModal = false; }

  submitNote(): void {
    const f = this.noteForm;
    if (!f.diagnosisType.trim() || !f.clinicalFindings.trim() || !f.radiographicFindings.trim() || !f.progressNote.trim()) {
      this.noteError = 'All fields are required.'; return;
    }
    this.noteSubmitting = true;
    this.noteError = '';
    this.diagnosisService.submitDiagnosis({
      patientId:            this.selectedPatient!.patientId,
      diagnosisType:        f.diagnosisType,
      clinicalFindings:     f.clinicalFindings,
      radiographicFindings: f.radiographicFindings,
      progressNote:         f.progressNote,
    }).subscribe({
      next: () => {
        this.noteSubmitting = false;
        this.showNoteModal  = false;
        this.procedureNotes = [];
        this.loadProcedureNotes();
      },
      error: (err: any) => {
        this.noteSubmitting = false;
        this.noteError = err?.error?.error ?? err?.error?.message ?? 'Failed to submit procedure note.';
      },
    });
  }

  // ── Lab Request modal ─────────────────────────────────────────────────────

  openLabModal(): void {
    this.labForm  = { toothNumber: '', workType: '', shade: '', instructions: '', supervisorEmployeeId: null };
    this.labError = '';
    this.showLabModal = true;
  }

  closeLabModal(): void { this.showLabModal = false; }

  submitLabRequest(): void {
    if (!this.labForm.workType)              { this.labError = 'Type of work is required.'; return; }
    if (!this.labForm.instructions.trim())   { this.labError = 'Instructions are required.'; return; }
    if (!this.labForm.supervisorEmployeeId)  { this.labError = 'Supervisor Employee ID is required.'; return; }

    const parts = [`Work: ${this.labForm.workType}`];
    if (this.labForm.toothNumber) parts.push(`Tooth: ${this.labForm.toothNumber}`);
    if (this.labForm.shade)       parts.push(`Shade: ${this.labForm.shade}`);
    parts.push(`Instructions: ${this.labForm.instructions}`);
    const requestNote = parts.join(' | ').substring(0, 500);

    this.labSubmitting = true;
    this.labError = '';
    this.labService.createLabRequest({
      requestNote,
      supervisorEmployeeId: this.labForm.supervisorEmployeeId,
      patientId:            this.selectedPatient!.patientId,
    }).subscribe({
      next: () => {
        this.labSubmitting = false;
        this.showLabModal  = false;
        this.labRequests   = [];
        this.loadLabRequests();
      },
      error: (err: any) => {
        this.labSubmitting = false;
        this.labError = err?.error?.error ?? err?.error?.message ?? 'Failed to submit lab request.';
      },
    });
  }

  // ── Status helpers ────────────────────────────────────────────────────────

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

  noteStatusClass(status: NoteStatus): string {
    if (status === 'Approved') return 'bg-green-100 text-green-800';
    if (status === 'Denied')   return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  }

  noteFeedbackClass(status: NoteStatus): string {
    if (status === 'Approved') return 'bg-green-100 text-green-800';
    if (status === 'Denied')   return 'bg-red-100 text-red-800';
    return 'bg-gray-50 text-gray-500';
  }

}
