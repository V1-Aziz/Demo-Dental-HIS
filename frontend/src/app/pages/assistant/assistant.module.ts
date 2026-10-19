import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule }               from '../../shared/shared.module';
import { AssistantLayoutComponent }   from './assistant-layout/assistant-layout.component';
import { AssistantDashboardComponent } from './assistant-dashboard/assistant-dashboard.component';
import { AssistantPatientsComponent }  from './assistant-patients/assistant-patients.component';
import { AssistantInventoryComponent } from './assistant-inventory/assistant-inventory.component';
import { AssistantTicketsComponent }         from './assistant-tickets/assistant-tickets.component';
import { AssistantPatientDetailComponent }   from './assistant-patient-detail/assistant-patient-detail.component';

const routes: Routes = [
  {
    path: '',
    component: AssistantLayoutComponent,
    children: [
      { path: '',              redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',     component: AssistantDashboardComponent },
      { path: 'patients',      component: AssistantPatientsComponent },
      { path: 'patients/:id',  component: AssistantPatientDetailComponent },
      { path: 'inventory',     component: AssistantInventoryComponent },
      { path: 'tickets',       component: AssistantTicketsComponent },
    ],
  },
];

@NgModule({
  declarations: [
    AssistantLayoutComponent,
    AssistantDashboardComponent,
    AssistantPatientsComponent,
    AssistantInventoryComponent,
    AssistantTicketsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
    AssistantPatientDetailComponent,
  ],
})
export class AssistantModule {}
