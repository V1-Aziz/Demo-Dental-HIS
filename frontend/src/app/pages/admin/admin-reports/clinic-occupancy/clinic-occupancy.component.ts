import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

interface PeriodOption { value: string; label: string; }

interface ClinicOccupancy {
  clinicId: number;
  clinicName: string;
  bookedSlots: number;
  totalSlots: number;
  occupancyPct: number;
  busiestDoctor: string | null;
}

const COLOR_HIGH = '#1D9E75';
const COLOR_MID = '#378ADD';
const COLOR_LOW = '#E24B4A';

@Component({
  standalone: false,
  selector: 'app-clinic-occupancy',
  templateUrl: './clinic-occupancy.component.html',
})
export class ClinicOccupancyComponent implements AfterViewInit {
  @Output() back = new EventEmitter<void>();
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  isLoading = true;
  hasError = false;

  readonly periodOptions: PeriodOption[] = [
    { value: 'this-week',    label: 'This week' },
    { value: 'last-week',    label: 'Last week' },
    { value: 'last-30-days', label: 'Last 30 days' },
  ];
  selectedPeriod = 'last-30-days';

  overallOccupancy = 0;
  mostUtilized: { name: string; pct: number } | null = null;
  leastUtilized: { name: string; pct: number } | null = null;
  clinics: ClinicOccupancy[] = [];

  get chartHeight(): number {
    return Math.max(220, this.clinics.length * 42);
  }

  exportOpen = false;
  readonly reportKey = 'clinic-occupancy' as const;

  get exportFilters(): Record<string, unknown> {
    const { startDate, endDate } = this.getDateRange();
    return { startDate, endDate };
  }

  get exportSubtitle(): string {
    return this.periodOptions.find(o => o.value === this.selectedPeriod)?.label ?? '';
  }

  private chart: Chart | null = null;

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.loadData();
  }

  private getDateRange(): { startDate: string; endDate: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date;

    if (this.selectedPeriod === 'this-week') {
      const dow = today.getDay();
      const daysSinceSunday = dow;
      start = new Date(today);
      start.setDate(start.getDate() - daysSinceSunday);
      end = new Date(today);
    } else if (this.selectedPeriod === 'last-week') {
      const dow = today.getDay();
      const daysSinceSunday = dow;
      end = new Date(today);
      end.setDate(end.getDate() - daysSinceSunday - 1);
      start = new Date(end);
      start.setDate(start.getDate() - 6);
    } else {
      end = new Date(today);
      start = new Date(today);
      start.setDate(start.getDate() - 30);
    }

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  loadData(): void {
    this.isLoading = true;
    this.hasError = false;

    const { startDate, endDate } = this.getDateRange();

    this.reportsService.getClinicOccupancy(startDate, endDate).subscribe({
      next: (res: any) => {
        const data = res.data;
        this.overallOccupancy = data.overallOccupancy;
        this.mostUtilized = data.mostUtilized;
        this.leastUtilized = data.leastUtilized;
        this.clinics = data.clinics;
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

  onPeriodChange(): void {
    this.loadData();
  }

  private colorFor(pct: number): string {
    if (pct > 80) return COLOR_HIGH;
    if (pct >= 60) return COLOR_MID;
    return COLOR_LOW;
  }

  private updateChart(): void {
    if (this.chart) this.chart.destroy();
    if (!this.barChartRef || this.clinics.length === 0) return;

    const sorted = [...this.clinics].sort((a, b) => a.occupancyPct - b.occupancyPct);
    const labels = sorted.map((c) => c.clinicName);
    const values = sorted.map((c) => c.occupancyPct);
    const bgColors = sorted.map((c) => this.colorFor(c.occupancyPct));

    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Occupancy %',
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
            ticks: {
              callback: (value) => `${value}%`,
            },
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
