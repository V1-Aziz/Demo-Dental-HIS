import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

interface RangeOption { value: string; label: string; }

@Component({
  standalone: false,
  selector: 'app-new-patient-registrations',
  templateUrl: './new-patient-registrations.component.html',
})
export class NewPatientRegistrationsComponent implements AfterViewInit {
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
  selectedRange = '90';

  summary = { totalNewPatients: 0, avgPerWeek: 0, peakDay: null as string | null, peakDayCount: null as number | null, percentChange: 0 };
  weeklyData: { weekLabel: string; count: number }[] = [];

  exportOpen = false;
  readonly reportKey = 'new-patient-registrations' as const;

  get exportFilters(): Record<string, unknown> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Number(this.selectedRange));
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  get exportSubtitle(): string {
    const label = this.rangeOptions.find(o => o.value === this.selectedRange)?.label ?? '';
    return label;
  }

  private chart: Chart | null = null;

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.loadData();
  }

  get changeClass(): string {
    if (this.summary.percentChange > 0) return 'text-green-600';
    if (this.summary.percentChange < 0) return 'text-red-600';
    return 'text-gray-500';
  }

  get changeArrow(): string {
    if (this.summary.percentChange > 0) return '\u25B2';
    if (this.summary.percentChange < 0) return '\u25BC';
    return '';
  }

  get formattedPeakDay(): string {
    if (!this.summary.peakDay) return '\u2014';
    const d = new Date(this.summary.peakDay);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  loadData(): void {
    this.isLoading = true;
    this.hasError = false;

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Number(this.selectedRange));

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    this.reportsService.getNewRegistrations(startDate, endDate).subscribe({
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

  private updateChart(): void {
    if (this.chart) this.chart.destroy();
    if (!this.barChartRef || this.weeklyData.length === 0) return;

    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels: this.weeklyData.map(d => d.weekLabel),
        datasets: [{
          label: 'Registrations',
          data: this.weeklyData.map(d => d.count),
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
