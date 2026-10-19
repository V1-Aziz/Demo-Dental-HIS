import { Component } from '@angular/core';

interface ReportCard {
  title: string;
  desc: string;
  dotColor: string;
  route: string | null;
}

interface ReportGroup {
  heading: string;
  icon: string;
  iconColor: string;
  cards: ReportCard[];
}

@Component({
  standalone: false,
  selector: 'app-admin-reports',
  templateUrl: './admin-reports.component.html',
})
export class AdminReportsComponent {
  selectedReport: string | null = null;

  readonly groups: ReportGroup[] = [
    {
      heading: 'Patient Reports', icon: 'person', iconColor: 'text-purple-500',
      cards: [
        { title: 'New Patient Registrations', desc: 'Tracks the number of new patients over a period.', dotColor: 'bg-purple-500', route: 'new-patient-registrations' },
        { title: 'Patient Demographics',      desc: 'Breakdown of patients by age, gender, or other factors.', dotColor: 'bg-purple-500', route: 'patient-demographics' },
      ],
    },
    {
      heading: 'Appointment Reports', icon: 'calendar_month', iconColor: 'text-blue-500',
      cards: [
        { title: 'Attendance & No-Show Rate', desc: 'Analysis of attended vs. missed appointments.', dotColor: 'bg-blue-500', route: 'attendance-no-show' },
        { title: 'Clinic Occupancy',          desc: 'Percentage of time slots filled for each doctor/clinic.', dotColor: 'bg-blue-500', route: 'clinic-occupancy' },
      ],
    },
    {
      heading: 'Inventory Reports', icon: 'inventory_2', iconColor: 'text-yellow-500',
      cards: [
        { title: 'Low Stock Items',    desc: 'List of all items that have reached reorder level.', dotColor: 'bg-yellow-500', route: 'low-stock-items' },
        { title: 'Consumption Report', desc: 'Tracks the usage of materials over a period.',       dotColor: 'bg-yellow-500', route: 'consumption-report' },
      ],
    },
    {
      heading: 'Student Performance', icon: 'school', iconColor: 'text-teal-500',
      cards: [
        { title: 'Student Procedure Log',         desc: 'Tracks the number and type of procedures per student.', dotColor: 'bg-teal-500', route: 'student-procedure-log' },
        { title: 'Supervisor Evaluation Summary', desc: 'Average ratings given to students by supervisors.',     dotColor: 'bg-teal-500', route: 'supervisor-evaluation' },
      ],
    },
  ];

  openReport(card: ReportCard): void {
    if (card.route) {
      this.selectedReport = card.route;
    }
  }

  onBack(): void {
    this.selectedReport = null;
  }
}
