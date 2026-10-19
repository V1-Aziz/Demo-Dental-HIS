import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { PatientService } from '../../../services/patient.service';
import { RecordService }  from '../../../services/record.service';
import { PatientFileRole } from '../../types/patient-file.types';
import { DentalChartService } from '../../../services/dental-chart.service';
import { FileAccessInfo } from '../../dental-chart/dental-chart.component';

import { OverviewComponent }        from './overview/overview.component';
import { DentalChartViewComponent } from './dental-chart/dental-chart.component';
import { DentalChartComponent }     from '../../dental-chart/dental-chart.component';
import { VisitHistoryComponent }    from './visit-history/visit-history.component';
import { TodaysVisitComponent }     from './todays-visit/todays-visit.component';
import { LabRequestListEmbedComponent } from './lab-request-list-embed/lab-request-list-embed.component';
import { ScreeningTabComponent }    from './screening-tab/screening-tab.component';
import { PatientFileService }       from '../../../services/patient-file.service';

type MainTab    = 'today' | 'patient-file' | 'lab-request';
type PatientTab = 'overview' | 'dental-chart' | 'visit-history' | 'screening';

@Component({
  standalone: true,
  imports: [
    CommonModule,
    OverviewComponent,
    DentalChartViewComponent,
    DentalChartComponent,
    VisitHistoryComponent,
    TodaysVisitComponent,
    LabRequestListEmbedComponent,
    ScreeningTabComponent,
  ],
  providers: [DatePipe],
  selector:   'app-patient-file-view',
  template: `
    <!-- Toast (fixed, mid-session expiry notification) -->
    <div *ngIf="accessToastVisible"
         class="fixed bottom-6 right-6 z-[9999] bg-[#1e3a5f] text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl max-w-sm leading-relaxed">
      {{ accessToastMessage }}
    </div>

    <div class="space-y-4" *ngIf="patient">

      <!-- Patient header card -->
      <div class="bg-white rounded-lg shadow-sm p-6 border-l-4 border-royal">
        <h1 class="text-2xl font-bold text-royal">{{ displayName }}</h1>
        <p class="text-gray-500 text-sm mt-0.5">File No: {{ patient.file_number }}</p>

        <div *ngIf="patient.chronic_diseases"
             class="mt-4 bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-center border border-red-200">
          <span class="material-symbols-outlined text-xl mr-3">warning</span>
          <p class="text-sm font-bold">Medical Alert: {{ patient.chronic_diseases }}</p>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-6 border-t text-sm">
          <div>
            <span class="text-gray-500 block uppercase font-bold text-[10px] tracking-wider">Phone</span>
            <span class="text-gray-800">{{ patient.phone_number || '—' }}</span>
          </div>
          <div>
            <span class="text-gray-500 block uppercase font-bold text-[10px] tracking-wider">Date of Birth</span>
            <span class="text-gray-800">{{ (patient.date_of_birth | date:'M/d/yyyy') || '—' }}</span>
          </div>
          <div>
            <span class="text-gray-500 block uppercase font-bold text-[10px] tracking-wider">Civil ID</span>
            <span class="text-gray-800">{{ patient.national_id || '—' }}</span>
          </div>
          <div>
            <span class="text-gray-500 block uppercase font-bold text-[10px] tracking-wider">Gender</span>
            <span class="text-gray-800">{{ patient.gender || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- Access banner (Students only) -->
      <div *ngIf="userRole === PatientFileRole.Student && accessLoading"
           class="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400">
        <span class="material-symbols-outlined text-lg animate-spin">progress_activity</span>
        Checking file access…
      </div>
      <div *ngIf="userRole === PatientFileRole.Student && fileAccess && !accessLoading"
           class="flex items-start gap-3 px-4 py-3 rounded-lg border text-sm"
           [ngClass]="accessBannerClass">
        <span class="material-symbols-outlined text-lg flex-shrink-0 mt-0.5">{{ accessBannerIcon }}</span>
        <div>
          <div class="font-semibold">{{ accessBannerTitle }}</div>
          <div class="text-xs mt-0.5 opacity-85">{{ accessBannerSubtitle }}</div>
        </div>
      </div>

      <!-- Main tab bar -->
      <div class="bg-white rounded-lg shadow-sm border border-gray-200 flex overflow-hidden">
        <button
          *ngIf="showTodaysVisit"
          (click)="mainTab = 'today'"
          [class]="tabBtnClass(mainTab === 'today', !isLast('today'))">
          <span [class]="dotClass(mainTab === 'today')"></span>
          <span class="material-symbols-outlined text-base">today</span>
          Today's Visit
        </button>
        <button
          (click)="mainTab = 'patient-file'"
          [class]="tabBtnClass(mainTab === 'patient-file', !isLast('patient-file'))">
          <span [class]="dotClass(mainTab === 'patient-file')"></span>
          <span class="material-symbols-outlined text-base">folder_open</span>
          Patient File
        </button>
        <button
          (click)="mainTab = 'lab-request'"
          [class]="tabBtnClass(mainTab === 'lab-request', false)">
          <span [class]="dotClass(mainTab === 'lab-request')"></span>
          <span class="material-symbols-outlined text-base">science</span>
          Lab Request
        </button>
      </div>

      <!-- TODAY'S VISIT -->
      <div *ngIf="mainTab === 'today'" class="bg-white rounded-lg shadow-sm">
        <app-todays-visit
          [patientId]="patientId"
          [recordId]="recordId"
        ></app-todays-visit>
      </div>

      <!-- PATIENT FILE -->
      <div *ngIf="mainTab === 'patient-file'" class="bg-white rounded-lg shadow-sm overflow-hidden">
        <div class="flex border-b border-gray-200 bg-gray-50">
          <button
            *ngFor="let t of subTabs; let last = last"
            (click)="patientTab = t.id"
            [class]="subTabClass(patientTab === t.id, !last)">
            {{ t.label }}
          </button>
        </div>
        <div [ngSwitch]="patientTab" class="p-5">
          <app-overview
            *ngSwitchCase="'overview'"
            [patientId]="patientId"
            [userRole]="userRole"
            [isWriteMode]="isWriteMode"
          ></app-overview>
          <ng-container *ngSwitchCase="'dental-chart'">
            <app-dental-chart
              *ngIf="userRole === 'Student'"
              [patientId]="patientId"
              [recordId]="recordId"
              [fileAccess]="fileAccess"
            ></app-dental-chart>
            <app-dental-chart-view
              *ngIf="userRole !== 'Student'"
              [patientId]="patientId"
              [recordId]="recordId"
            ></app-dental-chart-view>
          </ng-container>
          <app-visit-history
            *ngSwitchCase="'visit-history'"
            [patientId]="patientId"
          ></app-visit-history>
          <app-screening-tab
            *ngSwitchCase="'screening'"
            [patientId]="patientId"
            [recordId]="recordId"
            [userRole]="userRole"
            [isWriteMode]="isWriteMode"
            [appointmentId]="activeAppointmentId"
          ></app-screening-tab>
        </div>
      </div>

      <!-- LAB REQUEST -->
      <div *ngIf="mainTab === 'lab-request'" class="bg-white rounded-lg shadow-sm">
        <app-lab-request-list-embed
          [patientId]="patientId"
          [canCreate]="userRole === PatientFileRole.Doctor || userRole === PatientFileRole.Student"
          [isWriteMode]="isWriteMode"
          [lockedFileNoDisplay]="patient?.file_number?.toString()"
        ></app-lab-request-list-embed>
      </div>
    </div>

    <div *ngIf="!patient && !loading" class="text-center py-12 text-gray-400 italic">Patient not found.</div>
    <div *ngIf="loading"             class="text-center py-12 text-gray-400 italic">Loading patient…</div>
  `,
})
export class PatientFileViewComponent implements OnInit, OnDestroy {
  @Input({ required: true }) patientId!: number;
  @Input({ required: true }) userRole!:  PatientFileRole;
  @Input() patientAssignedToUser = false;
  @Input() activeAppointmentId: number | null = null;  // forwarded to screening tab for request-screening flow

