import { Parser } from 'json2csv';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { Exporter, ExporterResult, ReportDataset, SectionPayload } from './exporter.types';

function metricsToCsv(sections: Array<Extract<SectionPayload, { type: 'metrics' }>>, dataset: ReportDataset): string {
  const lines: string[] = [];
  lines.push('key,value');
  lines.push(`report,${csvEscape(dataset.reportTitle)}`);
  lines.push(`context,${csvEscape(dataset.contextSubtitle)}`);
  lines.push(`generated_at,${csvEscape(dataset.generatedAt.toISOString())}`);
  lines.push(`generated_by,${csvEscape(dataset.generatedBy)}`);
  lines.push('');

  for (const s of sections) {
    lines.push(`# ${s.label}`);
    for (const m of s.metrics) {
      lines.push(`${csvEscape(m.label)},${csvEscape(String(m.value))}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function csvEscape(v: string): string {
  if (v === null || v === undefined) return '';
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function tableToCsv(section: Extract<SectionPayload, { type: 'table' }>): string {
  const fields = section.columns.map((c) => ({ label: c.header, value: c.key }));
  const parser = new Parser({ fields });
  return parser.parse(section.rows);
}

function chartToCsv(section: Extract<SectionPayload, { type: 'chart' }>): string {
  const header = ['label', ...section.data.datasets.map((d) => d.label)];
  const lines: string[] = [header.map(csvEscape).join(',')];
  section.data.labels.forEach((label, idx) => {
    const row = [label, ...section.data.datasets.map((d) => String(d.values[idx] ?? 0))];
    lines.push(row.map(csvEscape).join(','));
  });
  return lines.join('\n');
}

function safeFileName(raw: string): string {
  return raw.replace(/[^a-z0-9-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'section';
}

async function buildZip(files: Array<{ name: string; content: string }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
    archive.on('error', reject);

    archive.pipe(stream);
    for (const file of files) {
      archive.append(file.content, { name: file.name });
    }
    archive.finalize();
  });
}

export const csvExporter: Exporter = {
  format: 'csv',
  async generate(dataset: ReportDataset, requestedSectionKeys: string[]): Promise<ExporterResult> {
    const metricsSections: Array<Extract<SectionPayload, { type: 'metrics' }>> = [];
    const chartSections: Array<{ key: string; payload: Extract<SectionPayload, { type: 'chart' }> }> = [];
    const tableSections: Array<{ key: string; payload: Extract<SectionPayload, { type: 'table' }> }> = [];

    for (const key of requestedSectionKeys) {
      const s = dataset.sections[key];
      if (!s) continue;
      if (s.type === 'metrics') metricsSections.push(s);
      else if (s.type === 'chart') chartSections.push({ key, payload: s });
      else if (s.type === 'table') tableSections.push({ key, payload: s });
    }

    const files: Array<{ name: string; content: string }> = [];
    if (metricsSections.length > 0) {
      files.push({ name: 'summary.csv', content: metricsToCsv(metricsSections, dataset) });
    }
    for (const { key, payload } of chartSections) {
      files.push({ name: `${safeFileName(key)}.csv`, content: chartToCsv(payload) });
    }
    for (const { key, payload } of tableSections) {
      files.push({ name: `${safeFileName(key)}.csv`, content: tableToCsv(payload) });
    }

    if (files.length === 0) {
      return { buffer: Buffer.from('', 'utf8'), mimeType: 'text/csv', extension: 'csv' };
    }

    if (files.length === 1) {
      return {
        buffer: Buffer.from(files[0].content, 'utf8'),
        mimeType: 'text/csv',
        extension: 'csv',
      };
    }

    const buffer = await buildZip(files);
    return { buffer, mimeType: 'application/zip', extension: 'zip' };
  },
};
