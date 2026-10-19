import { Request, Response } from 'express';
import { parsePagination } from '../utils/pagination.util';
import { success, created, notFound, serverError, forbidden } from '../utils/response.util';
import { logAuditEvent } from '../services/audit.service';
import {
  listTicketTypesService,
  createTicketService,
  listMyTicketsService,
  listAllTicketsService,
  getTicketDetailService,
  replyToTicketService,
  resolveTicketService,
} from '../services/ticket.service';

export async function listTypes(_req: Request, res: Response): Promise<void> {
  try {
    const types = await listTicketTypesService();
    success(res, types);
  } catch {
    serverError(res);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId       = req.user!.userId;
    const { ticketTypeId, details } = req.body;
    await createTicketService(userId, ticketTypeId, details);
    created(res, null, 'Ticket submitted');
  } catch {
    serverError(res);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const role   = req.user!.role;
    const userId = req.user!.userId;

    if (role === 'Admin') {
      const search       = typeof req.query['search']       === 'string' ? req.query['search']       : undefined;
      const statusFilter = typeof req.query['statusFilter'] === 'string' ? req.query['statusFilter'] : undefined;
      const result = await listAllTicketsService(limit, offset, search, statusFilter);
      success(res, { ...result, page, limit });
    } else {
      const search         = typeof req.query['search']         === 'string' ? req.query['search']         : undefined;
      const statusFilter   = typeof req.query['statusFilter']   === 'string' ? req.query['statusFilter']   : undefined;
      const subjectFilter  = typeof req.query['subjectFilter']  === 'string' ? req.query['subjectFilter']  : undefined;
      const result = await listMyTicketsService(userId, limit, offset, search, statusFilter, subjectFilter);
      success(res, { ...result, page, limit });
    }
  } catch {
    serverError(res);
  }
}

export async function getDetail(req: Request, res: Response): Promise<void> {
  try {
    const ticketId = parseInt(req.params['id'], 10);
    const role     = req.user!.role;
    const userId   = req.user!.userId;

    const detail = await getTicketDetailService(ticketId);
    if (!detail) { notFound(res, 'Ticket not found'); return; }

    if (role !== 'Admin' && (detail as any).submitter_user_id !== userId) {
      notFound(res, 'Ticket not found'); return;
    }

    success(res, detail);
  } catch {
    serverError(res);
  }
}

export async function reply(req: Request, res: Response): Promise<void> {
  try {
    const ticketId     = parseInt(req.params['id'], 10);
    const senderUserId = req.user!.userId;
    const role         = req.user!.role;
    const { messageText } = req.body;

    // Non-admins can only reply on their OWN tickets and only while the ticket
    // is still open. We return 404 (not 403) for the "not yours" case to avoid
    // leaking existence of tickets belonging to other users.
    if (role !== 'Admin') {
      const detail = await getTicketDetailService(ticketId);
      if (!detail || (detail as any).submitter_user_id !== senderUserId) {
        notFound(res, 'Ticket not found'); return;
      }
      if ((detail as any).status === 'Resolved') {
        forbidden(res, 'Cannot reply to a resolved ticket'); return;
      }
    }

    await replyToTicketService(ticketId, senderUserId, messageText, false, role === 'Admin');
    if (role === 'Admin') {
      logAuditEvent({
        userId: senderUserId,
        eventType: 'Ticket_Update',
        eventDescription: 'Ticket marked as In Progress',
        details: `Ticket #${ticketId} set to In Progress by admin reply`,
        operationStatus: 'Success',
      }).catch(err => console.error('[AUDIT]', err));
    }
    created(res, null, 'Reply sent');
  } catch {
    serverError(res);
  }
}

export async function resolve(req: Request, res: Response): Promise<void> {
  try {
    const ticketId     = parseInt(req.params['id'], 10);
    const senderUserId = req.user!.userId;
    const { note }     = req.body;
    await resolveTicketService(ticketId, senderUserId, note ?? null);
    success(res, null, 'Ticket resolved');
  } catch {
    serverError(res);
  }
}
