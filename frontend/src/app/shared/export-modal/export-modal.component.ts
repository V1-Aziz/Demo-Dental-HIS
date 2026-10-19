import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ExportFormat,
  REPORT_EXPORT_CONFIGS,
  ReportExportConfig,
  ReportKey,
  ReportSection,
} from './report-exports.config';
import { ReportsExportService } from '../../services/reports-export.service';

interface FormatOption {
  value: ExportFormat;
  label: string;
  description: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'app-export-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './export-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportModalComponent implements OnChanges {
  @Input() open = false;
  @Input() reportKey!: ReportKey;
  @Input() contextSubtitle = '';
  @Input() filters: Record<string, unknown> = {};

  @Output() closed = new EventEmitter<void>();

  readonly formatOptions: FormatOption[] = [
    { value: 'pdf',   label: 'PDF',   description: 'Formatted document',   icon: 'picture_as_pdf' },
    { value: 'excel', label: 'Excel', description: 'Spreadsheet workbook', icon: 'table_chart' },
    { value: 'csv',   label: 'CSV',   description: 'Raw comma-separated',  icon: 'description' },
  ];

  selectedFormat: ExportFormat = 'pdf';
  selectedSections: Record<string, boolean> = {};
  isExporting = false;
  errorMessage = '';

  constructor(private exportService: ReportsExportService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['reportKey'] || changes['open']) && this.open && this.reportKey) {
      this.resetSections();
      this.errorMessage = '';
    }
  }

  get config(): ReportExportConfig | null {
    if (!this.reportKey) return null;
    return REPORT_EXPORT_CONFIGS[this.reportKey] ?? null;
  }

  get sections(): ReportSection[] {
    return this.config?.sections ?? [];
  }

  get exportLabel(): string {
    const fmt = this.formatOptions.find((f) => f.value === this.selectedFormat);
    return `Export ${fmt?.label ?? ''}`;
  }

  get hasSelectableSections(): boolean {
    return this.sections.some((s) => !s.required && this.selectedSections[s.key]);
  }

  private resetSections(): void {
    const next: Record<string, boolean> = {};
    for (const s of this.sections) {
      next[s.key] = s.required ? true : s.defaultChecked;
    }
    this.selectedSections = next;
  }

  selectFormat(format: ExportFormat): void {
    this.selectedFormat = format;
  }

  toggleSection(key: string): void {
    const section = this.sections.find((s) => s.key === key);
    if (section?.required) return;
    this.selectedSections = { ...this.selectedSections, [key]: !this.selectedSections[key] };
  }

  onBackdropClick(): void {
    if (!this.isExporting) this.closeModal();
  }

  closeModal(): void {
    this.closed.emit();
  }

  async onExport(): Promise<void> {
    if (!this.reportKey || !this.config) return;

    const selectedKeys = this.sections
      .filter((s) => s.required || this.selectedSections[s.key])
      .map((s) => s.key);

    this.isExporting = true;
    this.errorMessage = '';

    try {
      const blob = await this.exportService.export({
        reportKey: this.reportKey,
        format: this.selectedFormat,
        sections: selectedKeys,
        filters: this.filters,
      });

      const filename = this.buildFilename(blob);
      this.downloadBlob(blob, filename);
      this.closeModal();
    } catch {
      this.errorMessage = 'Export failed. Please try again.';
    } finally {
      this.isExporting = false;
    }
  }

  private buildFilename(blob: Blob): string {
    const date = new Date().toISOString().slice(0, 10);
    const safe = this.reportKey.replace(/[^a-z0-9-]/gi, '-');
    let ext: string;
    if (blob.type === 'application/zip') ext = 'zip';
    else if (this.selectedFormat === 'excel') ext = 'xlsx';
    else ext = this.selectedFormat;
    return `${safe}-${date}.${ext}`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
