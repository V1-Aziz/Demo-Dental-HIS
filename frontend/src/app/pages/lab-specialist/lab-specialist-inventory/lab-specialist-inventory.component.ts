import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../../../services/inventory.service';

type RequestStatus = 'Pending' | 'Approved' | 'Rejected';

interface InventoryRequest {
  date:   string;
  item:   string;
  qty:    string;
  status: RequestStatus;
}

interface InventoryItem {
  id:   number;
  name: string;
}

@Component({
  standalone: false,
  selector: 'app-lab-specialist-inventory',
  templateUrl: './lab-specialist-inventory.component.html',
})
export class LabSpecialistInventoryComponent implements OnInit {
  items:   InventoryItem[] = [];
  history: InventoryRequest[] = [];

  selectedItemId: number | null = null;
  quantity        = 1;
  notes           = '';

  submitting   = false;
  submitError  = '';
  submitSuccess = false;

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.inventoryService.getItems().subscribe((res: any) => {
      this.items = (res.data?.rows ?? res.data ?? []).map((i: any) => ({
        id:   i.item_id,
        name: i.item_name,
      }));
    });
    this.loadHistory();
  }

  loadHistory(): void {
    this.inventoryService.getMyRequests().subscribe((res: any) => {
      this.history = (res.data?.rows ?? res.data ?? []).map((r: any) => ({
        date:   new Date(r.request_date).toLocaleDateString('en-GB'),
        item:   r.item_name,
        qty:    r.requested_quantity + ' Units',
        status: r.status as RequestStatus,
      }));
    });
  }

  submitRequest(): void {
    if (!this.selectedItemId || this.quantity < 1) return;

    this.submitting   = true;
    this.submitError  = '';
    this.submitSuccess = false;

    this.inventoryService.createRequest({
      item_id:  this.selectedItemId,
      quantity: this.quantity,
      notes:    this.notes.trim() || undefined,
    }).subscribe({
      next: () => {
        this.submitting    = false;
        this.submitSuccess = true;
        this.selectedItemId = null;
        this.quantity       = 1;
        this.notes          = '';
        this.loadHistory();
      },
      error: (err: any) => {
        this.submitting  = false;
        this.submitError = err?.error?.error ?? 'Failed to submit request. Please try again.';
      },
    });
  }

  statusClass(status: RequestStatus): string {
    const map: Record<RequestStatus, string> = {
      'Pending':  'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800',
    };
    return map[status];
  }
}
