import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

interface SupervisorOption { employeeId: number | null; doctorName: string; }

interface StudentProcedure {
  academicId: number;
  studentName: string;
  academicLevel: number;
  supervisorName: string;
  totalProcedures: number;
  uniqueProcedureTypes: number;
}

interface ProcedureType {
  treatmentType: string;
  count: number;
}

@Component({
  standalone: false,
  selector: 'app-student-procedure-log',
  templateUrl: './student-procedure-log.component.html',
})
export class StudentProcedureLogComponent implements AfterViewInit {
  @Output() back = new EventEmitter<void>();
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  isLoading = true;
  hasError = false;

  supervisorOptions: SupervisorOption[] = [{ employeeId: null, doctorName: 'All Supervisors' }];
  selectedSupervisorId: number | null = null;

  summary = { activeStudents: 0, totalProcedures: 0, avgPerStudent: 0 };
  students: StudentProcedure[] = [];
  procedureTypes: ProcedureType[] = [];

  exportOpen = false;
  readonly reportKey = 'student-procedure-log' as const;

  get exportFilters(): Record<string, unknown> {
    return { supervisorId: this.selectedSupervisorId };
  }

  get exportSubtitle(): string {
    return this.supervisorOptions.find(o => o.employeeId === this.selectedSupervisorId)?.doctorName ?? 'All Supervisors';
  }

  private chart: Chart | null = null;

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.loadSupervisors();
    this.loadData();
  }

  private loadSupervisors(): void {
    this.reportsService.getSupervisors().subscribe({
      next: (res: any) => {
        const supervisors = (res.data || []) as { employeeId: number; doctorName: string }[];
        this.supervisorOptions = [
          { employeeId: null, doctorName: 'All Supervisors' },
          ...supervisors,
        ];
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadData(): void {
    this.isLoading = true;
    this.hasError = false;

    this.reportsService.getStudentProcedureLog(this.selectedSupervisorId).subscribe({
      next: (res: any) => {
        this.summary = res.data.summary;
        this.students = res.data.students;
        this.procedureTypes = res.data.procedureTypes;
        this.isLoading = false;
        this.cdr.detectChanges();
        this.updateChart();
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
      },
    });
  }

  onFilterChange(): void {
    this.loadData();
  }

  private updateChart(): void {
    if (this.chart) this.chart.destroy();
    if (!this.barChartRef || this.procedureTypes.length === 0) return;

    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.procedureTypes.map((t) => t.treatmentType),
        datasets: [{
          label: 'Procedures',
          data: this.procedureTypes.map((t) => t.count),
          backgroundColor: '#1a365d',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  goBack(): void {
    this.back.emit();
  }
}
