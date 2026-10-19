import { Component, OnInit } from '@angular/core';
import { AppointmentService } from '../../../services/appointment.service';

interface Appointment {
  patientName: string;
  fileNo: string;
  procedure: string;
  time: string;
  date: string;
}

@Component({
  standalone: false,
  selector: 'app-assistant-dashboard',
  templateUrl: './assistant-dashboard.component.html',
})
export class AssistantDashboardComponent implements OnInit {
  appointments: Appointment[] = [];

  constructor(private appointmentService: AppointmentService) {}

  ngOnInit(): void {
    this.appointmentService.getTodayAppointments().subscribe((res: any) => {
      this.appointments = (res.data?.rows ?? res.data ?? []).map((r: any) => ({
        patientName: r.patient_name,
        fileNo: String(r.file_number),
        procedure: r.type_name,
        time: r.appointment_start_time
          ? new Date(r.appointment_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
        date: r.appointment_start_time
          ? new Date(r.appointment_start_time).toLocaleDateString()
          : '',
      }));
    });
  }
}
