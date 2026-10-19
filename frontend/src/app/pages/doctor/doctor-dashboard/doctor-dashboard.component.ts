import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { apptRelativeTime, apptRelativeColor, apptDotColor } from '../../../shared/time-indicator.util';
import { AppointmentService } from '../../../services/appointment.service';

interface Appointment {
  time: string;
  hour: number;
  minute: number;
  patient: string;
  patientId: number;
  fileNo: string;
  reason: string;
  status: 'Scheduled' | 'Completed';
  age: number;
  gender: 'M' | 'F';
  medicalAlert?: string;
}

interface NextPatient {
  patient: string;
  patientId: number;
  fileNo:  string;
  time:    string;
  reason:  string;
  hour:    number;
  minute:  number;
  age:     number;
  gender:  'M' | 'F';
  medicalAlert?: string;
}

@Component({
  standalone: false,
  selector: 'app-doctor-dashboard',
  templateUrl: './doctor-dashboard.component.html',
})
export class DoctorDashboardComponent implements OnInit, OnDestroy {
  isReviewModalOpen = false;
  now = new Date();
  private clockTimer: any;
  private refreshTimer: any;
  private routerSub?: Subscription;

  // ── Smart Daily Briefing ──────────────────────────────────────────────────
  briefingPopover: 'patients' | 'labs' | 'pending' | null = null;

  todayPatients: { name: string; patientId: number; fileNo: string; time: string; reason: string }[] = [];

  readonly readyLabs = [
    { id: 'LAB-221', work: 'Zirconia Crown', patient: 'Abdullah Al-Qahtani' },
    { id: 'LAB-219', work: 'PFM Bridge',     patient: 'Fatima Al-Zahrani'   },
  ];

  readonly pendingSubmissions = [
    { student: 'Ali Hassan',     procedure: 'Caries Excavation', status: 'Waiting Approval' },
    { student: 'Nora Salem',     procedure: 'Root Canal',        status: 'Waiting Approval' },
    { student: 'Omar Al-Ghamdi', procedure: 'Crown Prep',        status: 'Waiting Approval' },
  ];

  toggleBriefing(chip: 'patients' | 'labs' | 'pending'): void {
    this.briefingPopover = this.briefingPopover === chip ? null : chip;
  }

  // ── Appointments table (live from API) ────────────────────────────────────
  appointments: Appointment[] = [];

  // ── Next Patient (live from API) ──────────────────────────────────────────
  nextPatient: NextPatient | null = null;

  get nextPatientBadge(): { text: string; isNow: boolean } {
    if (!this.nextPatient) return { text: '', isNow: false };
    const apptMins = this.nextPatient.hour * 60 + this.nextPatient.minute;
    const nowMins  = this.now.getHours() * 60 + this.now.getMinutes();
    const diff = apptMins - nowMins;
    if (diff <= 0) return { text: 'Now', isNow: true };
    if (diff < 60) return { text: `In ${diff} min`, isNow: false };
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return { text: m > 0 ? `In ${h}h ${m}m` : `In ${h}h`, isNow: false };
  }

  loadTodayData(): void {
    this.appointmentService.getTodayAppointments().subscribe({
      next: (res: any) => {
        const rows: any[] = res.data?.rows ?? res.data ?? [];

        const all: Appointment[] = rows
          .map((r: any) => {
            const start = r.appointment_start_time ? new Date(r.appointment_start_time) : null;
            const rawStatus = r.status ?? 'Scheduled';
            return {
              patient:      r.patient_name ?? '—',
              patientId:    Number(r.patient_id ?? 0),
              fileNo:       String(r.file_number ?? ''),
              time:         start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
              reason:       r.type_name ?? '—',
              hour:         start ? start.getHours() : 0,
              minute:       start ? start.getMinutes() : 0,
              status:       (rawStatus === 'Completed' ? 'Completed' : 'Scheduled') as 'Scheduled' | 'Completed',
              age:          r.date_of_birth ? this.calcAge(r.date_of_birth) : 0,
              gender:       (r.gender === 'Female' ? 'F' : 'M') as 'M' | 'F',
              medicalAlert: r.medical_alert ?? undefined,
            } as Appointment;
          })
          .sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

        this.appointments = all;

        this.todayPatients = all.map(a => ({
          name: a.patient, patientId: a.patientId, fileNo: a.fileNo, time: a.time, reason: a.reason,
        }));

        const nowMins = this.now.getHours() * 60 + this.now.getMinutes();
        const upcoming = all.filter(
          a => a.status === 'Scheduled' && (a.hour * 60 + a.minute) >= nowMins - 30
        );
        this.nextPatient = upcoming.length > 0 ? { ...upcoming[0] } : null;
      },
      error: () => {
        this.appointments  = [];
        this.nextPatient   = null;
        this.todayPatients = [];
      },
    });
  }

  goToPatientFile(patientId: number): void {
    if (!patientId) return;
    this.router.navigate(['/doctor/patients', patientId]);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.briefing-chip-area')) this.briefingPopover = null;
  }

  constructor(
    private router: Router,
    private appointmentService: AppointmentService,
  ) {}

  ngOnInit(): void {
    this.now = new Date();
    this.clockTimer = setInterval(() => { this.now = new Date(); }, 1000);
    this.loadTodayData();
    this.refreshTimer = setInterval(() => { this.loadTodayData(); }, 60_000);
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        if ((e.urlAfterRedirects as string).includes('/doctor/dashboard')) {
          this.loadTodayData();
        }
      });
  }

  ngOnDestroy(): void {
    if (this.clockTimer)   clearInterval(this.clockTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.routerSub)    this.routerSub.unsubscribe();
  }

  calcAge(dob: string): number {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  getRelativeTime(appt: Appointment): string  { return apptRelativeTime(appt.hour, appt.minute, this.now); }
  getRelativeColor(appt: Appointment): string { return apptRelativeColor(appt.hour, appt.minute, this.now); }
  getDotColor(appt: Appointment): string      { return apptDotColor(appt.hour, appt.minute, this.now); }

  goToAppointments(): void { this.router.navigate(['/doctor/appointments']); }
  goToTickets(): void      { this.router.navigate(['/doctor/tickets']); }
  goToPatients(): void     { this.router.navigate(['/doctor/patients']); }
  goToLabRequests(): void  { this.router.navigate(['/doctor/lab-requests']); }
  goToEvaluations(): void  { this.router.navigate(['/doctor/evaluations']); }
}
