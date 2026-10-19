// /tickets — mirrors ticket.routes.ts, ticket.service.ts and ticket.repository.ts.
import { DemoRouter, ok, created, badRequest, forbidden, notFound, pagination } from '../router';
import { DemoDb } from '../db';
import { Row } from '../data/schema';
import { now } from '../data/time';
import { ALL_ROLES, audit, buildLinkTo, like, notifyRole, notifyUsers, roleName, userById } from '../helpers';

function typeName(db: DemoDb, t: Row): string | null {
  return db.tables.Ticket_Type.find(x => x.ticket_type_id === t.ticket_type_id)?.type_name ?? null;
}

function personName(db: DemoDb, userId: number): string | null {
  const e = db.tables.Employee.find(x => x.user_id === userId);
  if (e) return `${e.first_name} ${e.last_name}`;
  const s = db.tables.Student.find(x => x.user_id === userId);
  return s ? `${s.first_name} ${s.last_name}` : null;
}

function adminRow(db: DemoDb, t: Row): Row {
  const u = userById(db, t.user_id);
  return {
    ticket_id: t.ticket_id,
    details: t.details,
    type_name: typeName(db, t),
    status: t.status,
    created_at: t.created_at,
    updated_at: t.updated_at,
    submitted_by_name: personName(db, t.user_id),
    role_name: u ? roleName(db, u.role_id) : null,
    submitter_user_id: t.user_id,
  };
}

function addMessage(db: DemoDb, ticketId: number, senderUserId: number, text: string, isResolution: boolean): void {
  db.insert('Ticket_Messages', {
    ticket_id: ticketId,
    sender_user_id: senderUserId,
    message_text: text,
    is_resolution_note: isResolution,
  });
  const t = db.tables.Tickets.find(x => x.ticket_id === ticketId);
  if (t) t.updated_at = now();
  db.save();
}

