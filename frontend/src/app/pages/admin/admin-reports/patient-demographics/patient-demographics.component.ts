import { Component, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ReportsService } from '../../../../services/reports.service';

Chart.register(...registerables);

@Component({
  standalone: false,
  selector: 'app-patient-demographics',
  templateUrl: './patient-demographics.component.html',
})
export class PatientDemographicsComponent implements AfterViewInit {
  @Output() back = new EventEmitter<void>();
  @ViewChild('ageChart') ageChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('genderChart') genderChartRef!: ElementRef<HTMLCanvasElement>;

  isLoading = true;
  hasError = false;

  totalPatients = 0;
  maleCount = 0;
  femaleCount = 0;
  malePercent = 0;
  femalePercent = 0;
  largestAgeGroup = '\u2014';

  ageLabels: string[] = [];
  ageCounts: number[] = [];
  genderLabels: string[] = [];
  genderCounts: number[] = [];

  exportOpen = false;
  readonly reportKey = 'patient-demographics' as const;
  readonly exportFilters: Record<string, unknown> = {};
  readonly exportSubtitle = 'Full patient registry';

  private ageChart: Chart | null = null;
  private genderChart: Chart | null = null;

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.reportsService.getDemographics().subscribe({
      next: (res: any) => {
        const d = res.data;
        this.totalPatients = d.totalPatients;

        // Gender
        this.maleCount = d.genderSplit.find((g: any) => g.gender === 'Male')?.count || 0;
        this.femaleCount = d.genderSplit.find((g: any) => g.gender === 'Female')?.count || 0;
        const total = this.maleCount + this.femaleCount || 1;
        this.malePercent = Math.round((this.maleCount / total) * 100);
        this.femalePercent = 100 - this.malePercent;
        this.genderLabels = d.genderSplit.map((g: any) => g.gender);
        this.genderCounts = d.genderSplit.map((g: any) => g.count);

        // Age
        this.ageLabels = d.ageDistribution.map((a: any) => a.ageGroup);
        this.ageCounts = d.ageDistribution.map((a: any) => a.count);
        if (d.ageDistribution.length > 0) {
          const max = d.ageDistribution.reduce((a: any, b: any) => a.count > b.count ? a : b);
          this.largestAgeGroup = max.ageGroup;
        }

        this.isLoading = false;
        this.cdr.detectChanges();
        this.renderCharts();
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
      },
    });
  }

  private renderCharts(): void {
    // Age bar chart
    if (this.ageChartRef && this.ageLabels.length > 0) {
      if (this.ageChart) this.ageChart.destroy();
      this.ageChart = new Chart(this.ageChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: this.ageLabels,
          datasets: [{
            label: 'Patients',
            data: this.ageCounts,
            backgroundColor: '#378ADD',
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    }

    // Gender doughnut
    if (this.genderChartRef && this.genderLabels.length > 0) {
      if (this.genderChart) this.genderChart.destroy();
      this.genderChart = new Chart(this.genderChartRef.nativeElement, {
        type: 'doughnut',
        data: {
          labels: this.genderLabels,
          datasets: [{
            data: this.genderCounts,
            backgroundColor: ['#1a365d', '#d4a017'],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: { position: 'bottom' },
          },
        },
      });
    }
  }

  goBack(): void {
    this.back.emit();
  }
}
