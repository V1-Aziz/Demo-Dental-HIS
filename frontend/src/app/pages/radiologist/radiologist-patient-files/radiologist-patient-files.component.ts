import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RadiologistService } from '../../../services/radiologist.service';
import { RadiologistPatientRow } from '../../../shared/types/screening.types';

@Component({
  standalone: false,
  selector: 'app-radiologist-patient-files',
  templateUrl: './radiologist-patient-files.component.html',
})
export class RadiologistPatientFilesComponent implements OnInit {
  patients: RadiologistPatientRow[] = [];
  filtered: RadiologistPatientRow[] = [];
  loading = true;
  error: string | null = null;
  searchTerm = '';

  constructor(
    private radiologistService: RadiologistService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.radiologistService.listPatients().subscribe({
      next: (rows) => {
        this.patients = rows;
        this.filtered = rows;
        this.loading  = false;
      },
      error: () => { this.error = 'Failed to load patients'; this.loading = false; },
    });
  }

  onSearch(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) { this.filtered = this.patients; return; }
    this.filtered = this.patients.filter(p =>
      (p.first_name + ' ' + p.last_name).toLowerCase().includes(term) ||
      (p.file_number ?? '').toLowerCase().includes(term),
    );
  }

  openPatient(patientId: number): void {
    this.router.navigate(['/radiologist/patients', patientId]);
  }
}
