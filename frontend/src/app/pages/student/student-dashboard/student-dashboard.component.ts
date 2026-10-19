import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AppointmentService } from '../../../services/appointment.service';
import { DiagnosisService }   from '../../../services/diagnosis.service';
import { apptRelativeTime, apptRelativeColor, apptDotColor } from '../../../shared/time-indicator.util';

interface Appointment {
  appointmentId: number;
  time:       string;
  hour:       number;
  minute:     number;
  patient:    string;
  fileNo:     string;
  procedure:  string;
  supervisor: string;
  done:       boolean;
}

@Component({
  standalone: false,
  selector: 'app-student-dashboard',
  templateUrl: './student-dashboard.component.html',
})
export class StudentDashboardComponent implements OnInit, OnDestroy {
  lastUpdated = '';
  todayLabel  = '';
  now         = new Date();

  notesApproved = 0;
  notesPending  = 0;
  notesRejected = 0;

  appointments:        Appointment[] = [];
  appointmentsLoading = true;

  private timer: any;

  get patientsSeen():  number { return this.appointments.filter(a => a.done).length; }
  get totalPatients(): number { return this.appointments.length; }

  constructor(
    private router:             Router,
    private appointmentService: AppointmentService,
    private diagnosisService:   DiagnosisService,
  ) {}

  ngOnInit(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    this.loadTodayAppointments();
    this.loadNotesCounts();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private tick(): void {
    this.now = new Date();
    this.lastUpdated = this.now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    this.todayLabel  = this.now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  private loadTodayAppointments(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    this.appointmentService.getAppointments({ date: tomorrowStr, limit: 50 }).subscribe({
      next: (res: any) => {
        const rows: any[] = res.data ?? [];
        this.appointments = rows.map(r => {
          const d = new Date(r.appointment_start_time);
          return {
            appointmentId: r.appointment_id,
            time:      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
            hour:      d.getHours(),
            minute:    d.getMinutes(),
            patient:   r.patient_name,
            fileNo:    String(r.file_number),
            procedure: r.type_name,
            supervisor: r.doctor_name ? 'Dr. ' + r.doctor_name : '—',
            done: r.status === 'Completed',
          };
        });
        this.appointmentsLoading = false;
      },
      error: () => { this.appointments = []; this.appointmentsLoading = false; },
    });
  }

  private loadNotesCounts(): void {
    this.diagnosisService.getMyNotes({ limit: 200 }).subscribe({
      next: (res: any) => {
        const rows: any[] = res.data?.rows ?? res.data ?? [];
        this.notesApproved = rows.filter(r => r.status === 'Approved').length;
        this.notesPending  = rows.filter(r => r.status === 'Submitted').length;
        this.notesRejected = rows.filter(r => r.status === 'Rejected').length;
      },
    });
  }

  viewFile(appt: Appointment): void {
    appt.done = true;
    this.router.navigate(['/student/patients'], { queryParams: { fileNo: appt.fileNo } });
  }

  getRelativeTime(appt: Appointment):  string { return apptRelativeTime(appt.hour, appt.minute, this.now); }
  getRelativeColor(appt: Appointment): string { return apptRelativeColor(appt.hour, appt.minute, this.now); }
  getDotColor(appt: Appointment):      string { return apptDotColor(appt.hour, appt.minute, this.now); }

  goToPatients(): void { this.router.navigate(['/student/patients']); }
  goToNotes():    void { this.router.navigate(['/student/patients']); }
}
