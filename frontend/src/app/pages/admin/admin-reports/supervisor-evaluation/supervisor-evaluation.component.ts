import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

interface SupervisorOption { employeeId: number | null; doctorName: string; }

interface StudentEvaluation {
  academicId: number;
  studentName: string;
  academicLevel: number;
  supervisorName: string;
  totalTreatments: number;
  cleanApprovals: number;
  neededFeedback: number;
  cleanApprovalRate: number;
}

const COLOR_HIGH = '#1D9E75';
const COLOR_MID = '#378ADD';
const COLOR_LOW = '#BA7517';

const MAX_VISIBLE = 15;

@Component({
  standalone: false,
  selector: 'app-supervisor-evaluation',
  templateUrl: './supervisor-evaluation.component.html',
})
export class SupervisorEvaluationComponent implements AfterViewInit {
  @Output() back = new EventEmitter<void>();
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  isLoading = true;
  hasError = false;

  supervisorOptions: SupervisorOption[] = [{ employeeId: null, doctorName: 'All Supervisors' }];
  selectedSupervisorId: number | null = null;

  summary = {
    studentsEvaluated: 0,
    avgCleanRate: 0,
    topPerformer: null as { name: string; rate: number } | null,
  };
  students: StudentEvaluation[] = [];
  cappedNotice = false;

  exportOpen = false;
  readonly reportKey = 'supervisor-evaluation' as const;

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

  get chartHeight(): number {
    const visible = Math.min(this.students.length, MAX_VISIBLE);
    return Math.max(220, visible * 40 + 80);
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

    this.reportsService.getSupervisorEvaluationSummary(this.selectedSupervisorId).subscribe({
      next: (res: any) => {
        this.summary = res.data.summary;
        this.students = res.data.students;
        this.cappedNotice = this.students.length > MAX_VISIBLE;
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

  private colorFor(rate: number): string {
    if (rate >= 80) return COLOR_HIGH;
    if (rate >= 60) return COLOR_MID;
    return COLOR_LOW;
  }

  private updateChart(): void {
    if (this.chart) this.chart.destroy();
    if (!this.barChartRef || this.students.length === 0) return;

    const visible = this.students.slice(0, MAX_VISIBLE);
    const sorted = [...visible].sort((a, b) => a.cleanApprovalRate - b.cleanApprovalRate);
    const labels = sorted.map((s) => s.studentName);
    const values = sorted.map((s) => s.cleanApprovalRate);
    const bgColors = sorted.map((s) => this.colorFor(s.cleanApprovalRate));

    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Clean approval %',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.x}%`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (v) => `${v}%` },
          },
          y: { ticks: { autoSkip: false } },
        },
      },
    });
  }

  goBack(): void {
    this.back.emit();
  }
}
