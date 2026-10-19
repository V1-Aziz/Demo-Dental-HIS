import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule }                    from '../../shared/shared.module';
import { LabSpecialistLayoutComponent }    from './lab-specialist-layout/lab-specialist-layout.component';
import { LabSpecialistDashboardComponent } from './lab-specialist-dashboard/lab-specialist-dashboard.component';
import { LabSpecialistRequestsComponent }  from './lab-specialist-requests/lab-specialist-requests.component';
import { LabSpecialistInventoryComponent } from './lab-specialist-inventory/lab-specialist-inventory.component';
import { LabSpecialistTicketsComponent }   from './lab-specialist-tickets/lab-specialist-tickets.component';

const routes: Routes = [
  {
    path: '',
    component: LabSpecialistLayoutComponent,
    children: [
      { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: LabSpecialistDashboardComponent },
      { path: 'requests',  component: LabSpecialistRequestsComponent },
      { path: 'inventory', component: LabSpecialistInventoryComponent },
      { path: 'tickets',   component: LabSpecialistTicketsComponent },
    ],
  },
];

@NgModule({
  declarations: [
    LabSpecialistLayoutComponent,
    LabSpecialistDashboardComponent,
    LabSpecialistRequestsComponent,
    LabSpecialistInventoryComponent,
    LabSpecialistTicketsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
  ],
})
export class LabSpecialistModule {}
