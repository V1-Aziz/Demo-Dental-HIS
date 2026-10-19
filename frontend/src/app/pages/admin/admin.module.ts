import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule }            from '../../shared/shared.module';
import { AdminLayoutComponent }    from './admin-layout/admin-layout.component';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
import { AdminUsersComponent }     from './admin-users/admin-users.component';
import { AdminPatientsComponent }  from './admin-patients/admin-patients.component';
import { AdminInventoryComponent } from './admin-inventory/admin-inventory.component';
import { AdminReportsComponent }   from './admin-reports/admin-reports.component';
import { AdminHistoryComponent }   from './admin-history/admin-history.component';
import { NewPatientRegistrationsComponent } from './admin-reports/new-patient-registrations/new-patient-registrations.component';
import { PatientDemographicsComponent }     from './admin-reports/patient-demographics/patient-demographics.component';
import { AttendanceNoShowComponent }        from './admin-reports/attendance-no-show/attendance-no-show.component';
import { ClinicOccupancyComponent }         from './admin-reports/clinic-occupancy/clinic-occupancy.component';
import { LowStockItemsComponent }           from './admin-reports/low-stock-items/low-stock-items.component';
import { ConsumptionReportComponent }       from './admin-reports/consumption-report/consumption-report.component';
import { StudentProcedureLogComponent }     from './admin-reports/student-procedure-log/student-procedure-log.component';
import { SupervisorEvaluationComponent }    from './admin-reports/supervisor-evaluation/supervisor-evaluation.component';
import { AdminPatientDetailComponent }      from './admin-patient-detail/admin-patient-detail.component';
import { AdminSystemSettingsComponent }     from './admin-system-settings/admin-system-settings.component';
import { PendingApprovalsComponent }        from './admin-system-settings/pending-approvals/pending-approvals.component';
import { DropdownsComponent }               from './admin-system-settings/dropdowns/dropdowns.component';

const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '',              redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',     component: AdminDashboardComponent },
      { path: 'users',         component: AdminUsersComponent },
      { path: 'patients',      component: AdminPatientsComponent },
      { path: 'patients/:id',  component: AdminPatientDetailComponent },
      { path: 'inventory',     component: AdminInventoryComponent },
      { path: 'history',       component: AdminHistoryComponent },
      { path: 'reports',       component: AdminReportsComponent },
      {
        path: 'system-settings',
        component: AdminSystemSettingsComponent,
        children: [
          { path: '',                  redirectTo: 'pending-approvals', pathMatch: 'full' },
          { path: 'pending-approvals', component: PendingApprovalsComponent },
          { path: 'dropdowns',         component: DropdownsComponent },
        ],
      },
    ],
  },
];

@NgModule({
  declarations: [
    AdminLayoutComponent,
    AdminDashboardComponent,
    AdminUsersComponent,
    AdminPatientsComponent,
    AdminInventoryComponent,
    AdminReportsComponent,
    AdminHistoryComponent,
    NewPatientRegistrationsComponent,
    PatientDemographicsComponent,
    AttendanceNoShowComponent,
    ClinicOccupancyComponent,
    LowStockItemsComponent,
    ConsumptionReportComponent,
    StudentProcedureLogComponent,
    SupervisorEvaluationComponent,
    AdminSystemSettingsComponent,
    PendingApprovalsComponent,
    DropdownsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    SharedModule,
    AdminPatientDetailComponent,
  ],
})
export class AdminModule {}