  readonly PatientFileRole = PatientFileRole;

  mainTab:    MainTab    = 'patient-file';
  patientTab: PatientTab = 'overview';

  loading  = true;
  patient: any = null;
  recordId = 0;

  // ─── Temporal access state (Students only) ──────────────────────────────────
  fileAccess:    FileAccessInfo | null = null;
  accessLoading  = false;
  accessToastVisible  = false;
  accessToastMessage  = '';
  private accessRefreshInterval: any;

  get isWriteMode(): boolean {
    if (this.userRole !== PatientFileRole.Student) return true;
    return this.fileAccess !== null && this.fileAccess.accessType === 'write';
  }

  get accessBannerClass(): string {
    if (!this.fileAccess) return '';
    if (this.isWriteMode && this.fileAccess.hoursRemaining > 4)
      return 'bg-blue-50 border-blue-200 text-blue-700';
    if (this.isWriteMode && this.fileAccess.hoursRemaining <= 4)
      return 'bg-amber-50 border-amber-200 text-amber-700';
    if (this.fileAccess.isExpired)
      return 'bg-red-50 border-red-200 text-red-700';
    return 'bg-slate-50 border-slate-200 text-slate-500';
  }

  get accessBannerIcon(): string {
    if (!this.fileAccess) return '';
    if (this.isWriteMode && this.fileAccess.hoursRemaining > 4)  return 'edit';
    if (this.isWriteMode && this.fileAccess.hoursRemaining <= 4) return 'schedule';
    if (this.fileAccess.isExpired) return 'lock';
    return 'visibility';
  }

  get accessBannerTitle(): string {
    if (!this.fileAccess) return '';
    if (this.isWriteMode && this.fileAccess.hoursRemaining > 4)  return 'Write access active.';
    if (this.isWriteMode && this.fileAccess.hoursRemaining <= 4) return 'Write access expiring soon.';
    if (this.fileAccess.isExpired) return 'Write access expired.';
    return 'Read-only access.';
  }

