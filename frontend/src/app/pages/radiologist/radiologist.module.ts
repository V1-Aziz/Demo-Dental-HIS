import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { RadiologistLayoutComponent }       from './radiologist-layout/radiologist-layout.component';
import { RadiologistDashboardComponent }    from './radiologist-dashboard/radiologist-dashboard.component';
import { RadiologistPatientFilesComponent } from './radiologist-patient-files/radiologist-patient-files.component';
import { RadiologistPatientDetailComponent } from './radiologist-patient-detail/radiologist-patient-detail.component';
import { RadiologistTicketsComponent }      from './radiologist-tickets/radiologist-tickets.component';

const routes: Routes = [
  {
    path: '',
    component: RadiologistLayoutComponent,
    children: [
      { path: '',              redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',     component: RadiologistDashboardComponent },
      { path: 'patients',      component: RadiologistPatientFilesComponent },
      { path: 'patients/:id',  component: RadiologistPatientDetailComponent },
      { path: 'tickets',       component: RadiologistTicketsComponent },
    ],
  },
];

@NgModule({
  declarations: [
    RadiologistLayoutComponent,
    RadiologistDashboardComponent,
    RadiologistPatientFilesComponent,
    RadiologistPatientDetailComponent,
    RadiologistTicketsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
  ],
})
export class RadiologistModule {}
