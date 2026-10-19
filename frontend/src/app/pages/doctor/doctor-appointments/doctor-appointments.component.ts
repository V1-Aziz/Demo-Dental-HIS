import { Component, OnInit } from '@angular/core';
import { AppointmentService } from '../../../services/appointment.service';

type AppointmentDay = 'today' | 'upcoming';
type AppointmentStatus = 'Scheduled' | 'Completed' | 'Canceled' | 'No Show';

interface Appointment {
  id: number;
  day: AppointmentDay;
  time: string;
  patient: string;
  fileNo: string;
  reason: string;
  status: AppointmentStatus;
}

@Component({
  standalone: false,
  selector: 'app-doctor-appointments',
  templateUrl: './doctor-appointments.component.html',
})
export class DoctorAppointmentsComponent implements OnInit {
  activeTab: AppointmentDay = 'today';
  appointments: Appointment[] = [];

  constructor(private appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.loadAppointments();
  }

  setTab(tab: AppointmentDay): void {
    this.activeTab = tab;
    this.loadAppointments();
  }

  loadAppointments(): void {
    const todayStr = new Date().toISOString().slice(0, 10);
    const params: { date?: string; dateFrom?: string; dateTo?: string } = {};

    if (this.activeTab === 'today') {
      params.date = todayStr;
    } else {
      const from = new Date();
      from.setDate(from.getDate() + 1);
      const to = new Date();
      to.setDate(to.getDate() + 7);
      params.dateFrom = from.toISOString().slice(0, 10);
      params.dateTo   = to.toISOString().slice(0, 10);
    }

    this.appointmentService.getAppointments(params).subscribe({
      next: (res: any) => {
        this.appointments = (res.data?.rows ?? []).map((r: any) => {
          const startDate = r.appointment_start_time ? new Date(r.appointment_start_time) : null;
          return {
            id:      r.appointment_id,
            day:     this.activeTab,
            time:    startDate ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
            patient: r.patient_name ?? '—',
            fileNo:  String(r.file_number ?? ''),
            reason:  r.type_name ?? '—',
            status:  (r.status ?? 'Scheduled') as AppointmentStatus,
          };
        });
      },
      error: () => { this.appointments = []; },
    });
  }

  get filtered(): Appointment[] {
    return this.appointments;
  }

  get scheduleTitle(): string {
    if (this.activeTab === 'today') {
      return `Today's Schedule (${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`;
    }
    return "Upcoming Week's Schedule";
  }

  updateStatus(id: number, status: AppointmentStatus): void {
    this.appointmentService.updateStatus(id, status).subscribe({
      next: () => this.loadAppointments(),
    });
  }

  statusClass(status: AppointmentStatus): string {
    const map: Record<AppointmentStatus, string> = {
      'Scheduled': 'bg-gray-100 text-gray-800',
      'Completed': 'bg-green-100 text-green-800',
      'Canceled':  'bg-red-100 text-red-800',
      'No Show':   'bg-yellow-100 text-yellow-800',
    };
    return map[status] ?? 'bg-gray-100 text-gray-800';
  }
}
