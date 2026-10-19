// Canonical data models for the Inventory Management domain.
// Inventory, Item Request, and History pages all reference these interfaces
// so the data layer stays consistent across the entire feature.

/** A single batch row as returned by GET /inventory/items/:id/batches. */
export interface ItemBatch {
  batch_id:           number;
  quantity_remaining: number;
  expire_date:        string | null; // YYYY-MM-DD or null
  deposited_at:       string;        // ISO 8601
}

export interface RemovedInventoryItem {
  removal_id:       number;
  item_id:          number;
  item_name:        string;
  category:         string;
  removed_by:       number;
  removal_reason:   'Expired' | 'Out of Stock';
  quantity_removed: number | null;
  removed_at:       string;
}

export type ItemStatus    = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'Expired';
export type RequestStatus = 'Pending'  | 'Approved'  | 'Rejected';
export type RequesterRole = 'Assistant' | 'Lab Specialist';
export type ActionType    = 'Deposit' | 'Withdraw' | 'Approved Request' | 'Rejected Request' | 'Edit' | 'Register';

/**
 * A single inventory item as held in the shared data service.
 * Display-formatted strings (expiryDate, unitCost, registerDate) are
 * pre-computed by the mapper so templates stay simple.
 */
export interface InventoryItem {
  id:               number;
  name:             string;
  category:         string;       // Consumable | Equipment | Medication | Tool / Instrument | Protective Gear
  quantityInStock:  number;
  lowStockLimit:    number;
  supplier:         string;
  unitCost:         string;       // display string, e.g. "45" or "—"
  expiryDate:       string;       // human-readable display of soonest active batch expiry, e.g. "10m", "Expired", "—"
  expiryDateRaw:    string;       // ISO string or "—", used for filter comparisons
  registerDate:     string;       // formatted display string
  assignedBy:       string;
  status:           ItemStatus;
  activeBatchCount: number;       // number of batches with quantity_remaining > 0
}

/**
 * A record of every state-changing action performed on an inventory item.
 * Emitted by InventoryDataService.logHistory() after every mutation.
 * inventoryItemId links back to the affected InventoryItem.
 */
export interface HistoryRecord {
  id:              number;
  inventoryItemId: number;      // FK → InventoryItem.id
  itemName:        string;
  action:          ActionType;
  quantityChanged: number;      // 0 for Edit / Rejected Request (no stock change)
  quantityBefore:  number;
  quantityAfter:   number;
  performedBy:     string;      // email or display name of the actor
  date:            Date;
  notes?:          string;
}

/** Combined row returned by GET /inventory/latest-activity.
 *  Discriminated by source_kind so templates can branch on the action set. */
export type LatestActivityRow =
  | {
      source_kind:        'transaction';
      source_id:          number;
      item_id:            number | null;
      item_name:          string;
      category:           string | null;
      action:             'Deposit' | 'Withdraw' | 'Reject';
      quantity:           number;
      occurred_at:        string;           // ISO 8601
      performed_by_email: string;
    }
  | {
      source_kind:        'removal';
      source_id:          number;
      item_id:            number;
      item_name:          string;
      category:           string;
      action:             'Expired' | 'Out of Stock';
      quantity:           number | null;    // null for Out of Stock
      occurred_at:        string;           // ISO 8601
      performed_by_email: string;
    };

/** A request row as returned by GET /inventory/requests/my. */
export interface MyInventoryRequest {
  request_id:         number;
  item_id:            number;
  item_name:          string;
  requested_quantity: number;
  approved_quantity:  number | null;
  notes:              string | null;
  status:             'Pending' | 'Approved' | 'Rejected';
  request_date:       string;
  modification_date:  string | null;
  approved_by:        number | null;
  approver_name:      string | null;
  approver_email:     string | null;
  rejection_feedback: string | null;
}

/**
 * A supply request submitted by a Dental Assistant or Lab Technician.
 * inventoryItemId is the FK that links this request to an InventoryItem —
 * this is used to deduct stock when the request is approved.
 */
export interface ItemRequest {
  id:               number;
  inventoryItemId:  number;         // FK → InventoryItem.id
  itemName:         string;
  requestedQuantity: number;
  approvedQuantity: number | null;
  requestedBy:      string;
  requesterRole:    RequesterRole;
  requestDate:      string;         // ISO string
  modificationDate: string | null;  // ISO string, or null if not yet modified
  status:           RequestStatus;
  notes:            string;
  rejectionFeedback: string;
}
