import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule }               from '../../shared/shared.module';
import { StatusBadgeComponent }       from '../../shared/components/status-badge/status-badge.component';
import { DentalChartComponent }       from '../../shared/dental-chart/dental-chart.component';
import { LabRequestDetailsModalComponent } from '../../shared/components/lab-request-details-modal/lab-request-details-modal.component';
import { StudentLayoutComponent }     from './student-layout/student-layout.component';
import { StudentDashboardComponent }  from './student-dashboard/student-dashboard.component';
import { StudentPatientsComponent }   from './student-patients/student-patients.component';
import { StudentNotesComponent }      from './student-notes/student-notes.component';
import { StudentLabRequestsComponent } from './student-lab-requests/student-lab-requests.component';
import { StudentTicketsComponent }       from './student-tickets/student-tickets.component';
import { StudentPatientDetailComponent } from './student-patient-detail/student-patient-detail.component';
import { StudentGradesComponent }       from './student-grades/student-grades.component';

const routes: Routes = [
  {
    path: '',
    component: StudentLayoutComponent,
    children: [
      { path: '',               redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',      component: StudentDashboardComponent },
      { path: 'patients',       component: StudentPatientsComponent },
      { path: 'patients/:id',   component: StudentPatientDetailComponent },
      { path: 'notes',          component: StudentNotesComponent },
      { path: 'lab-requests',   component: StudentLabRequestsComponent },
      { path: 'tickets',        component: StudentTicketsComponent },
      { path: 'grades',         component: StudentGradesComponent },
    ],
  },
];

@NgModule({
  declarations: [
    StudentLayoutComponent,
    StudentDashboardComponent,
    StudentPatientsComponent,
    StudentNotesComponent,
    StudentLabRequestsComponent,
    StudentTicketsComponent,
    StudentGradesComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
    StatusBadgeComponent,
    StudentPatientDetailComponent,
    DentalChartComponent,
    LabRequestDetailsModalComponent,
  ],
})
export class StudentModule {}
