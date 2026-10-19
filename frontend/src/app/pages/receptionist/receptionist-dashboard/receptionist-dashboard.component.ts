import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AppointmentService } from '../../../services/appointment.service';
import { DashboardService } from '../../../services/dashboard.service';
import { ArrivalState, ArrivalStatus } from '../../../shared/components/arrival-cell/arrival-cell.component';

interface StatCard {
  label: string;
  value: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

interface Appointment {
  appointmentId: number;
  patientName: string;
  fileNo: string;
  procedure: string;
  assignedDr: string;
  clinic: string;
  time: string;
  date: string;
  startTimeRaw: string;
  arrivalStatus: ArrivalStatus | null;
  arrivedAt: string | null;
}

@Component({
  standalone: false,
  selector: 'app-receptionist-dashboard',
  templateUrl: './receptionist-dashboard.component.html',
})
export class ReceptionistDashboardComponent implements OnInit {
  stats: StatCard[] = [
    { label: "Today's Appointments", value: '—', icon: 'calendar_month', iconBg: 'bg-blue-100',   iconColor: 'text-royal' },
    { label: "Today's Show Rate",    value: '—', icon: 'check_circle',   iconBg: 'bg-green-100',  iconColor: 'text-green-800' },
    { label: 'New Patients',         value: '—', icon: 'person_add',     iconBg: 'bg-indigo-100', iconColor: 'text-indigo-800' },
    { label: 'New Appointments',     value: '—', icon: 'event',          iconBg: 'bg-yellow-100', iconColor: 'text-yellow-800' },
  ];

  appointments: Appointment[] = [];

  constructor(
    private router: Router,
    private appointmentService: AppointmentService,
    private dashboardService: DashboardService,
  ) {}

  ngOnInit(): void {
    this.dashboardService.getReceptionistStats().subscribe((res: any) => {
      const data = res.data ?? {};
      const today = data.todayAppointments ?? 0;
      const completed = data.completedToday ?? 0;
      const showRate = today > 0 ? Math.round((completed / today) * 100) : 0;

      this.stats[0].value = String(today);
      this.stats[1].value = showRate + '%';
      this.stats[2].value = String(data.totalPatients ?? 0);
      this.stats[3].value = String(data.scheduledToday ?? 0);
    });

    this.appointmentService.getTodayAppointments().subscribe((res: any) => {
      this.appointments = (res.data?.rows ?? res.data ?? []).map((r: any) => ({
        appointmentId: r.appointment_id,
        patientName: r.patient_name,
        fileNo: String(r.file_number),
        procedure: r.type_name,
        assignedDr: 'Dr. ' + (r.doctor_name || ''),
        clinic: r.clinic_name || 'N/A',
        time: r.appointment_start_time
          ? new Date(r.appointment_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
        date: r.appointment_start_time
          ? new Date(r.appointment_start_time).toLocaleDateString()
          : '',
        startTimeRaw: r.appointment_start_time ?? '',
        arrivalStatus: r.arrival_status ?? null,
        arrivedAt: r.arrived_at ?? null,
      }));
    });
  }

  onArrivalChanged(appt: Appointment, state: ArrivalState): void {
    appt.arrivalStatus = state.arrival_status;
    appt.arrivedAt     = state.arrived_at;
  }

  goToPatients(): void    { this.router.navigate(['/receptionist/patients']); }
  goToScheduling(): void  { this.router.navigate(['/receptionist/scheduling']); }
}
