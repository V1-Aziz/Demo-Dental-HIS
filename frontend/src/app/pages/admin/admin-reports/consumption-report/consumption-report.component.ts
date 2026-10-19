import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

interface RangeOption { value: string; label: string; }

interface WeekData {
  weekStart: string;
  weekNumber: number;
  categories: { [category: string]: number };
}

const PRESET_COLORS: Record<string, string> = {
  Consumables: '#378ADD',
  Instruments: '#1D9E75',
  Medications: '#BA7517',
};

const PALETTE = ['#1a365d', '#d69e2e', '#7A4FAF', '#30757D', '#B03A6E', '#6C757D'];

@Component({
  standalone: false,
  selector: 'app-consumption-report',
  templateUrl: './consumption-report.component.html',
})
export class ConsumptionReportComponent implements AfterViewInit {
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

  allCategories: string[] = [];
  selectedCategory: string = '';

  summary = {
    totalWithdrawn: 0,
    topConsumedItem: null as string | null,
    topConsumedQty: 0,
    topCategory: null as string | null,
    topCategoryQty: 0,
  };

  weeklyData: WeekData[] = [];
  dataCategories: string[] = [];

  legend: { name: string; color: string }[] = [];

  exportOpen = false;
  readonly reportKey = 'consumption' as const;

  get exportFilters(): Record<string, unknown> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - Number(this.selectedRange));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      category: this.selectedCategory || null,
    };
  }

  get exportSubtitle(): string {
    const rangeLabel = this.rangeOptions.find(o => o.value === this.selectedRange)?.label ?? '';
    const cat = this.selectedCategory || 'All categories';
    return `${rangeLabel} - ${cat}`;
  }

  private chart: Chart | null = null;

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.loadCategories();
    this.loadData();
  }

  private loadCategories(): void {
    this.reportsService.getInventoryCategories().subscribe({
      next: (res: any) => {
        this.allCategories = res.data || [];
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

    this.reportsService
      .getConsumptionReport(startDate, endDate, this.selectedCategory || null)
      .subscribe({
        next: (res: any) => {
          this.summary = res.data.summary;
          this.weeklyData = res.data.weeklyData;
          this.dataCategories = res.data.categories;
          this.legend = this.dataCategories.map((c) => ({ name: c, color: this.colorFor(c) }));
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

  private colorFor(category: string): string {
    if (PRESET_COLORS[category]) return PRESET_COLORS[category];
    const idx = this.dataCategories.indexOf(category);
    return PALETTE[idx % PALETTE.length];
  }

  private formatWeekLabel(isoDate: string): string {
    const d = new Date(isoDate);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  private updateChart(): void {
    if (this.chart) this.chart.destroy();
    if (!this.barChartRef || this.weeklyData.length === 0 || this.dataCategories.length === 0) return;

    const labels = this.weeklyData.map((w) => this.formatWeekLabel(w.weekStart));

    const datasets = this.dataCategories.map((cat) => ({
      label: cat,
      data: this.weeklyData.map((w) => w.categories[cat] ?? 0),
      backgroundColor: this.colorFor(cat),
      borderRadius: 4,
    }));

    this.chart = new Chart(this.barChartRef.nativeElement, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { stacked: false },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  goBack(): void {
    this.back.emit();
  }
}
