// Inventory service — business logic for items, transactions, and requests.
// Notification dispatches are fire-and-forget: a notification failure must
// never roll back or surface an error for the primary write operation.
import {
  getInventoryItems,
  getStockTransactions,
  getActivityHistory,
  depositItemBatch,
  withdrawItemFEFO,
  registerInventoryItem,
  updateInventoryItem,
  getInventoryItemById,
  deleteItemWithRecord,
  getRemovedItems,
  getNearExpiryItems,
  getInventoryRequests,
  getRequestsByUser,
  createInventoryRequest,
  approveInventoryRequest,
  rejectInventoryRequest,
  getLatestTransactions,
  getLatestRemovals,
  LatestTransactionRow,
  LatestRemovalRow,
} from '../repositories/inventory.repository';
import { getActiveBatchesForDisplay, getItemTotalQuantity } from '../repositories/item_batches.repository';
import { dispatchToUsers } from './notification.service';
import { buildLinkTo } from './notifications.links';
import { findUserIdsByRole } from '../repositories/notification.repository';

interface RegisterItemInput {
  itemName: string; category: string;
  supplier?: string | null; unitCost?: number | null;
  lowStockLimit: number; assignedBy: number;
}

export async function listInventoryItemsService(
  search: string,
  limit: number,
  offset: number,
) {
  return getInventoryItems(search, limit, offset);
}

export async function listStockTransactionsService(limit: number, offset: number) {
  return getStockTransactions(limit, offset);
}

export async function getActivityHistoryService(limit: number, offset: number) {
  return getActivityHistory(limit, offset);
}

// ─── Per-item deposit ─────────────────────────────────────────────────────────

export async function depositItemService(
  itemId:     number,
  quantity:   number,
  expireDate: string | null,
  userId:     number,
  notes?:     string | null,
): Promise<{ batchId: number }> {
  const batchId = await depositItemBatch(itemId, quantity, expireDate, userId, notes);

  // Dispatch expiry notification if the new batch is near expiry (fire-and-forget).
  if (expireDate) {
    try {
      const expiring = await getNearExpiryItems([itemId]);
      if (expiring.length) {
        const item  = expiring[0];
        const link  = buildLinkTo('inventory.item_expiring', null, 'InventoryManager');
        const today = new Date();
        const exp   = new Date(item.expire_date);
        const expired = exp < today;
        const body = expired
          ? `"${item.item_name}" expired on ${item.expire_date}`
          : `"${item.item_name}" expires on ${item.expire_date}`;
        const [imIds, adminIds] = await Promise.all([
          findUserIdsByRole('InventoryManager'),
          findUserIdsByRole('Admin'),
        ]);
        await dispatchToUsers([...new Set([...imIds, ...adminIds])], {
          type:               'inventory.item_expiring',
          title:              expired ? `Expired: ${item.item_name}` : `Expiring soon: ${item.item_name}`,
          message:            body,
          linkTo:             link,
          relatedEntityType:  'Inventory_Items',
          relatedEntityId:    item.item_id,
        });
      }
    } catch (err) {
      console.warn('notifications.dispatch.failed', { type: 'inventory.item_expiring', err });
    }
  }

  return { batchId };
}

// ─── Per-item FEFO withdraw ───────────────────────────────────────────────────

export async function withdrawItemService(
  itemId: number,
  amount: number,
  userId: number,
  notes:  string,
): Promise<{ consumed: { batch_id: number; quantity: number }[] }> {
  const result = await withdrawItemFEFO(itemId, amount, userId, notes);

  // Dispatch low-stock notification if the item is now at or below the limit (fire-and-forget).
  try {
    const item = await getInventoryItemById(itemId);
    if (item) {
      const newTotal = await getItemTotalQuantity(itemId);
      if (newTotal <= item.low_stock_limit) {
        const link = buildLinkTo('inventory.low_stock', null, 'InventoryManager');
        const [imIds, adminIds] = await Promise.all([
          findUserIdsByRole('InventoryManager'),
          findUserIdsByRole('Admin'),
        ]);
        await dispatchToUsers([...new Set([...imIds, ...adminIds])], {
          type:               'inventory.low_stock',
          title:              `Low Stock: ${item.item_name}`,
          message:            `Low stock: "${item.item_name}" — ${newTotal} unit(s) remaining (limit: ${item.low_stock_limit})`,
          linkTo:             link,
          relatedEntityType:  'Inventory_Items',
        });
      }
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'inventory.low_stock', err });
  }

  return result;
}

// ─── Per-item batch list ──────────────────────────────────────────────────────

export async function getItemBatchesService(itemId: number) {
  return getActiveBatchesForDisplay(itemId);
}

// ─── Item CRUD ────────────────────────────────────────────────────────────────

