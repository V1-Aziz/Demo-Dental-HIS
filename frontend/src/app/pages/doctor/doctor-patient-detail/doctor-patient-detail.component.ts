import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PatientFileViewComponent } from '../../../shared/components/patient-file-view/patient-file-view.component';
import { PatientFileRole } from '../../../shared/types/patient-file.types';

@Component({
  standalone: true,
  imports:    [CommonModule, PatientFileViewComponent],
  selector:   'app-doctor-patient-detail',
  template: `
    <div class="space-y-4">
      <button
        (click)="goBack()"
        class="flex items-center text-sm text-gray-500 hover:text-royal transition-colors">
        <span class="material-symbols-outlined text-base mr-1">arrow_back</span>
        Back to Patients
      </button>
      <app-patient-file-view
        *ngIf="patientId"
        [patientId]="patientId"
        [userRole]="role"
      ></app-patient-file-view>
    </div>
  `,
  styles: [],
})
export class DoctorPatientDetailComponent implements OnInit {
  patientId = 0;
  role = PatientFileRole.Doctor;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.patientId = parseInt(this.route.snapshot.params['id'], 10);
  }

  goBack(): void { this.router.navigate(['../'], { relativeTo: this.route }); }
}
