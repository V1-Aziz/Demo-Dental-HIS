import * as invRepo from '../../../repositories/reports/inventory-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';

export async function fetchLowStockItems(
  filters: { category?: string | null },
  generatedBy: string,
): Promise<ReportDataset> {
  const category = filters.category ?? null;

  const [summaryRow, items, byCategory] = await Promise.all([
    invRepo.getLowStockSummary(category),
    invRepo.getLowStockItems(category),
    extrasRepo.getLowStockCountByCategory(),
  ]);

  const affectedCategories = new Set(items.map((i) => i.category)).size;

  return {
    reportTitle: 'Low Stock Items',
    contextSubtitle: category
      ? `Category: ${category}`
      : 'All categories',
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total Low-Stock Items', value: (summaryRow.critical_count ?? 0) + (summaryRow.low_count ?? 0) },
          { label: 'Critical Items', value: summaryRow.critical_count ?? 0 },
          { label: 'Categories Affected', value: affectedCategories },
        ],
      },
      'category-chart': {
        type: 'chart',
        label: 'Low Stock by Category',
        chartType: 'bar',
        data: {
          labels: byCategory.map((r) => r.category),
          datasets: [{ label: 'Items', values: byCategory.map((r) => r.total) }],
        },
      },
      table: {
        type: 'table',
        label: 'Low Stock Items List',
        columns: [
          { key: 'item_name', header: 'Item', width: 28 },
          { key: 'category', header: 'Category', width: 18 },
          { key: 'quantity_on_hand', header: 'Qty on Hand', width: 14 },
          { key: 'low_stock_limit', header: 'Reorder Level', width: 16 },
          { key: 'severity', header: 'Status', width: 12 },
        ],
        rows: items.map((i) => ({
          item_name: i.item_name,
          category: i.category,
          quantity_on_hand: i.quantity_on_hand,
          low_stock_limit: i.low_stock_limit,
          severity: i.severity,
        })),
      },
    },
  };
}