interface UpdateItemInput {
  itemName:      string;
  category:      string;
  lowStockLimit: number;
  supplier?:     string | null;
  unitCost?:     number | null;
  // expireDate removed — expiry is now managed per batch
}

export async function updateItemService(
  itemId: number,
  data:   UpdateItemInput,
): Promise<void> {
  await updateInventoryItem(itemId, {
    itemName:      data.itemName,
    category:      data.category,
    lowStockLimit: data.lowStockLimit,
    supplier:      data.supplier ?? null,
    unitCost:      data.unitCost ?? null,
  });
}

export async function deleteItemService(itemId: number, removedBy: number): Promise<void> {
  const item = await getInventoryItemById(itemId);
  if (!item) throw new Error('ITEM_NOT_FOUND');

  const removalReason:   'Expired' | 'Out of Stock' = item.has_expired_batch ? 'Expired' : 'Out of Stock';
  const quantityRemoved: number | null              = item.has_expired_batch ? item.total_quantity : null;

  await deleteItemWithRecord({
    item_id:          itemId,
    item_name:        item.item_name,
    category:         item.category,
    removed_by:       removedBy,
    removal_reason:   removalReason,
    quantity_removed: quantityRemoved,
  });
}

export async function getRemovedItemsService() {
  return getRemovedItems();
}

// ─── Inventory Requests ───────────────────────────────────────────────────────

export async function listRequestsService(search: string, limit: number, offset: number) {
  return getInventoryRequests(search, limit, offset);
}

export async function getMyRequestsService(userId: number) {
  return getRequestsByUser(userId);
}

export async function createRequestService(data: {
  itemId:      number;
  requestedBy: number;
  quantity:    number;
  notes?:      string | null;
}): Promise<{ requestId: number }> {
  const result = await createInventoryRequest(data);

  // Notify all InventoryManagers that a new request arrived (fire-and-forget).
  try {
    const link  = buildLinkTo('inventory.request.created', null, 'InventoryManager');
    const imIds = await findUserIdsByRole('InventoryManager');
    if (imIds.length) {
      await dispatchToUsers(imIds, {
        type:              'inventory.request.created',
        title:             'New inventory request',
        message:           'A new item request is awaiting your review.',
        linkTo:            link,
        relatedEntityType: 'Inventory_Requests',
        relatedEntityId:   result.requestId,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'inventory.request.created', err });
  }

  return result;
}

export async function approveRequestService(
  requestId:        number,
  approvedQuantity: number,
  approverId:       number,
): Promise<{ newQuantityOnHand: number }> {
  const { requestedBy, newQuantityOnHand } = await approveInventoryRequest(requestId, approvedQuantity, approverId);

  // Notify the requester (fire-and-forget).
  try {
    const link = buildLinkTo('inventory.request.approved', requestId, 'DentalAssistant');
    await dispatchToUsers([requestedBy], {
      type:              'inventory.request.approved',
      title:             'Your request was approved',
      message:           'Your inventory item request has been approved and stock has been deducted.',
      linkTo:            link,
      relatedEntityType: 'Inventory_Requests',
      relatedEntityId:   requestId,
    });
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'inventory.request.approved', err });
  }

  return { newQuantityOnHand };
}

export async function rejectRequestService(
  requestId:  number,
  feedback:   string,
  rejectorId: number,
): Promise<void> {
  const { requestedBy } = await rejectInventoryRequest(requestId, feedback, rejectorId);

  // Notify the requester (fire-and-forget).
  try {
    const link = buildLinkTo('inventory.request.rejected', requestId, 'DentalAssistant');
    await dispatchToUsers([requestedBy], {
      type:              'inventory.request.rejected',
      title:             'Your request was rejected',
      message:           `Your inventory item request was rejected. Feedback: ${feedback}`,
      linkTo:            link,
      relatedEntityType: 'Inventory_Requests',
      relatedEntityId:   requestId,
    });
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'inventory.request.rejected', err });
  }
}

// ─── Latest combined activity feed ───────────────────────────────────────────

export type LatestActivityRow = LatestTransactionRow | LatestRemovalRow;

export async function getLatestActivityService(limit: number): Promise<LatestActivityRow[]> {
  const [transactions, removals] = await Promise.all([
    getLatestTransactions(limit),
    getLatestRemovals(limit),
  ]);
  const merged: LatestActivityRow[] = [...transactions, ...removals];
  merged.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  return merged.slice(0, limit);
}

export async function registerItemService(data: RegisterItemInput): Promise<{ itemId: number }> {
  return registerInventoryItem({
    itemName:      data.itemName,
    category:      data.category,
    supplier:      data.supplier ?? null,
    unitCost:      data.unitCost ?? null,
    lowStockLimit: data.lowStockLimit,
    assignedBy:    data.assignedBy,
  });
}
