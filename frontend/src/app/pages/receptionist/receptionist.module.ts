import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { ReceptionistLayoutComponent }    from './receptionist-layout/receptionist-layout.component';
import { ReceptionistDashboardComponent } from './receptionist-dashboard/receptionist-dashboard.component';
import { ReceptionistPatientsComponent }  from './receptionist-patients/receptionist-patients.component';
import { ReceptionistSchedulingComponent } from './receptionist-scheduling/receptionist-scheduling.component';
import { ReceptionistTicketsComponent }   from './receptionist-tickets/receptionist-tickets.component';
import { BookAppointmentModalComponent }  from './receptionist-scheduling/book-appointment-modal/book-appointment-modal.component';
import { ArrivalCellComponent }           from '../../shared/components/arrival-cell/arrival-cell.component';

const routes: Routes = [
  {
    path: '',
    component: ReceptionistLayoutComponent,
    children: [
      { path: '',           redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard',  component: ReceptionistDashboardComponent },
      { path: 'scheduling', component: ReceptionistSchedulingComponent },
      { path: 'patients',   component: ReceptionistPatientsComponent },
      { path: 'tickets',    component: ReceptionistTicketsComponent },
    ],
  },
];

@NgModule({
  declarations: [
    ReceptionistLayoutComponent,
    ReceptionistDashboardComponent,
    ReceptionistPatientsComponent,
    ReceptionistSchedulingComponent,
    ReceptionistTicketsComponent,
    BookAppointmentModalComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    ArrivalCellComponent,
  ],
})
export class ReceptionistModule {}
