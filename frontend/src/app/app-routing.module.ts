import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';

const routes: Routes = [
  {
    path: 'login',
    loadChildren: () => import('./pages/auth/auth.module').then(m => m.AuthModule),
  },
  {
    path: 'register',
    redirectTo: 'login/register',
    pathMatch: 'full',
  },
  {
    path: 'admin',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['Admin'] },
    loadChildren: () => import('./pages/admin/admin.module').then(m => m.AdminModule),
  },
  {
    path: 'doctor',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['Doctor'] },
    loadChildren: () => import('./pages/doctor/doctor.module').then(m => m.DoctorModule),
  },
  {
    path: 'student',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['Student'] },
    loadChildren: () => import('./pages/student/student.module').then(m => m.StudentModule),
  },
  {
    path: 'assistant',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['DentalAssistant'] },
    loadChildren: () => import('./pages/assistant/assistant.module').then(m => m.AssistantModule),
  },
  {
    path: 'receptionist',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['Receptionist'] },
    loadChildren: () => import('./pages/receptionist/receptionist.module').then(m => m.ReceptionistModule),
  },
  {
    path: 'inventory-manager',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['InventoryManager'] },
    loadChildren: () => import('./pages/inventory-manager/inventory-manager.module').then(m => m.InventoryManagerModule),
  },
  {
    path: 'lab-specialist',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['LabTechnician'] },
    loadChildren: () => import('./pages/lab-specialist/lab-specialist.module').then(m => m.LabSpecialistModule),
  },
  {
    path: 'radiologist',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['Radiologist'] },
    loadChildren: () => import('./pages/radiologist/radiologist.module').then(m => m.RadiologistModule),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
