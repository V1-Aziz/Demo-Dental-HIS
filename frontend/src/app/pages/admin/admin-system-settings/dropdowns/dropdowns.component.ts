import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import {
  SystemLookupService,
  LookupCategory,
  LookupValue,
} from '../../../../services/system-lookup.service';
import { LookupPublicService } from '../../../../services/lookup-public.service';

interface EditState {
  lookupId:      number;
  originalLabel: string;
  currentLabel:  string;
}

@Component({
  standalone: false,
  selector: 'app-dropdowns',
  templateUrl: './dropdowns.component.html',
})
export class DropdownsComponent implements OnInit {
  categories: LookupCategory[] = [];
  filteredCategories: LookupCategory[] = [];
  categorySearch = '';
  selectedCategory: LookupCategory | null = null;

  values: LookupValue[] = [];
  originalValues: LookupValue[] = [];   // snapshot on load — used by Discard
  extraFields: string[] = [];
  valuesLoading = false;

  // Pending changes: lookupId → fields to PATCH
  pendingChanges = new Map<number, Record<string, any>>();

  // Unsaved-switch warning
  switchWarning = false;
  pendingSwitchTarget: LookupCategory | null = null;

  // Add new value
  showAddForm = false;
  newLabel    = '';
  addLoading  = false;

  // Inline edit
  editState: EditState | null = null;

  // Delete confirm
  deleteConfirmId: number | null = null;
  deleteLoading = false;

  // Save
  saveLoading = false;

  // Drag & drop
  dragIndex: number | null = null;

  toast     = '';
  toastType: 'success' | 'error' = 'success';

