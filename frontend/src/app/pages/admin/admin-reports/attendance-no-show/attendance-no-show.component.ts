import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

interface RangeOption { value: string; label: string; }
interface ClinicOption { clinicId: number | null; clinicName: string; }

const COLOR_COMPLETED = '#1D9E75';
const COLOR_NO_SHOW = '#E24B4A';
const COLOR_CANCELED = '#BA7517';

@Component({
  standalone: false,
  selector: 'app-attendance-no-show',
  templateUrl: './attendance-no-show.component.html',
})
export class AttendanceNoShowComponent implements AfterViewInit {
  @Output() back = new EventEmitter<void>();
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  isLoading = true;
  hasError = false;

  readonly rangeOptions: RangeOption[] = [
    { value: '30',  label: 'Last 30 days' },
    { value: '90',  label: 'Last 90 days' },
    { value: '180', label: 'Last 6 months' },
    { value: '365', label: 'Last year' },
  ];
  selectedRange = '30';

  clinicOptions: ClinicOption[] = [{ clinicId: null, clinicName: 'All Clinics' }];
  selectedClinicId: number | null = null;

  readonly colors = {
    completed: COLOR_COMPLETED,
    noShow: COLOR_NO_SHOW,
    canceled: COLOR_CANCELED,
  };

  summary = {
    totalAppointments: 0,
    completedCount: 0,
    completedPct: 0,
    noShowCount: 0,
    noShowPct: 0,
    canceledCount: 0,
    canceledPct: 0,
  };

  weeklyData: { weekStart: string; weekNumber: number; completed: number; noShow: number; canceled: number; scheduled: number }[] = [];

  exportOpen = false;
  readonly reportKey = 'attendance-no-show' as const;

  get exportFilters(): Record<string, unknown> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Number(this.selectedRange));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      clinicId: this.selectedClinicId,
    };
  }

  get exportSubtitle(): string {
    const rangeLabel = this.rangeOptions.find(o => o.value === this.selectedRange)?.label ?? '';
    const clinic = this.clinicOptions.find(c => c.clinicId === this.selectedClinicId)?.clinicName ?? 'All Clinics';
    return `${rangeLabel} - ${clinic}`;
  }

  private chart: Chart | null = null;

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.loadClinics();
    this.loadData();
  }

  private loadClinics(): void {
    this.reportsService.getClinics().subscribe({
      next: (res: any) => {
        const clinics = (res.data || []) as { clinicId: number; clinicName: string }[];
        this.clinicOptions = [
          { clinicId: null, clinicName: 'All Clinics' },
          ...clinics,
        ];
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadData(): void {
    this.isLoading = true;
    this.hasError = false;

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Number(this.selectedRange));

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    this.reportsService.getAttendanceStats(startDate, endDate, this.selectedClinicId).subscribe({
      next: (res: any) => {
        this.summary = res.data.summary;
        this.weeklyData = res.data.weeklyData;
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

  private formatWeekLabel(isoDate: string): string {
    const d = new Date(isoDate);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  private updateChart(): void {
    if (this.chart) this.chart.destroy();
    if (!this.barChartRef || this.weeklyData.length === 0) return;

    const labels = this.weeklyData.map((d) => this.formatWeekLabel(d.weekStart));

    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Completed',
            data: this.weeklyData.map((d) => d.completed),
            backgroundColor: COLOR_COMPLETED,
            stack: 'attendance',
            borderRadius: 4,
          },
          {
            label: 'No-show',
            data: this.weeklyData.map((d) => d.noShow),
            backgroundColor: COLOR_NO_SHOW,
            stack: 'attendance',
            borderRadius: 4,
          },
          {
            label: 'Canceled',
            data: this.weeklyData.map((d) => d.canceled),
            backgroundColor: COLOR_CANCELED,
            stack: 'attendance',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  goBack(): void {
    this.back.emit();
  }
}