  get accessBannerSubtitle(): string {
    if (!this.fileAccess) return '';
    if (this.isWriteMode && this.fileAccess.hoursRemaining > 4)
      return `You have ${this.fileAccess.hoursRemaining} hours remaining to submit your diagnosis.`;
    if (this.isWriteMode && this.fileAccess.hoursRemaining <= 4)
      return `Only ${this.fileAccess.hoursRemaining} hours remaining. Submit your work before access expires.`;
    if (this.fileAccess.isExpired)
      return 'This file is now read-only. You can still view all content but cannot make changes.';
    return 'You are not assigned to this patient file.';
  }

  get subTabs(): Array<{ id: PatientTab; label: string }> {
    return [
      { id: 'overview',      label: 'Overview' },
      { id: 'dental-chart',  label: 'Dental Chart' },
      { id: 'visit-history', label: 'Visit History' },
      { id: 'screening',     label: 'Screening' },
    ];
  }

  get showTodaysVisit(): boolean {
    return this.userRole === PatientFileRole.Doctor || this.userRole === PatientFileRole.Student;
  }

  get displayName(): string {
    if (!this.patient) return '';
    if (this.patient.full_name) return this.patient.full_name;
    return [this.patient.first_name, this.patient.middle_name, this.patient.last_name].filter(Boolean).join(' ');
  }

  isLast(tab: MainTab): boolean {
    return tab === 'lab-request';
  }

  tabBtnClass(active: boolean, withBorder: boolean): string {
    const base   = 'relative flex-1 flex items-center justify-center gap-2.5 px-6 py-4 text-sm font-bold transition-colors border-b-[3px] ';
    const border = withBorder ? 'border-r border-r-gray-200 ' : '';
    const state  = active
      ? 'border-b-gray-900 text-gray-900 bg-white'
      : 'border-b-transparent text-gray-500 bg-gray-50 hover:bg-gray-100 hover:text-gray-700';
    return base + border + state;
  }

  dotClass(active: boolean): string {
    return 'w-2 h-2 rounded-full bg-gold flex-shrink-0 transition-opacity ' + (active ? 'opacity-100' : 'opacity-0');
  }

  subTabClass(active: boolean, withBorder: boolean): string {
    const base   = 'flex-1 text-center px-4 py-3 text-sm font-semibold transition-colors border-b-[3px] ';
    const border = withBorder ? 'border-r border-r-gray-200 ' : '';
    const state  = active
      ? 'bg-white text-royal border-b-gold'
      : 'bg-gray-50 text-gray-500 border-b-transparent hover:bg-gray-100 hover:text-gray-700';
    return base + border + state;
  }

  constructor(
    private patientSvc:          PatientService,
    private recordSvc:           RecordService,
    private dentalChartService:  DentalChartService,
    private patientFileSvc:      PatientFileService,
  ) {}

  ngOnInit(): void {
    this.mainTab = this.showTodaysVisit ? 'today' : 'patient-file';

    this.patientSvc.getPatientById(this.patientId).subscribe({
      next: (res) => {
        this.patient  = res.data ?? res;
        this.loading  = false;
        this.recordId = this.patient?.record_id ?? 0;
        if (!this.recordId) {
          this.recordSvc.getPatientRecord(this.patientId).subscribe({
            next: (r) => { this.recordId = r.data?.record_id ?? r.record_id ?? 0; },
          });
        }
      },
      error: () => { this.loading = false; },
    });

    if (this.userRole === PatientFileRole.Doctor || this.userRole === PatientFileRole.Student) {
      this.patientFileSvc.getTodaysAppointments(this.patientId).subscribe({
        next: (res: any) => {
          const appointments: any[] = res.data?.appointments ?? res.appointments ?? [];
          if (appointments.length) this.activeAppointmentId = appointments[0].appointment_id;
        },
        error: () => {},
      });
    }

    if (this.userRole === PatientFileRole.Student) {
      this.initAccessCheck();
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.accessRefreshInterval);
  }

  private initAccessCheck(): void {
    this.accessLoading = true;
    this.dentalChartService.createAssignment(String(this.patientId)).subscribe({
      next:  () => this.fetchFileAccess(),
      error: () => this.fetchFileAccess(),
    });
    this.accessRefreshInterval = setInterval(() => this.fetchFileAccess(), 5 * 60 * 1000);
  }

  private fetchFileAccess(): void {
    const prev = this.fileAccess?.accessType ?? null;
    this.dentalChartService.getFileAccess(String(this.patientId)).subscribe({
      next: (res: any) => {
        this.fileAccess    = res.data as FileAccessInfo;
        this.accessLoading = false;
        if (prev === 'write' && this.fileAccess?.accessType === 'read') {
          this.showAccessToast('Your write access has just expired. This file is now read-only.');
        }
      },
      error: () => {
        this.fileAccess    = { accessType: 'read', isAssigned: false, isExpired: false, hoursRemaining: 0 };
        this.accessLoading = false;
      },
    });
  }

  private showAccessToast(message: string): void {
    this.accessToastMessage = message;
    this.accessToastVisible = true;
    setTimeout(() => { this.accessToastVisible = false; }, 5000);
  }
}
