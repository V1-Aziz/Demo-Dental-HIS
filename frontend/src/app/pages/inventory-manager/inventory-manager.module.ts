import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule }                       from '../../shared/shared.module';
import { InventoryManagerLayoutComponent }   from './inventory-manager-layout/inventory-manager-layout.component';
import { InventoryManagerDashboardComponent } from './inventory-manager-dashboard/inventory-manager-dashboard.component';
import { InventoryManagerInventoryComponent } from './inventory-manager-inventory/inventory-manager-inventory.component';
import { InventoryManagerRequestsComponent }  from './inventory-manager-requests/inventory-manager-requests.component';
import { InventoryManagerHistoryComponent }   from './inventory-manager-history/inventory-manager-history.component';
import { InventoryManagerTicketsComponent }   from './inventory-manager-tickets/inventory-manager-tickets.component';

const routes: Routes = [
  {
    path: '',
    component: InventoryManagerLayoutComponent,
    children: [
      { path: '',          redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: InventoryManagerDashboardComponent },
      { path: 'inventory', component: InventoryManagerInventoryComponent },
      { path: 'requests',  component: InventoryManagerRequestsComponent },
      { path: 'history',   component: InventoryManagerHistoryComponent },
      { path: 'tickets',   component: InventoryManagerTicketsComponent },
    ],
  },
];

@NgModule({
  declarations: [
    InventoryManagerLayoutComponent,
    InventoryManagerDashboardComponent,
    InventoryManagerInventoryComponent,
    InventoryManagerRequestsComponent,
    InventoryManagerHistoryComponent,
    InventoryManagerTicketsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    SharedModule,
  ],
})
export class InventoryManagerModule {}
