import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { ReportsService } from '../../../../services/reports.service';

interface LowStockItem {
  itemId: number;
  itemName: string;
  category: string;
  quantityOnHand: number;
  lowStockLimit: number;
  severity: 'Critical' | 'Low';
}

@Component({
  standalone: false,
  selector: 'app-low-stock-items',
  templateUrl: './low-stock-items.component.html',
})
export class LowStockItemsComponent implements OnInit {
  @Output() back = new EventEmitter<void>();

  isLoading = true;
  hasError = false;

  categories: string[] = [];
  selectedCategory: string = '';

  summary = { criticalCount: 0, lowCount: 0, totalItems: 0 };
  items: LowStockItem[] = [];

  exportOpen = false;
  readonly reportKey = 'low-stock-items' as const;

  get exportFilters(): Record<string, unknown> {
    return { category: this.selectedCategory || null };
  }

  get exportSubtitle(): string {
    return this.selectedCategory || 'All categories';
  }

  constructor(private reportsService: ReportsService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadData();
  }

  private loadCategories(): void {
    this.reportsService.getInventoryCategories().subscribe({
      next: (res: any) => {
        this.categories = res.data || [];
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  loadData(): void {
    this.isLoading = true;
    this.hasError = false;

    this.reportsService.getLowStockItems(this.selectedCategory || null).subscribe({
      next: (res: any) => {
        this.summary = res.data.summary;
        this.items = res.data.items;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
      },
    });
  }

  onCategoryChange(): void {
    this.loadData();
  }

  goBack(): void {
    this.back.emit();
  }
}
