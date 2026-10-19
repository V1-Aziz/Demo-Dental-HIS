import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RadiologistService } from '../../../services/radiologist.service';
import { RadiologistDashboardSummary } from '../../../shared/types/screening.types';

@Component({
  standalone: false,
  selector: 'app-radiologist-dashboard',
  templateUrl: './radiologist-dashboard.component.html',
})
export class RadiologistDashboardComponent implements OnInit {
  summary: RadiologistDashboardSummary | null = null;
  loading = true;
  error: string | null = null;

  constructor(
    private radiologistService: RadiologistService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.radiologistService.getDashboard().subscribe({
      next:  (data) => { this.summary = data; this.loading = false; },
      error: ()     => { this.error = 'Failed to load dashboard'; this.loading = false; },
    });
  }

  openPatient(patientId: number): void {
    this.router.navigate(['/radiologist/patients', patientId]);
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
}
