import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule }                 from '../../shared/shared.module';
import { StatusBadgeComponent }         from '../../shared/components/status-badge/status-badge.component';
import { LabRequestFormModalComponent } from '../../shared/components/lab-request-form-modal/lab-request-form-modal.component';
import { DoctorLayoutComponent }       from './doctor-layout/doctor-layout.component';
import { DoctorDashboardComponent }    from './doctor-dashboard/doctor-dashboard.component';
import { DoctorAppointmentsComponent } from './doctor-appointments/doctor-appointments.component';
import { DoctorPatientsComponent }     from './doctor-patients/doctor-patients.component';
import { DoctorLabRequestsComponent }  from './doctor-lab-requests/doctor-lab-requests.component';
import { DoctorEvaluationsComponent }  from './doctor-evaluations/doctor-evaluations.component';
import { DoctorTicketsComponent }      from './doctor-tickets/doctor-tickets.component';
import { DentalChartComponent }           from '../../shared/dental-chart/dental-chart.component';
import { DoctorPatientDetailComponent }  from './doctor-patient-detail/doctor-patient-detail.component';

const routes: Routes = [
  {
    path: '',
    component: DoctorLayoutComponent,
    children: [
      { path: '',                redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',       component: DoctorDashboardComponent },
      { path: 'appointments',    component: DoctorAppointmentsComponent },
      { path: 'patients',        component: DoctorPatientsComponent },
      { path: 'patients/:id',    component: DoctorPatientDetailComponent },
      { path: 'lab-requests',    component: DoctorLabRequestsComponent },
      { path: 'evaluations',     component: DoctorEvaluationsComponent },
      { path: 'tickets',         component: DoctorTicketsComponent },
    ],
  },
];

@NgModule({
  declarations: [
    DoctorLayoutComponent,
    DoctorDashboardComponent,
    DoctorAppointmentsComponent,
    DoctorPatientsComponent,
    DoctorLabRequestsComponent,
    DoctorEvaluationsComponent,
    DoctorTicketsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
    DentalChartComponent,
    StatusBadgeComponent,
    DoctorPatientDetailComponent,
    LabRequestFormModalComponent,
  ],
})
export class DoctorModule {}
