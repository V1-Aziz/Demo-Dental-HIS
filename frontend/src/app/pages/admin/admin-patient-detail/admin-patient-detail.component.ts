import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PatientFileViewComponent } from '../../../shared/components/patient-file-view/patient-file-view.component';
import { PatientFileRole } from '../../../shared/types/patient-file.types';

@Component({
  standalone: true,
  imports:    [CommonModule, PatientFileViewComponent],
  selector:   'app-admin-patient-detail',
  template: `
    <div class="page-container">
      <div class="page-nav">
        <button class="back-btn" (click)="goBack()">← Back to Patients</button>
      </div>
      <app-patient-file-view
        *ngIf="patientId"
        [patientId]="patientId"
        [userRole]="role"
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
export class AdminPatientDetailComponent implements OnInit {
  patientId = 0;
  role = PatientFileRole.Admin;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void { this.patientId = parseInt(this.route.snapshot.params['id'], 10); }

  goBack(): void { this.router.navigate(['../'], { relativeTo: this.route }); }
}
