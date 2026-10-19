import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
  selector: 'app-doctor-patients',
  templateUrl: './doctor-patients.component.html',
})
export class DoctorPatientsComponent implements OnInit, OnDestroy {
  selectedPatient: Patient | null  = null;
  record:          PatientRecord | null = null;
  recordLoading    = false;

  activeSection: 'patient-file' | 'lab-request' | 'procedure-note' = 'patient-file';
  activeTab    = 'chief';
  searchTerm   = '';
  patients:        Patient[] = [];
  patientsLoading  = true;
  patientsError    = false;
  currentPage      = 1;
  pageSize         = 10;
  totalPatients    = 0;
  pageSizeOptions  = [10, 25, 50];

  // Lab requests
  labRequests:       LabRequest[] = [];
  labRequestsLoading = false;

  // Lab request modal
  showLabModal  = false;
  labSubmitting = false;
  labError      = '';
  labForm = { toothNumber: '', workType: '', shade: '', instructions: '' };

  // Procedure note detail
  selectedDiagnosis: Diagnosis | null = null;

  // Medical history edit
  historyForm     = { chiefComplaint: '', chronicDiseases: '' };
  isSavingHistory = false;

  // Diagnosis modal
  isDiagModalOpen = false;
  isSavingDiag    = false;
  diagError       = '';
  diagForm = { diagnosisType: '', clinicalFindings: '', radiographicFindings: '', progressNote: '' };

  // Treatment modal
  isTreatModalOpen = false;
  isSavingTreat    = false;
  treatError       = '';
  treatForm = { treatmentType: '', treatmentNote: '', medicineName: '', dosage: '', duration: '', cost: '' };

  // Odontogram
  odontogramTool = 'healthy';
  toothState: Record<number, string> = {};

  readonly upperLeft  = [18, 17, 16, 15, 14, 13, 12, 11];
  readonly upperRight = [21, 22, 23, 24, 25, 26, 27, 28];
  readonly lowerLeft  = [48, 47, 46, 45, 44, 43, 42, 41];
  readonly lowerRight = [31, 32, 33, 34, 35, 36, 37, 38];

  readonly odontogramTools = [
    { id: 'healthy',     color: 'bg-white border border-gray-300' },
    { id: 'caries',      color: 'bg-red-500' },
    { id: 'restoration', color: 'bg-blue-500' },
    { id: 'missing',     color: 'bg-gray-400' },
    { id: 'implant',     color: 'bg-yellow-500' },
  ];

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

  private searchDebounce?: ReturnType<typeof setTimeout>;

  constructor(
    private patientService: PatientService,
    private recordService:  RecordService,
    private labService:     LabService,
    private route:          ActivatedRoute,
    private router:         Router,
  ) {}

  openPatient(id: number): void {
    this.router.navigate([id], { relativeTo: this.route });
  }

  ngOnInit(): void {
    const fileNo = this.route.snapshot.queryParamMap.get('fileNo');
    if (fileNo) {
      this.searchTerm = fileNo;
      this.loadPatients(() => {
        const match = this.patients.find(p => p.fileNo === fileNo);
        if (match) this.selectPatient(match);
      });
    } else {
      this.loadPatients();
    }
  }
  ngOnDestroy(): void { clearTimeout(this.searchDebounce); }

