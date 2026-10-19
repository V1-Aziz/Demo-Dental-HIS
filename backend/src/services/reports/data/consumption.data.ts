import * as invRepo from '../../../repositories/reports/inventory-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';
import { formatDateRange } from '../../../utils/date.util';

function weekLabel(weekStart: Date): string {
  const d = new Date(weekStart);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function fetchConsumption(
  filters: { startDate?: string; endDate?: string; category?: string | null },
  generatedBy: string,
): Promise<ReportDataset> {
  const endDate = filters.endDate ?? new Date().toISOString().slice(0, 10);
  const startDate = filters.startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const category = filters.category ?? null;

  const [weeklyRows, total, topItem, transactions] = await Promise.all([
    invRepo.getConsumptionWeekly(startDate, endDate, category),
    invRepo.getConsumptionTotal(startDate, endDate, category),
    invRepo.getTopConsumedItem(startDate, endDate, category),
    extrasRepo.getConsumptionTransactions(startDate, endDate, category),
  ]);

  const dayCount = Math.max(
    1,
    Math.round((new Date(endDate + 'T00:00:00').getTime() - new Date(startDate + 'T00:00:00').getTime()) / 86_400_000) + 1,
  );
  const avgDaily = +((total ?? 0) / dayCount).toFixed(1);

  const weekBuckets = new Map<string, { label: string; byCategory: Record<string, number> }>();
  const categorySet = new Set<string>();
  for (const row of weeklyRows) {
    const key = `${row.year}-${row.week_number}`;
    if (!weekBuckets.has(key)) {
      weekBuckets.set(key, {
        label: weekLabel(row.week_start),
        byCategory: {},
      });
    }
    const bucket = weekBuckets.get(key)!;
    bucket.byCategory[row.category] = (bucket.byCategory[row.category] ?? 0) + (row.total_withdrawn ?? 0);
    categorySet.add(row.category);
  }
  const sortedWeeks = Array.from(weekBuckets.values());
  const categoriesList = Array.from(categorySet).sort();

  const trendLabels = sortedWeeks.map((w) => w.label);
  const totalPerWeek = sortedWeeks.map((w) =>
    Object.values(w.byCategory).reduce((a, b) => a + b, 0),
  );

  const categoryTotals = new Map<string, number>();
  for (const row of weeklyRows) {
    categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) + (row.total_withdrawn ?? 0));
  }

  return {
    reportTitle: 'Consumption Report',
    contextSubtitle: formatDateRange(startDate, endDate),
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total Consumed', value: total ?? 0 },
          { label: 'Top Item', value: topItem ? `${topItem.item_name} (${topItem.total_qty})` : '-' },
          { label: 'Avg Daily Consumption', value: avgDaily },
        ],
      },
      'trend-chart': {
        type: 'chart',
        label: 'Weekly Consumption Trend',
        chartType: 'bar',
        data: {
          labels: trendLabels,
          datasets: [
            { label: 'Total Withdrawn', values: totalPerWeek },
            ...categoriesList.map((cat) => ({
              label: cat,
              values: sortedWeeks.map((w) => w.byCategory[cat] ?? 0),
            })),
          ],
        },
      },
      'category-chart': {
        type: 'chart',
        label: 'Consumption by Category',
        chartType: 'bar',
        data: {
          labels: categoriesList,
          datasets: [{ label: 'Total Withdrawn', values: categoriesList.map((c) => categoryTotals.get(c) ?? 0) }],
        },
      },
      table: {
        type: 'table',
        label: 'Stock Transactions',
        columns: [
          { key: 'item_name', header: 'Item', width: 24 },
          { key: 'category', header: 'Category', width: 16 },
          { key: 'quantity', header: 'Qty', width: 10 },
          { key: 'user_name', header: 'User', width: 20 },
          { key: 'time_stamp', header: 'When', width: 22 },
        ],
        rows: transactions.map((t) => ({
          item_name: t.item_name,
          category: t.category,
          quantity: t.quantity,
          user_name: t.user_name ?? '-',
          time_stamp: fmtDateTime(t.time_stamp),
        })),
      },
    },
  };
}
