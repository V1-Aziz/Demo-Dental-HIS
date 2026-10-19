import PDFDocument from 'pdfkit';
import { Exporter, ExporterResult, ReportDataset, SectionPayload, ColumnDef } from './exporter.types';

const NAVY = '#1a365d';
const GOLD = '#d69e2e';
const GREY_LINE = '#E5E7EB';
const GREY_TEXT = '#6B7280';
const ROW_ALT = '#F8FAFC';

const PAGE_MARGIN = 48;
const CARD_GAP = 12;

function collectToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderHeader(doc: PDFKit.PDFDocument, dataset: ReportDataset): void {
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(dataset.reportTitle, { align: 'left' });

  doc
    .moveDown(0.2)
    .font('Helvetica')
    .fontSize(10)
    .fillColor(GREY_TEXT)
    .text(dataset.contextSubtitle || 'Operational report', { align: 'left' });

  doc
    .moveDown(0.2)
    .fontSize(9)
    .fillColor(GREY_TEXT)
    .text(`Generated ${formatDateTime(dataset.generatedAt)} by ${dataset.generatedBy}`, {
      align: 'left',
    });

  const y = doc.y + 8;
  doc.strokeColor(GOLD).lineWidth(1).moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).stroke();
  doc.moveDown(1);
}

function renderSectionTitle(doc: PDFKit.PDFDocument, label: string): void {
  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(NAVY)
    .text(label, { align: 'left' });
  doc.moveDown(0.4);
}

function renderMetrics(doc: PDFKit.PDFDocument, payload: Extract<SectionPayload, { type: 'metrics' }>): void {
  renderSectionTitle(doc, payload.label);

  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const columnCount = Math.min(3, payload.metrics.length || 1);
  const cardWidth = (pageWidth - CARD_GAP * (columnCount - 1)) / columnCount;
  const cardHeight = 52;

  const startX = PAGE_MARGIN;
  let rowY = doc.y;

  payload.metrics.forEach((metric, idx) => {
    const col = idx % columnCount;
    if (col === 0 && idx !== 0) {
      rowY += cardHeight + CARD_GAP;
    }
    const x = startX + col * (cardWidth + CARD_GAP);

    doc
      .roundedRect(x, rowY, cardWidth, cardHeight, 6)
      .fillAndStroke('#F8FAFC', GREY_LINE);

    doc
      .fillColor(GREY_TEXT)
      .font('Helvetica')
      .fontSize(8)
      .text(metric.label.toUpperCase(), x + 10, rowY + 8, { width: cardWidth - 20 });

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(String(metric.value), x + 10, rowY + 24, { width: cardWidth - 20 });
  });

  doc.y = rowY + cardHeight + CARD_GAP;
  doc.x = PAGE_MARGIN;
}

function chartToColumns(payload: Extract<SectionPayload, { type: 'chart' }>): {
  columns: ColumnDef[];
  rows: Array<Record<string, unknown>>;
} {
  const columns: ColumnDef[] = [{ key: 'label', header: 'Label', width: 30 }];
  payload.data.datasets.forEach((ds, i) => {
    columns.push({ key: `d${i}`, header: ds.label, width: 20 });
  });

  const rows = payload.data.labels.map((label, idx) => {
    const row: Record<string, unknown> = { label };
    payload.data.datasets.forEach((ds, i) => {
      row[`d${i}`] = ds.values[idx] ?? 0;
    });
    return row;
  });

  return { columns, rows };
}

function renderChart(doc: PDFKit.PDFDocument, payload: Extract<SectionPayload, { type: 'chart' }>): void {
  renderSectionTitle(doc, payload.label);

  doc
    .font('Helvetica-Oblique')
    .fontSize(8)
    .fillColor(GREY_TEXT)
    .text('[Chart shown as data table. See Excel export for spreadsheet-ready version.]', {
      align: 'left',
    });
  doc.moveDown(0.3);

  const { columns, rows } = chartToColumns(payload);
  renderTable(doc, { type: 'table', label: '', columns, rows }, false);
}

function renderTable(
  doc: PDFKit.PDFDocument,
  payload: Extract<SectionPayload, { type: 'table' }>,
  withTitle = true,
): void {
  if (withTitle) renderSectionTitle(doc, payload.label);

  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const totalWeight = payload.columns.reduce((sum, c) => sum + (c.width ?? 16), 0);
  const colWidths = payload.columns.map((c) => ((c.width ?? 16) / totalWeight) * pageWidth);

  const rowHeight = 18;
  let y = doc.y;

  const renderHeaderRow = (yPos: number) => {
    doc
      .rect(PAGE_MARGIN, yPos, pageWidth, rowHeight)
      .fill(NAVY);
    let x = PAGE_MARGIN;
    payload.columns.forEach((col, i) => {
      doc
        .fillColor('white')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(col.header, x + 6, yPos + 5, { width: colWidths[i] - 12, ellipsis: true });
      x += colWidths[i];
    });
    doc.fillColor('#000');
    return yPos + rowHeight;
  };

  y = renderHeaderRow(y);

  if (payload.rows.length === 0) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(GREY_TEXT)
      .text('No data.', PAGE_MARGIN, y + 4);
    doc.y = y + rowHeight;
    return;
  }

  payload.rows.forEach((row, idx) => {
    if (y + rowHeight > doc.page.height - PAGE_MARGIN - 20) {
      doc.addPage();
      y = PAGE_MARGIN;
      y = renderHeaderRow(y);
    }

    if (idx % 2 === 0) {
      doc.rect(PAGE_MARGIN, y, pageWidth, rowHeight).fill(ROW_ALT);
    }

    let x = PAGE_MARGIN;
    payload.columns.forEach((col, i) => {
      const val = row[col.key];
      const display = val === null || val === undefined ? '' : String(val);
      doc
        .fillColor('#111827')
        .font('Helvetica')
        .fontSize(9)
        .text(display, x + 6, y + 5, { width: colWidths[i] - 12, ellipsis: true });
      x += colWidths[i];
    });

    y += rowHeight;
  });

  doc.y = y + 4;
  doc.x = PAGE_MARGIN;
}

function renderFooter(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const footerY = doc.page.height - PAGE_MARGIN + 12;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GREY_TEXT)
      .text(
        `Page ${i + 1} of ${range.count}  -  Dental HIS, College of Dentistry, Najran University`,
        PAGE_MARGIN,
        footerY,
        { align: 'center', width: doc.page.width - PAGE_MARGIN * 2 },
      );
  }
}

export const pdfExporter: Exporter = {
  format: 'pdf',
  async generate(dataset: ReportDataset, requestedSectionKeys: string[]): Promise<ExporterResult> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: { Title: dataset.reportTitle, Author: dataset.generatedBy },
    });
    const bufferPromise = collectToBuffer(doc);

    renderHeader(doc, dataset);

    for (const key of requestedSectionKeys) {
      const section = dataset.sections[key];
      if (!section) continue;

      if (section.type === 'metrics') renderMetrics(doc, section);
      else if (section.type === 'chart') renderChart(doc, section);
      else if (section.type === 'table') renderTable(doc, section);
    }

    renderFooter(doc);
    doc.end();

    const buffer = await bufferPromise;
    return { buffer, mimeType: 'application/pdf', extension: 'pdf' };
  },
};