  loadPatients(callback?: () => void): void {
    this.patientsLoading = true;
    this.patientsError   = false;
    this.patientService.getPatients({
      page: this.currentPage, limit: this.pageSize, search: this.searchTerm || undefined,
    }).subscribe({
      next: (res: any) => {
        this.totalPatients   = res.data?.total ?? 0;
        this.patients        = (res.data?.rows ?? []).map((r: any) => ({
          id:     r.patient_id,
          name:   r.full_name,
          fileNo: String(r.file_number),
          phone:  r.phone_number ?? '—',
          gender: r.gender === 'Male' ? 'M' : 'F',
          civil:  String(r.national_id ?? ''),
          dob:    r.date_of_birth ? new Date(r.date_of_birth).toLocaleDateString() : '—',
        }));
        this.patientsLoading = false;
        callback?.();
      },
      error: (err: any) => {
        console.error('[DoctorPatients] loadPatients HTTP error', err?.status, '— debug:', err?.error?.debug ?? err?.error?.error ?? err?.message);
        this.patients        = [];
        this.totalPatients   = 0;
        this.patientsLoading = false;
        this.patientsError   = true;
      },
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
    this.toothState        = {};
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
        this.record = res.data;
        this.historyForm = {
          chiefComplaint:  res.data?.chief_complaint  ?? '',
          chronicDiseases: res.data?.chronic_diseases ?? '',
        };
        this.recordLoading = false;
      },
      error: () => { this.recordLoading = false; },
    });
  }

  openLabModal(): void {
    this.labForm  = { toothNumber: '', workType: '', shade: '', instructions: '' };
    this.labError = '';
    this.showLabModal = true;
  }

  closeLabModal(): void { this.showLabModal = false; }

  submitLabRequest(): void {
    if (!this.labForm.workType)            { this.labError = 'Type of work is required.'; return; }
    if (!this.labForm.instructions.trim()) { this.labError = 'Instructions are required.'; return; }

    const parts = [`Work: ${this.labForm.workType}`];
    if (this.labForm.toothNumber) parts.push(`Tooth: ${this.labForm.toothNumber}`);
    if (this.labForm.shade)       parts.push(`Shade: ${this.labForm.shade}`);
    parts.push(`Instructions: ${this.labForm.instructions}`);
    const requestNote = parts.join(' | ').substring(0, 500);

    this.labSubmitting = true;
    this.labError = '';
    this.labService.createLabRequest({
      requestNote,
      patientId: this.selectedPatient!.id,
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

  saveHistory(): void {
    if (!this.record) return;
    this.isSavingHistory = true;
    this.recordService.updateRecord(this.record.record_id, {
      chiefComplaint:  this.historyForm.chiefComplaint,
      chronicDiseases: this.historyForm.chronicDiseases,
    }).subscribe({
      next: () => {
        this.isSavingHistory = false;
        if (this.record) {
          this.record.chief_complaint  = this.historyForm.chiefComplaint;
          this.record.chronic_diseases = this.historyForm.chronicDiseases;
        }
      },
      error: () => { this.isSavingHistory = false; },
    });
  }

  openDiagModal(): void {
    this.diagForm  = { diagnosisType: '', clinicalFindings: '', radiographicFindings: '', progressNote: '' };
    this.diagError = '';
    this.isDiagModalOpen = true;
  }

  saveDiagnosis(): void {
    this.diagError = '';
    const f = this.diagForm;
    if (!f.diagnosisType || !f.clinicalFindings || !f.radiographicFindings || !f.progressNote) {
      this.diagError = 'All fields are required.'; return;
    }
    this.isSavingDiag = true;
    this.recordService.addDiagnosis(this.record!.record_id, f).subscribe({
      next: () => {
        this.isDiagModalOpen = false;
        this.isSavingDiag    = false;
        this.loadRecord(this.selectedPatient!.id);
      },
      error: (err: any) => {
        this.diagError    = err?.error?.error ?? 'Failed to save diagnosis.';
        this.isSavingDiag = false;
      },
    });
  }

  openTreatModal(): void {
    this.treatForm  = { treatmentType: '', treatmentNote: '', medicineName: '', dosage: '', duration: '', cost: '' };
    this.treatError = '';
    this.isTreatModalOpen = true;
  }

  saveTreatment(): void {
    this.treatError = '';
    const f = this.treatForm;
    if (!f.treatmentType || !f.treatmentNote || !f.medicineName || !f.dosage || !f.duration || !f.cost) {
      this.treatError = 'All fields are required.'; return;
    }
    this.isSavingTreat = true;
    this.recordService.addTreatment(this.record!.record_id, {
      treatmentType: f.treatmentType,
      treatmentNote: f.treatmentNote,
      medicineName:  f.medicineName,
      dosage:        f.dosage,
      duration:      f.duration,
      cost:          parseFloat(f.cost),
    }).subscribe({
      next: () => {
        this.isTreatModalOpen = false;
        this.isSavingTreat    = false;
        this.loadRecord(this.selectedPatient!.id);
      },
      error: (err: any) => {
        this.treatError    = err?.error?.error ?? 'Failed to save treatment.';
        this.isSavingTreat = false;
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

  // ── Odontogram ────────────────────────────────────────────────────────────

  clickTooth(id: number): void {
    this.toothState = { ...this.toothState, [id]: this.odontogramTool === 'healthy' ? '' : this.odontogramTool };
  }

  toothClass(id: number): string {
    switch (this.toothState[id]) {
      case 'caries':      return 'bg-red-500 text-white';
      case 'restoration': return 'bg-blue-500 text-white';
      case 'missing':     return 'bg-gray-400 text-white';
      case 'implant':     return 'bg-yellow-500 text-black';
      default:            return 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
    }
  }
}
