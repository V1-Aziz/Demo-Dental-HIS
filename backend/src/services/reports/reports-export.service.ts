import { REPORT_DATA_REGISTRY, ReportKey } from './report-data.registry';
import { resolveSections } from './export-section-rules';
import { pdfExporter } from './exporters/pdf.exporter';
import { excelExporter } from './exporters/excel.exporter';
import { csvExporter } from './exporters/csv.exporter';
import { Exporter, ExporterResult } from './exporters/exporter.types';

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ExportRequestInput {
  reportKey: ReportKey;
  format: ExportFormat;
  sections: string[];
  filters: Record<string, unknown>;
}

const EXPORTERS: Record<ExportFormat, Exporter> = {
  pdf: pdfExporter,
  excel: excelExporter,
  csv: csvExporter,
};

export async function exportReport(
  req: ExportRequestInput,
  generatedBy: string,
): Promise<ExporterResult & { finalSections: string[] }> {
  const fetcher = REPORT_DATA_REGISTRY[req.reportKey];
  if (!fetcher) throw new Error(`Unknown report: ${req.reportKey}`);

  const exporter = EXPORTERS[req.format];
  if (!exporter) throw new Error(`Unknown format: ${req.format}`);

  const finalSections = resolveSections(req.reportKey, req.sections ?? []);
  const dataset = await fetcher(req.filters ?? {}, generatedBy);
  const result = await exporter.generate(dataset, finalSections);

  return { ...result, finalSections };
}
