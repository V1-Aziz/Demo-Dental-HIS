import { Component, OnDestroy, OnInit } from '@angular/core';
import { PatientService } from '../../../services/patient.service';

interface Patient {
  id:   number;
  name: string;
  fileNo: string;
  phone: string;
  gender: 'M' | 'F';
  registration: string;
  nationality: string;
  civil: string;
  allergy: string;
}

@Component({
  standalone: false,
  selector: 'app-admin-patients',
  templateUrl: './admin-patients.component.html',
})
export class AdminPatientsComponent implements OnInit, OnDestroy {
  selectedPatient: Patient | null = null;
  activeTab = 'overview';
  odontogramTool = 'healthy';
  toothState: Record<number, string> = {};
  searchTerm = '';

  patients: Patient[] = [];
  currentPage     = 1;
  pageSize        = 10;
  totalPatients   = 0;
  pageSizeOptions = [10, 25, 50];

  private searchDebounce?: ReturnType<typeof setTimeout>;

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
          id:   r.patient_id,
          name: r.full_name,
          fileNo: String(r.file_number),
          gender: r.gender === 'Male' ? 'M' : 'F',
          phone: r.phone_number ?? '—',
          registration: '—',
          nationality: '—',
          civil: String(r.national_id ?? ''),
          allergy: r.chronic_diseases ?? 'None',
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

  readonly tabs = ['Overview', 'Medical History', 'Odontogram', 'Treatment Plan', 'Images'];

  tabId(tab: string): string {
    return tab.toLowerCase().replace(' ', '');
  }

  selectPatient(p: Patient): void {
    this.selectedPatient = p;
    this.activeTab = 'overview';
    this.toothState = {};
  }

  clickTooth(id: number): void {
    this.toothState = { ...this.toothState, [id]: this.odontogramTool };
  }

  toothClass(id: number): string {
    const state = this.toothState[id];
    switch (state) {
      case 'caries':      return 'bg-red-500 border-red-500 text-white';
      case 'restoration': return 'bg-blue-500 border-blue-500 text-white';
      case 'missing':     return 'bg-gray-400 border-gray-400 text-white';
      case 'implant':     return 'bg-yellow-500 border-yellow-500 text-black';
      default:            return 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50';
    }
  }
}