function detail(db: DemoDb, ticketId: number): Row | null {
  const t = db.tables.Tickets.find(x => x.ticket_id === ticketId && userById(db, x.user_id));
  if (!t) return null;
  const messages = db.tables.Ticket_Messages
    .filter(m => m.ticket_id === ticketId && userById(db, m.sender_user_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(m => ({
      message_id: m.message_id,
      message_text: m.message_text,
      is_resolution_note: !!m.is_resolution_note,
      created_at: m.created_at,
      sender_user_id: m.sender_user_id,
      sender_name: personName(db, m.sender_user_id),
      sender_role: roleName(db, userById(db, m.sender_user_id)!.role_id),
    }));
  return { ...adminRow(db, t), messages };
}

export function registerTickets(r: DemoRouter): void {
  r.get('/tickets/types', ALL_ROLES, ({ db }) => {
    const groups = new Map<string, Row>();
    for (const t of db.tables.Ticket_Type.filter(x => x.is_active)) {
      const g = groups.get(t.type_name);
      if (!g) groups.set(t.type_name, { ticket_type_id: t.ticket_type_id, type_name: t.type_name, order: t.display_order });
      else {
        g['ticket_type_id'] = Math.min(g['ticket_type_id'], t.ticket_type_id);
        g['order'] = Math.min(g['order'], t.display_order);
      }
    }
    return ok([...groups.values()]
      .sort((a, b) => a['order'] - b['order'] || a['ticket_type_id'] - b['ticket_type_id'])
      .map(g => ({ ticket_type_id: g['ticket_type_id'], type_name: g['type_name'] })));
  });

  r.get('/tickets', ALL_ROLES, ({ user, query, db }) => {
    const { limit, offset, page } = pagination(query);
    const search = query['search'] || undefined;
    const status = query['statusFilter'] && query['statusFilter'] !== 'All' ? query['statusFilter'] : undefined;
    const subject = query['subjectFilter'] && query['subjectFilter'] !== 'All' ? query['subjectFilter'] : undefined;

    if (user.role === 'Admin') {
      const all = db.tables.Tickets
        .filter(t => userById(db, t.user_id))
        .filter(t => !status || t.status === status)
        .filter(t => !search || like(typeName(db, t), search) || like(personName(db, t.user_id), search) ||
          like(t.details, search) || like(t.ticket_id, search))
        .sort((a, b) => b.ticket_id - a.ticket_id);
      return ok({ rows: all.slice(offset, offset + limit).map(t => adminRow(db, t)), total: all.length, page, limit });
    }

    const all = db.tables.Tickets
      .filter(t => t.user_id === user.userId)
      .filter(t => !status || t.status === status)
      .filter(t => !subject || typeName(db, t) === subject)
      .filter(t => !search || like(typeName(db, t), search) || like(t.details, search) || like(t.ticket_id, search))
      .sort((a, b) => b.ticket_id - a.ticket_id);
    const rows = all.slice(offset, offset + limit).map(t => ({
      ticket_id: t.ticket_id,
      details: t.details,
      type_name: typeName(db, t),
      status: t.status,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));
    return ok({ rows, total: all.length, page, limit });
  });

  r.post('/tickets', ALL_ROLES, ({ user, body, db }) => {
    if (!Number.isInteger(body?.ticketTypeId) || body.ticketTypeId <= 0) return badRequest('Expected number, received ' + typeof body?.ticketTypeId);
    if (typeof body?.details !== 'string' || !body.details) return badRequest('String must contain at least 1 character(s)');
    const t = db.insert('Tickets', { user_id: user.userId, ticket_type_id: body.ticketTypeId, details: body.details });
    notifyRole(db, 'Admin', {
      type: 'ticket.created',
      title: 'New support ticket opened',
      message: 'A user has submitted a new support ticket.',
      linkTo: buildLinkTo('ticket.created', t.ticket_id, 'Admin'),
      relatedEntityType: 'Tickets',
      relatedEntityId: t.ticket_id,
    });
    audit(db, user, 'Ticket_Create', 'Ticket submitted', `New ticket submitted by user #${user.userId}`);
    return created(null, 'Ticket submitted');
  });

  r.get('/tickets/:id', ALL_ROLES, ({ user, params, db }) => {
    const d = detail(db, parseInt(params['id'], 10));
    if (!d) return notFound('Ticket not found');
    if (user.role !== 'Admin' && d['submitter_user_id'] !== user.userId) return notFound('Ticket not found');
    return ok(d);
  });

  r.post('/tickets/:id/reply', ALL_ROLES, ({ user, params, body, db }) => {
    if (typeof body?.messageText !== 'string' || !body.messageText) return badRequest('String must contain at least 1 character(s)');
    const ticketId = parseInt(params['id'], 10);
    const isAdmin = user.role === 'Admin';
    const t = db.tables.Tickets.find(x => x.ticket_id === ticketId);
    if (!isAdmin) {
      if (!t || t.user_id !== user.userId) return notFound('Ticket not found');
      if (t.status === 'Resolved') return forbidden('Cannot reply to a resolved ticket');
    }
    addMessage(db, ticketId, user.userId, body.messageText, false);
    if (isAdmin) {
      if (t && t.status === 'Open') {
        t.status = 'In Progress';
        t.updated_at = now();
      }
      if (t && t.user_id !== user.userId) {
        notifyUsers(db, [t.user_id], {
          type: 'ticket.reply', title: 'New reply on your ticket',
          message: 'An administrator has replied to your support ticket.',
          relatedEntityType: 'Tickets', relatedEntityId: ticketId,
        });
      }
      audit(db, user, 'Ticket_Update', 'Ticket marked as In Progress', `Ticket #${ticketId} set to In Progress by admin reply`);
    } else {
      notifyRole(db, 'Admin', {
        type: 'ticket.reply', title: 'New reply on a support ticket',
        message: 'A user has replied to a support ticket.',
        linkTo: buildLinkTo('ticket.reply', ticketId, 'Admin'),
        relatedEntityType: 'Tickets', relatedEntityId: ticketId,
      });
    }
    return created(null, 'Reply sent');
  });

  r.patch('/tickets/:id/resolve', ['Admin'], ({ user, params, body, db }) => {
    const ticketId = parseInt(params['id'], 10);
    if (body?.note !== undefined && typeof body.note !== 'string') return badRequest('Expected string, received ' + typeof body.note);
    if (body?.note?.trim()) addMessage(db, ticketId, user.userId, body.note.trim(), true);
    const t = db.tables.Tickets.find(x => x.ticket_id === ticketId);
    if (t) {
      t.status = 'Resolved';
      t.updated_at = now();
      db.save();
      notifyUsers(db, [t.user_id], {
        type: 'ticket.resolved', title: 'Support ticket resolved',
        message: 'Your support ticket has been marked as resolved.',
        relatedEntityType: 'Tickets', relatedEntityId: ticketId,
      });
    }
    audit(db, user, 'Ticket_Update', 'Ticket resolved', `Ticket #${params['id']} resolved`);
    return ok(null, 'Ticket resolved');
  });
}
