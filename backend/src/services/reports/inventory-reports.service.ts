import * as repo from '../../repositories/reports/inventory-reports.repository';

export async function getLowStockService(category?: string | null) {
  const [summaryRow, itemRows] = await Promise.all([
    repo.getLowStockSummary(category),
    repo.getLowStockItems(category),
  ]);

  const summary = {
    criticalCount: summaryRow.critical_count ?? 0,
    lowCount: summaryRow.low_count ?? 0,
    totalItems: summaryRow.total_items ?? 0,
  };

  const items = itemRows.map((r) => ({
    itemId: r.item_id,
    itemName: r.item_name,
    category: r.category,
    quantityOnHand: r.quantity_on_hand,
    lowStockLimit: r.low_stock_limit,
    severity: r.severity,
  }));

  return { summary, items };
}

export async function getConsumptionService(
  startDate: string,
  endDate: string,
  category?: string | null,
) {
  const [weeklyRows, totalWithdrawn, topItem, topCategory] = await Promise.all([
    repo.getConsumptionWeekly(startDate, endDate, category),
    repo.getConsumptionTotal(startDate, endDate, category),
    repo.getTopConsumedItem(startDate, endDate, category),
    repo.getTopConsumedCategory(startDate, endDate),
  ]);

  const weekMap = new Map<string, { weekStart: string; weekNumber: number; categories: Record<string, number> }>();
  const categorySet = new Set<string>();

  for (const row of weeklyRows) {
    const weekStartIso = new Date(row.week_start).toISOString().slice(0, 10);
    const key = `${row.year}-${row.week_number}`;
    if (!weekMap.has(key)) {
      weekMap.set(key, {
        weekStart: weekStartIso,
        weekNumber: row.week_number,
        categories: {},
      });
    }
    const entry = weekMap.get(key)!;
    entry.categories[row.category] = (entry.categories[row.category] ?? 0) + (row.total_withdrawn ?? 0);
    categorySet.add(row.category);
  }

  const weeklyData = Array.from(weekMap.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  return {
    summary: {
      totalWithdrawn: totalWithdrawn ?? 0,
      topConsumedItem: topItem?.item_name ?? null,
      topConsumedQty: topItem?.total_qty ?? 0,
      topCategory: topCategory?.category ?? null,
      topCategoryQty: topCategory?.total_qty ?? 0,
    },
    weeklyData,
    categories: Array.from(categorySet).sort(),
  };
}

export async function getCategoriesService(): Promise<string[]> {
  return repo.getCategories();
}
