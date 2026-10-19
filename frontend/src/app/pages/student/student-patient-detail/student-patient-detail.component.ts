import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PatientFileViewComponent } from '../../../shared/components/patient-file-view/patient-file-view.component';
import { PatientFileRole } from '../../../shared/types/patient-file.types';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  standalone: true,
  imports:    [CommonModule, PatientFileViewComponent],
  selector:   'app-student-patient-detail',
  template: `
    <div class="page-container">
      <div class="page-nav">
        <button class="back-btn" (click)="goBack()">← Back to Patients</button>
      </div>
      <app-patient-file-view
        *ngIf="patientId"
        [patientId]="patientId"
        [userRole]="role"
        [patientAssignedToUser]="isAssigned"
      ></app-patient-file-view>
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; }
    .page-nav { margin-bottom: 16px; }
    .back-btn { background: none; border: none; color: #2563eb; cursor: pointer; font-size: 0.9rem; font-weight: 600; padding: 0; }
    .back-btn:hover { text-decoration: underline; }
  `],
})
export class StudentPatientDetailComponent implements OnInit {
  patientId  = 0;
  role       = PatientFileRole.Student;
  isAssigned = false;

  constructor(
    private route:  ActivatedRoute,
    private router: Router,
    private http:   HttpClient,
  ) {}

  ngOnInit(): void {
    this.patientId = parseInt(this.route.snapshot.params['id'], 10);
    // Check if this patient is assigned to the logged-in student
    this.http.get<any>(`${environment.apiUrl}/patients/${this.patientId}/visits/today`).subscribe({
      next: (res) => { this.isAssigned = res.data?.patient_is_assigned_to_user ?? false; },
      error: ()   => { this.isAssigned = false; },
    });
  }

  goBack(): void { this.router.navigate(['../'], { relativeTo: this.route }); }
}
