export interface ColumnDef {
  key: string;
  header: string;
  width?: number;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{ label: string; values: number[] }>;
}

export type SectionPayload =
  | { type: 'metrics'; label: string; metrics: Array<{ label: string; value: string | number }> }
  | { type: 'chart'; label: string; chartType: 'bar' | 'line' | 'pie'; data: ChartData }
  | { type: 'table'; label: string; columns: ColumnDef[]; rows: Array<Record<string, unknown>> };

export interface ReportDataset {
  reportTitle: string;
  contextSubtitle: string;
  generatedAt: Date;
  generatedBy: string;
  sections: Record<string, SectionPayload>;
}

export interface ExporterResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export interface Exporter {
  format: 'pdf' | 'excel' | 'csv';
  generate(dataset: ReportDataset, requestedSectionKeys: string[]): Promise<ExporterResult>;
}
