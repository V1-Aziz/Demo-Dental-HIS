// Inventory controller — HTTP boundary for all inventory endpoints.
// Validates inputs, delegates to the service layer, and maps domain errors
// (NOT_FOUND / NOT_PENDING / INSUFFICIENT_STOCK) to the correct HTTP statuses.
import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, created, badRequest, notFound, conflict, serverError } from '../utils/response.util';
import {
  listInventoryItemsService,
  listStockTransactionsService,
  getActivityHistoryService,
  depositItemService,
  withdrawItemService,
  getItemBatchesService,
  registerItemService,
  updateItemService,
  deleteItemService,
  getRemovedItemsService,
  listRequestsService,
  getMyRequestsService,
  createRequestService,
  approveRequestService,
  rejectRequestService,
  getLatestActivityService,
} from '../services/inventory.service';

export async function listItems(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query['search'] ?? '');
    const result = await listInventoryItemsService(search, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function listTransactions(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const result = await listStockTransactionsService(limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

// ─── Per-item deposit ─────────────────────────────────────────────────────────

export async function depositItem(req: Request, res: Response): Promise<void> {
  try {
    const itemId = Number(req.params['id']);
    if (!itemId) { badRequest(res, 'Invalid item id'); return; }

    const body = req.body as { quantity: number; expire_date?: string | null; notes?: string | null };
    if (!body.quantity || body.quantity < 1) {
      badRequest(res, 'quantity must be at least 1');
      return;
    }

    const result = await depositItemService(
      itemId,
      body.quantity,
      body.expire_date ?? null,
      req.user!.userId,
      body.notes ?? null,
    );
    created(res, result, 'Deposit completed');
  } catch {
    serverError(res);
  }
}

// ─── Per-item FEFO withdraw ───────────────────────────────────────────────────

export async function withdrawItem(req: Request, res: Response): Promise<void> {
  try {
    const itemId = Number(req.params['id']);
    if (!itemId) { badRequest(res, 'Invalid item id'); return; }

    const body = req.body as { quantity: number; notes?: string | null };
    if (!body.quantity || body.quantity < 1) {
      badRequest(res, 'quantity must be at least 1');
      return;
    }

    const notes  = body.notes?.trim() || 'Manual withdrawal';
    const result = await withdrawItemService(itemId, body.quantity, req.user!.userId, notes);
    success(res, result, 'Withdrawal completed');
  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : '';
    const extra = err as { available?: number; requested?: number };
    if (msg === 'INSUFFICIENT_STOCK') {
      conflict(res, `Insufficient stock. Available: ${extra.available ?? '?'}, Requested: ${extra.requested ?? '?'}`);
      return;
    }
    serverError(res);
  }
}

// ─── Per-item batch list ──────────────────────────────────────────────────────

export async function listItemBatches(req: Request, res: Response): Promise<void> {
  try {
    const itemId = Number(req.params['id']);
    if (!itemId) { badRequest(res, 'Invalid item id'); return; }
    const batches = await getItemBatchesService(itemId);
    success(res, batches);
  } catch {
    serverError(res);
  }
}

// ─── Item CRUD ────────────────────────────────────────────────────────────────

export async function deleteItem(req: Request, res: Response): Promise<void> {
  try {
    const itemId = Number(req.params['id']);
    if (!itemId) { badRequest(res, 'Invalid item id'); return; }
    await deleteItemService(itemId, req.user!.userId);
    success(res, null, 'Item deleted');
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ITEM_NOT_FOUND') { notFound(res, 'Item not found'); return; }
    serverError(res);
  }
}

export async function listRemovedItems(req: Request, res: Response): Promise<void> {
  try {
    const result = await getRemovedItemsService();
    success(res, result);
  } catch {
    serverError(res);
  }
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  try {
    const itemId = Number(req.params['id']);
    if (!itemId) { badRequest(res, 'Invalid item id'); return; }
    const body = req.body as {
      itemName:      string;
      category:      string;
      lowStockLimit: number;
      supplier?:     string;
      unitCost?:     number;
      // expireDate intentionally not accepted — expiry is now batch-level
    };
    if (!body.itemName || !body.category || !body.lowStockLimit) {
      badRequest(res, 'itemName, category, and lowStockLimit are required');
      return;
    }
    await updateItemService(itemId, body);
    success(res, null, 'Item updated');
  } catch {
    serverError(res);
  }
}

// ─── Inventory Requests ───────────────────────────────────────────────────────

export async function listRequests(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const search = String(req.query['search'] ?? '');
    const result = await listRequestsService(search, limit, offset);
    success(res, { ...result, page, limit });
  } catch {
    serverError(res);
  }
}

export async function createRequest(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { item_id: number; quantity: number; notes?: string };
    if (!body.item_id || !body.quantity || body.quantity < 1) {
      badRequest(res, 'item_id and quantity (≥1) are required');
      return;
    }
    const result = await createRequestService({
      itemId:      body.item_id,
      requestedBy: req.user!.userId,
      quantity:    body.quantity,
      notes:       body.notes ?? null,
    });
    created(res, result, 'Request submitted');
  } catch {
    serverError(res);
  }
}

export async function updateRequestStatus(req: Request, res: Response): Promise<void> {
  try {
    const requestId = Number(req.params['id']);
    if (!requestId) { badRequest(res, 'Invalid request id'); return; }

    const { status, feedback, approvedQuantity } = req.body as {
      status: string;
      feedback?: string;
      approvedQuantity?: number;
    };

    if (status === 'Approved') {
      if (!approvedQuantity || approvedQuantity < 1) {
        badRequest(res, 'approvedQuantity must be at least 1');
        return;
      }
      // approverId comes from the JWT — never from the request body.
      const { newQuantityOnHand } = await approveRequestService(requestId, approvedQuantity, req.user!.userId);
      success(res, { newQuantityOnHand }, 'Request approved');
    } else if (status === 'Rejected') {
      if (!feedback?.trim()) { badRequest(res, 'feedback is required when rejecting'); return; }
      await rejectRequestService(requestId, feedback.trim(), req.user!.userId);
      success(res, null, 'Request rejected');
    } else {
      badRequest(res, 'status must be Approved or Rejected');
    }
  } catch (err: unknown) {
    const msg   = err instanceof Error ? err.message : '';
    const extra = err as { available?: number; requested?: number };

    if (msg === 'NOT_FOUND')   { notFound(res, 'Request not found'); return; }
    if (msg === 'NOT_PENDING') { badRequest(res, 'Request has already been processed'); return; }
    if (msg === 'INSUFFICIENT_STOCK') {
      conflict(res, `Insufficient stock. Available: ${extra.available ?? '?'}, Requested: ${extra.requested ?? '?'}`);
      return;
    }
    serverError(res);
  }
}

export async function registerItem(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      itemName:      string;
      category:      string;
      supplier?:     string;
      unitCost?:     number;
      lowStockLimit: number;
    };
    if (!body.itemName || !body.category || !body.lowStockLimit) {
      badRequest(res, 'itemName, category, and lowStockLimit are required');
      return;
    }
    const result = await registerItemService({ ...body, assignedBy: req.user!.userId });
    created(res, result, 'Item registered');
  } catch {
    serverError(res);
  }
}

