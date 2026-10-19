// /inventory — mirrors inventory.routes.ts, inventory.service.ts,
// inventory.repository.ts and item_batches.repository.ts. Stock lives in
// batches; withdrawals consume the soonest-expiring batch first.
import { DemoRouter, ok, created, badRequest, conflict, notFound, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { now, today, ymd } from '../data/time';
import { buildLinkTo, byDesc, like, notifyUsers, sql107, sql127, sql23, userById, userIdsByRole } from '../helpers';

const MANAGE = ['Admin', 'InventoryManager'];

function batchesOf(db: DemoDb, itemId: number): Row[] {
  return db.tables.Item_Batches.filter(b => b.item_id === itemId);
}

/** Active batches in FEFO order: soonest expiry first, NULL expiry last. */
function activeBatches(db: DemoDb, itemId: number): Row[] {
  return batchesOf(db, itemId)
    .filter(b => b.quantity_remaining > 0)
    .sort((a, b) => {
      if (!a.expire_date !== !b.expire_date) return a.expire_date ? -1 : 1;
      return (a.expire_date ?? '').localeCompare(b.expire_date ?? '') || a.batch_id - b.batch_id;
    });
}

export function quantityOnHand(db: DemoDb, itemId: number): number {
  return batchesOf(db, itemId).reduce((sum, b) => sum + b.quantity_remaining, 0);
}

function soonestExpiry(db: DemoDb, itemId: number): string | null {
  const dates = batchesOf(db, itemId).filter(b => b.quantity_remaining > 0 && b.expire_date).map(b => b.expire_date).sort();
  return dates.length ? sql23(dates[0]) : null;
}

function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function managerAndAdminIds(db: DemoDb): number[] {
  return [...new Set([...userIdsByRole(db, 'InventoryManager'), ...userIdsByRole(db, 'Admin')])];
}

function personName(db: DemoDb, userId: number | null): string | null {
  const emp = db.tables.Employee
    .filter(e => e.user_id === userId && !e.deleted_at)
    .sort((a, b) => a.employee_id - b.employee_id)[0];
  return emp ? `${emp.first_name} ${emp.last_name}`.trim() : userById(db, userId)?.email ?? null;
}

/** Consumes `amount` from the item's batches, soonest expiry first. */
function consumeFefo(db: DemoDb, itemId: number, amount: number): { batch_id: number; quantity: number }[] {
  const consumed: { batch_id: number; quantity: number }[] = [];
  let remaining = amount;
  for (const b of activeBatches(db, itemId)) {
    if (remaining === 0) break;
    const take = Math.min(remaining, b.quantity_remaining);
    b.quantity_remaining -= take;
    consumed.push({ batch_id: b.batch_id, quantity: take });
    remaining -= take;
  }
  return consumed;
}

function insufficient(available: number, requested: number) {
  return conflict(`Insufficient stock. Available: ${available}, Requested: ${requested}`);
}

export function registerInventory(r: DemoRouter): void {
  r.get('/inventory/requests/my', ['Admin', 'InventoryManager', 'DentalAssistant', 'LabTechnician'], ({ user, db }) => {
    const rows = db.tables.Inventory_Requests
      .filter(x => x.requested_by === user.userId)
      .map(x => ({ x, item: db.tables.Inventory_Items.find(i => i.item_id === x.item_id) }))
      .filter(({ item }) => item)
      .sort((a, b) => b.x.created_at.localeCompare(a.x.created_at))
      .map(({ x, item }) => ({
        request_id: x.request_id,
        item_id: x.item_id,
        item_name: item!.item_name,
        requested_quantity: x.quantity,
        notes: x.notes,
        status: x.status,
        request_date: x.created_at,
        modification_date: x.modified_at,
        approved_quantity: x.approved_quantity,
        approved_by: x.approved_by,
        rejection_feedback: x.rejection_feedback,
        approver_name: x.approved_by ? personName(db, x.approved_by) : null,
        approver_email: userById(db, x.approved_by)?.email ?? null,
      }));
    return ok({ rows });
  });

  r.get('/inventory/requests', MANAGE, ({ query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = String(query['search'] ?? '');
    const all = db.tables.Inventory_Requests
      .map(x => ({ x, item: db.tables.Inventory_Items.find(i => i.item_id === x.item_id), u: userById(db, x.requested_by) }))
      .filter(({ item, u }) => item && u && like(item.item_name, search))
      .sort((a, b) => b.x.created_at.localeCompare(a.x.created_at));
    const rows = all.slice(offset, offset + limit).map(({ x, item, u }) => ({
      request_id: x.request_id,
      item_id: x.item_id,
      item_name: item!.item_name,
      requested_by: x.requested_by,
      requester_name: personName(db, x.requested_by),
      requester_role: db.tables.Roles.find(ro => ro.role_id === u!.role_id)?.role_name ?? null,
      quantity: x.quantity,
      approved_quantity: x.approved_quantity,
      status: x.status,
      notes: x.notes,
      rejection_feedback: x.rejection_feedback,
      created_at: x.created_at,
      modified_at: x.modified_at,
    }));
    return ok({ rows, total: all.length, page, limit });
  });

  r.post('/inventory/requests', ['DentalAssistant', 'LabTechnician'], ({ user, body, db }) => {
    if (!body?.item_id || !body?.quantity || body.quantity < 1) return badRequest('item_id and quantity (≥1) are required');
    const req = db.insert('Inventory_Requests', {
      item_id: body.item_id,
      requested_by: user.userId,
      quantity: body.quantity,
      notes: body.notes ?? null,
    });
    notifyUsers(db, userIdsByRole(db, 'InventoryManager'), {
      type: 'inventory.request.created',
      title: 'New inventory request',
      message: 'A new item request is awaiting your review.',
      linkTo: buildLinkTo('inventory.request.created', null, 'InventoryManager'),
      relatedEntityType: 'Inventory_Requests',
      relatedEntityId: req.request_id,
    });
    return created({ requestId: req.request_id }, 'Request submitted');
  });

  r.patch('/inventory/requests/:id', MANAGE, ({ user, params, body, db }) => {
    const requestId = Number(params['id']);
    if (!requestId) return badRequest('Invalid request id');
    const { status, feedback, approvedQuantity } = body ?? {};
    const req = db.tables.Inventory_Requests.find(x => x.request_id === requestId);

    if (status === 'Approved') {
      if (!approvedQuantity || approvedQuantity < 1) return badRequest('approvedQuantity must be at least 1');
      if (!req) return notFound('Request not found');
      if (req.status !== 'Pending') return badRequest('Request has already been processed');
      const available = quantityOnHand(db, req.item_id);
      if (available < approvedQuantity) return insufficient(available, approvedQuantity);

      req.status = 'Approved';
      req.approved_quantity = approvedQuantity;
      req.approved_by = user.userId;
      req.modified_at = now();
      req.processed_at = now();
      const consumed = consumeFefo(db, req.item_id, approvedQuantity);
      const detail = consumed.map(c => `batch#${c.batch_id}(${c.quantity})`).join(', ');
      db.insert('Stock_Transactions', {
        item_id: req.item_id, user_id: user.userId, transaction_type: 'Withdraw', quantity: approvedQuantity,
        notes: `Request #${requestId} approved. Consumed: ${detail}`.substring(0, 500),
      });
      notifyUsers(db, [req.requested_by], {
        type: 'inventory.request.approved',
        title: 'Your request was approved',
        message: 'Your inventory item request has been approved and stock has been deducted.',
        linkTo: buildLinkTo('inventory.request.approved', requestId, 'DentalAssistant'),
        relatedEntityType: 'Inventory_Requests',
        relatedEntityId: requestId,
      });
      return ok({ newQuantityOnHand: available - approvedQuantity }, 'Request approved');
    }

    if (status === 'Rejected') {
      if (!feedback?.trim()) return badRequest('feedback is required when rejecting');
      if (!req) return notFound('Request not found');
      if (req.status !== 'Pending') return badRequest('Request has already been processed');
      req.status = 'Rejected';
      req.rejection_feedback = feedback.trim();
      req.approved_by = user.userId;
      req.modified_at = now();
      req.processed_at = now();
      db.insert('Stock_Transactions', {
        item_id: req.item_id, user_id: user.userId, transaction_type: 'Reject', quantity: 0,
        notes: `Request #${requestId} rejected`,
      });
      notifyUsers(db, [req.requested_by], {
        type: 'inventory.request.rejected',
        title: 'Your request was rejected',
        message: `Your inventory item request was rejected. Feedback: ${feedback.trim()}`,
        linkTo: buildLinkTo('inventory.request.rejected', requestId, 'DentalAssistant'),
        relatedEntityType: 'Inventory_Requests',
        relatedEntityId: requestId,
      });
      return ok(null, 'Request rejected');
    }

    return badRequest('status must be Approved or Rejected');
  });

  r.get('/inventory/removed-items', MANAGE, ({ db }) => {
    const rows = [...db.tables.Removed_Inventory_Items]
      .sort(byDesc('removed_at'))
      .map(x => ({
        removal_id: x.removal_id,
        item_id: x.item_id,
        item_name: x.item_name,
        category: x.category,
        removed_by: x.removed_by,
        removal_reason: x.removal_reason,
        quantity_removed: x.quantity_removed,
        removed_at: sql127(x.removed_at),
      }));
    return ok(rows);
  });

  r.get('/inventory/items', ['Admin', 'InventoryManager', 'DentalAssistant', 'LabTechnician'], ({ query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = String(query['search'] ?? '');
    const all = db.tables.Inventory_Items
      .filter(i => like(i.item_name, search) || like(i.category, search))
      .sort((a, b) => a.item_id - b.item_id);
    const rows = all.slice(offset, offset + limit).map(i => ({
      item_id: i.item_id,
      item_name: i.item_name,
      category: i.category,
      low_stock_limit: i.low_stock_limit,
      supplier: i.supplier,
      unit_cost: i.unit_cost,
      register_date: i.register_date,
      assigned_by_email: userById(db, i.assigned_by)?.email ?? null,
      quantity_on_hand: quantityOnHand(db, i.item_id),
      soonest_expire_date: soonestExpiry(db, i.item_id),
      active_batch_count: batchesOf(db, i.item_id).filter(b => b.quantity_remaining > 0).length,
    }));
    return ok({ rows, total: all.length, page, limit });
  });

  r.post('/inventory/items', MANAGE, ({ user, body, db }) => {
    if (!body?.itemName || !body?.category || !body?.lowStockLimit) {
      return badRequest('itemName, category, and lowStockLimit are required');
    }
    const item = db.insert('Inventory_Items', {
      item_name: body.itemName,
      category: body.category,
      supplier: body.supplier ?? null,
      unit_cost: body.unitCost ?? null,
      low_stock_limit: body.lowStockLimit,
      assigned_by: user.userId,
    });
    return created({ itemId: item.item_id }, 'Item registered');
  });

  r.patch('/inventory/items/:id', MANAGE, ({ params, body, db }) => {
    const itemId = Number(params['id']);
    if (!itemId) return badRequest('Invalid item id');
    if (!body?.itemName || !body?.category || !body?.lowStockLimit) {
      return badRequest('itemName, category, and lowStockLimit are required');
    }
    const item = db.tables.Inventory_Items.find(i => i.item_id === itemId);
    if (item) {
      item.item_name = body.itemName;
      item.category = body.category;
      item.low_stock_limit = body.lowStockLimit;
      item.supplier = body.supplier ?? null;
      item.unit_cost = body.unitCost ?? null;
      db.save();
    }
    return ok(null, 'Item updated');
  });

  r.delete('/inventory/items/:id', MANAGE, ({ user, params, db }) => {
    const itemId = Number(params['id']);
    if (!itemId) return badRequest('Invalid item id');
    const item = db.tables.Inventory_Items.find(i => i.item_id === itemId);
    if (!item) return notFound('Item not found');
    const hasExpired = batchesOf(db, itemId).some(b => b.quantity_remaining > 0 && b.expire_date && sql23(b.expire_date)! <= today());
    db.insert('Removed_Inventory_Items', {
      item_id: itemId,
      item_name: item.item_name,
      category: item.category,
      removed_by: user.userId,
      removal_reason: hasExpired ? 'Expired' : 'Out of Stock',
      quantity_removed: hasExpired ? quantityOnHand(db, itemId) : null,
    });
    // ON DELETE CASCADE: batches, stock transactions and requests go with the item.
    db.delete('Item_Batches', b => b.item_id === itemId);
    db.delete('Stock_Transactions', t => t.item_id === itemId);
    db.delete('Inventory_Requests', x => x.item_id === itemId);
    db.delete('Inventory_Items', i => i.item_id === itemId);
    return ok(null, 'Item deleted');
  });

  r.post('/inventory/items/:id/deposit', MANAGE, ({ user, params, body, db }) => {
    const itemId = Number(params['id']);
    if (!itemId) return badRequest('Invalid item id');
    if (!body?.quantity || body.quantity < 1) return badRequest('quantity must be at least 1');
    if (!db.tables.Inventory_Items.some(i => i.item_id === itemId)) return { status: 500, body: { success: false, error: 'Internal server error' } };

    const expireDate: string | null = body.expire_date ?? null;
    const batch = db.insert('Item_Batches', {
      item_id: itemId,
      quantity_initial: body.quantity,
      quantity_remaining: body.quantity,
      expire_date: expireDate ? `${expireDate.slice(0, 10)}T00:00:00.000Z` : null,
      deposited_by: user.userId,
      notes: body.notes ?? null,
    });
    db.insert('Stock_Transactions', {
      item_id: itemId, user_id: user.userId, transaction_type: 'Deposit', quantity: body.quantity,
      notes: `Deposit batch #${batch.batch_id}${body.notes ? `: ${body.notes}` : ''}`.substring(0, 500),
    });

    if (expireDate) {
      const limit = plusDays(30);
      const expiring = batchesOf(db, itemId).filter(b => b.expire_date && sql23(b.expire_date)! <= limit && b.quantity_remaining > 0);
      if (expiring.length) {
        const item = db.tables.Inventory_Items.find(i => i.item_id === itemId)!;
        const soonest = expiring.map(b => b.expire_date).sort()[0];
        const formatted = sql107(soonest)!;
        const expired = new Date(formatted) < new Date();
        notifyUsers(db, managerAndAdminIds(db), {
          type: 'inventory.item_expiring',
          title: expired ? `Expired: ${item.item_name}` : `Expiring soon: ${item.item_name}`,
          message: expired ? `"${item.item_name}" expired on ${formatted}` : `"${item.item_name}" expires on ${formatted}`,
          linkTo: buildLinkTo('inventory.item_expiring', null, 'InventoryManager'),
          relatedEntityType: 'Inventory_Items',
          relatedEntityId: itemId,
        });
      }
    }
    return created({ batchId: batch.batch_id }, 'Deposit completed');
  });

  r.post('/inventory/items/:id/withdraw', MANAGE, ({ user, params, body, db }) => {
    const itemId = Number(params['id']);
    if (!itemId) return badRequest('Invalid item id');
    if (!body?.quantity || body.quantity < 1) return badRequest('quantity must be at least 1');
    const available = quantityOnHand(db, itemId);
    if (available < body.quantity) return insufficient(available, body.quantity);

    const notes = body.notes?.trim() || 'Manual withdrawal';
    const consumed = consumeFefo(db, itemId, body.quantity);
    const detail = consumed.map(c => `batch#${c.batch_id}(${c.quantity})`).join(', ');
    db.insert('Stock_Transactions', {
      item_id: itemId, user_id: user.userId, transaction_type: 'Withdraw', quantity: body.quantity,
      notes: `${notes}. Consumed: ${detail}`.substring(0, 500),
    });

    const item = db.tables.Inventory_Items.find(i => i.item_id === itemId);
    const newTotal = quantityOnHand(db, itemId);
    if (item && newTotal <= item.low_stock_limit) {
      notifyUsers(db, managerAndAdminIds(db), {
        type: 'inventory.low_stock',
        title: `Low Stock: ${item.item_name}`,
        message: `Low stock: "${item.item_name}" — ${newTotal} unit(s) remaining (limit: ${item.low_stock_limit})`,
        linkTo: buildLinkTo('inventory.low_stock', null, 'InventoryManager'),
        relatedEntityType: 'Inventory_Items',
      });
    }
    return ok({ consumed }, 'Withdrawal completed');
  });

  r.get('/inventory/items/:id/batches', MANAGE, ({ params, db }) => {
    const itemId = Number(params['id']);
    if (!itemId) return badRequest('Invalid item id');
    return ok(activeBatches(db, itemId).map(b => ({
      batch_id: b.batch_id,
      quantity_remaining: b.quantity_remaining,
      expire_date: sql23(b.expire_date),
      deposited_at: sql127(b.deposited_at),
    })));
  });

  r.get('/inventory/latest-activity', MANAGE, ({ query, db }) => {
    const raw = parseInt(query['limit'] ?? '5', 10);
    const limit = Math.min(20, Math.max(1, isNaN(raw) ? 5 : raw));
    const transactions = [...db.tables.Stock_Transactions]
      .filter(t => userById(db, t.user_id))
      .sort(byDesc('time_stamp')).slice(0, limit)
      .map(t => {
        const item = db.tables.Inventory_Items.find(i => i.item_id === t.item_id);
        return {
          source_id: t.transaction_id,
          source_kind: 'transaction',
          item_id: t.item_id,
          item_name: item?.item_name ?? '[Deleted Item]',
          category: item?.category ?? null,
          action: t.transaction_type,
          quantity: t.quantity,
          occurred_at: sql127(t.time_stamp),
          performed_by_email: userById(db, t.user_id)!.email,
        };
      });
    const removals = [...db.tables.Removed_Inventory_Items]
      .filter(x => userById(db, x.removed_by))
      .sort(byDesc('removed_at')).slice(0, limit)
      .map(x => ({
        source_id: x.removal_id,
        source_kind: 'removal',
        item_id: x.item_id,
        item_name: x.item_name,
        category: x.category,
        action: x.removal_reason,
        quantity: x.quantity_removed,
        occurred_at: sql127(x.removed_at),
        performed_by_email: userById(db, x.removed_by)!.email,
      }));
    const merged = [...transactions, ...removals]
      .sort((a, b) => new Date(b.occurred_at!).getTime() - new Date(a.occurred_at!).getTime());
    return ok(merged.slice(0, limit));
  });

  r.get('/inventory/activity-history', MANAGE, ({ query, db }) => {
    const { offset, page } = pagination(query);
    const raw = parseInt(query['limit'] ?? '100', 10);
    const limit = Math.min(10_000, Math.max(1, isNaN(raw) ? 100 : raw));
    const all = [...db.tables.Stock_Transactions].filter(t => userById(db, t.user_id)).sort(byDesc('time_stamp'));
    const rows = all.slice(offset, offset + limit).map(t => {
      const item = db.tables.Inventory_Items.find(i => i.item_id === t.item_id);
      return {
        transaction_id: t.transaction_id,
        item_id: t.item_id,
        item_name: item?.item_name ?? '[Deleted Item]',
        category: item?.category ?? null,
        expire_date: soonestExpiry(db, t.item_id),
        quantity: t.quantity,
        transaction_type: t.transaction_type,
        time_stamp: sql127(t.time_stamp),
        performed_by: userById(db, t.user_id)!.email,
        notes: t.notes,
      };
    });
    return ok({ rows, total: db.tables.Stock_Transactions.length, page, limit });
  });

  r.get('/inventory/transactions', MANAGE, ({ query, db }) => {
    const { limit, offset, page } = pagination(query);
    const all = [...db.tables.Stock_Transactions]
      .map(t => ({ t, item: db.tables.Inventory_Items.find(i => i.item_id === t.item_id), u: userById(db, t.user_id) }))
      .filter(({ item, u }) => item && u)
      .sort((a, b) => b.t.time_stamp.localeCompare(a.t.time_stamp));
    const rows = all.slice(offset, offset + limit).map(({ t, item, u }) => ({
      transaction_id: t.transaction_id,
      transaction_type: t.transaction_type,
      quantity: t.quantity,
      time_stamp: t.time_stamp,
      item_id: t.item_id,
      item_name: item!.item_name,
      category: item!.category,
      user_email: u!.email,
    }));
    return ok({ rows, total: db.tables.Stock_Transactions.length, page, limit });
  });
}