  constructor(
    private svc:     SystemLookupService,
    private lookups: LookupPublicService,
  ) {}

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.svc.getCategories().subscribe({
      next: res => {
        this.categories = res.data ?? [];
        this.applySearch();
        if (this.categories.length && !this.selectedCategory) {
          this.selectCategory(this.categories[0], true);
        }
      },
      error: () => {},
    });
  }

  applySearch(): void {
    const q = this.categorySearch.toLowerCase();
    this.filteredCategories = q
      ? this.categories.filter(c => c.displayName.toLowerCase().includes(q))
      : [...this.categories];
  }

  onCategorySearch(val: string): void {
    this.categorySearch = val;
    this.applySearch();
  }

  selectCategory(cat: LookupCategory, force = false): void {
    if (!force && this.hasPending()) {
      // Warn instead of silently losing changes
      this.pendingSwitchTarget = cat;
      this.switchWarning = true;
      return;
    }
    this.switchWarning      = false;
    this.pendingSwitchTarget = null;
    this.selectedCategory   = cat;
    this.editState          = null;
    this.showAddForm        = false;
    this.newLabel           = '';
    this.deleteConfirmId    = null;
    this.pendingChanges.clear();
    this.loadValues(cat.categoryKey);
  }

  confirmSwitchAway(): void {
    if (this.pendingSwitchTarget) {
      this.pendingChanges.clear();
      this.selectCategory(this.pendingSwitchTarget, true);
    }
  }

  cancelSwitchAway(): void {
    this.switchWarning      = false;
    this.pendingSwitchTarget = null;
  }

  loadValues(categoryKey: string): void {
    this.valuesLoading = true;
    this.svc.getValues(categoryKey).subscribe({
      next: res => {
        this.values       = res.data?.values ?? [];
        this.extraFields  = res.data?.extraFields ?? [];
        this.originalValues = this.values.map(v => ({ ...v }));
        this.valuesLoading = false;
      },
      error: () => { this.valuesLoading = false; },
    });
  }

  // ── Pending tracking ───────────────────────────────────────────────────────

  hasPending(): boolean {
    return this.pendingChanges.size > 0;
  }

  isPending(v: LookupValue): boolean {
    return this.pendingChanges.has(v.lookupId);
  }

  private mark(id: number, changes: Record<string, any>): void {
    const existing = this.pendingChanges.get(id) ?? {};
    this.pendingChanges.set(id, { ...existing, ...changes });
  }

  // ── Toggle active — marks pending, does NOT call API yet ──────────────────

  toggleActive(v: LookupValue): void {
    if (!this.selectedCategory || this.selectedCategory.readOnly) return;
    v.isActive = !v.isActive;
    this.mark(v.lookupId, { isActive: v.isActive });
  }

  // ── Inline edit — marks pending on Save ───────────────────────────────────

  startEdit(v: LookupValue): void {
    if (this.selectedCategory?.readOnly) return;
    this.editState = { lookupId: v.lookupId, originalLabel: v.valueLabel, currentLabel: v.valueLabel };
  }

  cancelEdit(): void { this.editState = null; }

  saveEdit(v: LookupValue): void {
    if (!this.editState) return;
    const newLabel = this.editState.currentLabel.trim();
    if (!newLabel) return;
    if (newLabel !== this.editState.originalLabel) {
      v.valueLabel = newLabel;
      this.mark(v.lookupId, { valueLabel: newLabel });
    }
    this.editState = null;
  }

  updateDuration(v: LookupValue, dur: number): void {
    if (!this.selectedCategory) return;
    (v as any).duration = dur;
    this.mark(v.lookupId, { duration: dur });
  }

  // ── Save all pending changes ───────────────────────────────────────────────

  saveAllChanges(): void {
    if (!this.hasPending() || !this.selectedCategory) return;
    this.saveLoading = true;

    const calls = Array.from(this.pendingChanges.entries()).map(([id, changes]) =>
      this.svc.updateValue(this.selectedCategory!.categoryKey, id, changes),
    );

    forkJoin(calls).subscribe({
      next: () => {
        this.saveLoading = false;
        this.pendingChanges.clear();
        this.originalValues = this.values.map(v => ({ ...v }));
        // Bust the public cache so other portals see the update immediately
        this.lookups.bust(this.selectedCategory!.categoryKey);
        this.showToast('Changes saved', 'success');
        this.refreshCategoryCount();
      },
      error: (err) => {
        this.saveLoading = false;
        this.showToast(err?.error?.error ?? 'Save failed — please try again', 'error');
      },
    });
  }

  discardChanges(): void {
    this.values = this.originalValues.map(v => ({ ...v }));
    this.pendingChanges.clear();
    this.editState = null;
    this.showToast('Changes discarded', 'success');
  }

  // ── Add value (immediate — deliberate creation action) ────────────────────

  addValue(): void {
    if (!this.newLabel.trim() || !this.selectedCategory) return;
    this.addLoading = true;
    this.svc.addValue(this.selectedCategory.categoryKey, { valueLabel: this.newLabel.trim() }).subscribe({
      next: res => {
        this.addLoading  = false;
        this.showAddForm = false;
        this.newLabel    = '';
        if (res.data) {
          this.values = [...this.values, res.data];
          this.originalValues = this.values.map(v => ({ ...v }));
        }
        this.lookups.bust(this.selectedCategory!.categoryKey);
        this.showToast('Value added', 'success');
        this.refreshCategoryCount(1);
      },
      error: (err) => {
        this.addLoading = false;
        this.showToast(err?.error?.error ?? 'Failed to add value', 'error');
      },
    });
  }

  // ── Delete (immediate — deliberate confirmed action) ──────────────────────

  confirmDelete(id: number): void  { this.deleteConfirmId = id; }
  cancelDelete(): void             { this.deleteConfirmId = null; }

  deleteValue(v: LookupValue): void {
    if (!this.selectedCategory) return;
    this.deleteLoading = true;
    this.svc.deleteValue(this.selectedCategory.categoryKey, v.lookupId).subscribe({
      next: () => {
        this.deleteLoading   = false;
        this.deleteConfirmId = null;
        this.values          = this.values.filter(x => x.lookupId !== v.lookupId);
        this.originalValues  = this.values.map(v => ({ ...v }));
        this.pendingChanges.delete(v.lookupId);
        this.lookups.bust(this.selectedCategory!.categoryKey);
        this.showToast('Value deleted', 'success');
        this.refreshCategoryCount(-1);
      },
      error: (err) => {
        this.deleteLoading = false;
        const errMsg: string = err?.error?.error ?? '';
        if (errMsg.includes('IN_USE')) {
          this.showToast('This value is referenced by existing records. Deactivate it instead.', 'error');
        } else {
          this.showToast(errMsg || 'Delete failed', 'error');
        }
        this.deleteConfirmId = null;
      },
    });
  }

  // ── Drag & drop (immediate — deliberate action) ───────────────────────────

  onDragStart(i: number): void { this.dragIndex = i; }
  onDragOver(e: DragEvent): void { e.preventDefault(); }

  onDrop(e: DragEvent, targetIndex: number): void {
    e.preventDefault();
    if (this.dragIndex === null || this.dragIndex === targetIndex) return;

    const moved = this.values.splice(this.dragIndex, 1)[0];
    this.values.splice(targetIndex, 0, moved);
    this.dragIndex = null;

    if (!this.selectedCategory) return;
    this.svc.reorderValues(this.selectedCategory.categoryKey, this.values.map(v => v.lookupId)).subscribe({
      next: () => {
        this.originalValues = this.values.map(v => ({ ...v }));
        this.lookups.bust(this.selectedCategory!.categoryKey);
        this.showToast('Order saved', 'success');
      },
      error: () => { this.showToast('Reorder failed — please refresh', 'error'); },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  isEditing(v: LookupValue): boolean { return this.editState?.lookupId === v.lookupId; }

  private refreshCategoryCount(delta = 0): void {
    const cat = this.categories.find(c => c.categoryKey === this.selectedCategory?.categoryKey);
    if (cat) cat.count = Math.max(0, cat.count + delta);
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast = msg; this.toastType = type;
    setTimeout(() => (this.toast = ''), 3500);
  }
}