export async function listMyRequests(req: Request, res: Response): Promise<void> {
  try {
    const result = await getMyRequestsService(req.user!.userId);
    success(res, result);
  } catch {
    serverError(res);
  }
}

export async function listLatestActivity(req: Request, res: Response): Promise<void> {
  try {
    const rawLimit = parseInt(String(req.query['limit'] ?? '5'), 10);
    const limit    = Math.min(20, Math.max(1, isNaN(rawLimit) ? 5 : rawLimit));
    const result   = await getLatestActivityService(limit);
    success(res, result);
  } catch (err) {
    console.error('[listLatestActivity] failed:', err);
    serverError(res);
  }
}

export async function listActivityHistory(req: Request, res: Response): Promise<void> {
  try {
    const { offset, page } = parsePagination(req.query as Record<string, unknown>);
    // Allow up to 10 000 rows so the frontend's client-side pagination works
    // without being silently capped at the default 100-row limit.
    const rawLimit = parseInt(String(req.query['limit'] ?? '100'), 10);
    const limit    = Math.min(10_000, Math.max(1, isNaN(rawLimit) ? 100 : rawLimit));
    const result   = await getActivityHistoryService(limit, offset);
    success(res, { ...result, page, limit });
  } catch (err) {
    console.error('[listActivityHistory] failed:', err);
    serverError(res);
  }
}
