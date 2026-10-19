import { Component, OnDestroy, OnInit } from '@angular/core';
import { PatientService } from '../../../services/patient.service';

type ModalMode = 'add' | 'edit';

interface Patient {
  id: number;
  patientName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  civilID: string;
  fileNo: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
}

@Component({
  standalone: false,
  selector: 'app-receptionist-patients',
  templateUrl: './receptionist-patients.component.html',
})
export class ReceptionistPatientsComponent implements OnInit, OnDestroy {
  searchTerm = '';
  selectedPatient: Patient | null = null;
  isModalOpen = false;
  modalMode: ModalMode = 'add';
  isSaving = false;
  saveError = '';

  patients: Patient[] = [];
  currentPage     = 1;
  pageSize        = 10;
  totalPatients   = 0;
  pageSizeOptions = [10, 25, 50];

  private searchDebounce?: ReturnType<typeof setTimeout>;

  form = {
    firstName:   '',
    middleName:  '',
    lastName:    '',
    fileNumber:  '',
    nationalId:  '',
    dateOfBirth: '',
    gender:      'Male',
    phoneNumber: '',
    email:       '',
  };

  constructor(private patientService: PatientService) {}

  ngOnInit(): void { this.loadPatients(); }

  ngOnDestroy(): void { clearTimeout(this.searchDebounce); }

  loadPatients(): void {
    this.patientService.getPatients({
      page: this.currentPage, limit: this.pageSize, search: this.searchTerm || undefined,
    }).subscribe({
      next: (res: any) => {
        this.totalPatients = res.data?.total ?? 0;
        this.patients = (res.data?.rows ?? []).map((r: any) => ({
          id: r.patient_id,
          patientName: r.full_name,
          firstName: r.first_name ?? '',
          middleName: r.middle_name ?? '',
          lastName: r.last_name ?? '',
          civilID: String(r.national_id ?? ''),
          fileNo: String(r.file_number),
          phone: r.phone_number ?? '',
          gender: r.gender ?? '—',
          dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : '',
        }));
      },
      error: () => { this.patients = []; this.totalPatients = 0; },
    });
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.totalPatients / this.pageSize)); }
  get pageRangeStart(): number { return this.totalPatients === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd(): number { return Math.min(this.currentPage * this.pageSize, this.totalPatients); }

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

  openModal(mode: ModalMode): void {
    this.modalMode = mode;
    this.saveError = '';
    if (mode === 'edit' && this.selectedPatient) {
      const p = this.selectedPatient;
      this.form = {
        firstName:   p.firstName,
        middleName:  p.middleName,
        lastName:    p.lastName,
        fileNumber:  p.fileNo,
        nationalId:  p.civilID,
        dateOfBirth: p.dateOfBirth,
        gender:      p.gender,
        phoneNumber: p.phone,
        email:       '',
      };
    } else {
      this.form = { firstName: '', middleName: '', lastName: '', fileNumber: '',
                    nationalId: '', dateOfBirth: '', gender: 'Male', phoneNumber: '', email: '' };
    }
    this.isModalOpen = true;
  }

  get modalTitle(): string {
    return this.modalMode === 'add' ? 'Register New Patient' : 'Edit Patient Information';
  }

  savePatient(): void {
    this.saveError = '';
    this.isSaving = true;

    if (this.modalMode === 'edit') {
      this.patientService.updatePatientPhone(this.selectedPatient!.id, this.form.phoneNumber).subscribe({
        next: () => {
          this.isModalOpen = false;
          this.isSaving = false;
          this.currentPage = 1; this.loadPatients();
        },
        error: (err: any) => {
          this.saveError = err?.error?.error ?? 'Failed to update phone number.';
          this.isSaving = false;
        },
      });
      return;
    }

    if (!this.form.firstName || !this.form.lastName || !this.form.nationalId ||
        !this.form.fileNumber || !this.form.dateOfBirth) {
      this.saveError = 'Please fill in all required fields.';
      this.isSaving = false;
      return;
    }

    this.patientService.createPatient({
      fileNumber:  parseInt(this.form.fileNumber, 10),
      nationalId:  parseInt(this.form.nationalId, 10),
      firstName:   this.form.firstName,
      middleName:  this.form.middleName || ' ',
      lastName:    this.form.lastName,
      dateOfBirth: this.form.dateOfBirth,
      gender:      this.form.gender,
      phoneNumber: this.form.phoneNumber || undefined,
      email:       this.form.email || undefined,
    }).subscribe({
      next: () => {
        this.isModalOpen = false;
        this.isSaving = false;
        this.currentPage = 1; this.loadPatients();
      },
      error: (err: any) => {
        this.saveError = err?.error?.error ?? 'Failed to register patient. Please try again.';
        this.isSaving = false;
      },
    });
  }
}
