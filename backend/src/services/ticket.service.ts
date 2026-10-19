// Business logic for the support ticket lifecycle.
import {
  getTicketTypes,
  createTicket,
  getTicketsByUser,
  getAllTickets,
  getTicketById,
  getTicketMessages,
  addTicketMessage,
  markTicketInProgress,
  resolveTicket,
} from '../repositories/ticket.repository';
import {
  getTicketOwnerUserId,
} from '../repositories/notification.repository';
import { dispatch, dispatchToRole } from './notification.service';
import { buildLinkTo } from './notifications.links';

export async function listTicketTypesService() {
  return getTicketTypes();
}

export async function createTicketService(userId: number, ticketTypeId: number, details: string) {
  await createTicket(userId, ticketTypeId, details);

  // Notify all Admins that a new ticket has been opened.
  try {
    // Fetch the created ticket to get its ID for the deep-link.
    // getAllTickets sorted DESC — the newest row is the ticket we just created.
    const { rows } = await getAllTickets(1, 0);
    const newTicket = (rows[0] as any);
    const ticketId  = newTicket?.ticket_id ?? null;
    await dispatchToRole('Admin', {
      type:              'ticket.created',
      title:             'New support ticket opened',
      message:           'A user has submitted a new support ticket.',
      linkTo:            ticketId ? buildLinkTo('ticket.created', ticketId, 'Admin') : null,
      relatedEntityType: 'Tickets',
      relatedEntityId:   ticketId,
    });
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'ticket.created', err });
  }
}

export async function listMyTicketsService(
  userId: number,
  limit: number,
  offset: number,
  search?: string,
  statusFilter?: string,
  subjectFilter?: string,
) {
  return getTicketsByUser(userId, limit, offset, search, statusFilter, subjectFilter);
}

export async function listAllTicketsService(
  limit: number,
  offset: number,
  search?: string,
  statusFilter?: string,
) {
  return getAllTickets(limit, offset, search, statusFilter);
}

export async function getTicketDetailService(ticketId: number) {
  const [ticket, messages] = await Promise.all([
    getTicketById(ticketId),
    getTicketMessages(ticketId),
  ]);
  if (!ticket) return null;
  return { ...(ticket as object), messages };
}

// Ticket lifecycle: Open → In Progress → Resolved. Users open tickets (status
// defaults to 'Open'); the first admin reply bumps status to 'In Progress';
// admin resolves to end the conversation. Non-admin replies never change status.
export async function replyToTicketService(
  ticketId: number,
  senderUserId: number,
  messageText: string,
  isResolutionNote: boolean,
  isAdminSender: boolean,
) {
  await addTicketMessage(ticketId, senderUserId, messageText, isResolutionNote);
  // markTicketInProgress is a no-op if status is already past 'Open',
  // so this is safe to call on every admin reply.
  if (isAdminSender) await markTicketInProgress(ticketId);

  try {
    if (isAdminSender) {
      // Admin replied → notify the ticket owner
      const ownerUserId = await getTicketOwnerUserId(ticketId);
      if (ownerUserId && ownerUserId !== senderUserId) {
        await dispatch({
          userId:            ownerUserId,
          type:              'ticket.reply',
          title:             'New reply on your ticket',
          message:           'An administrator has replied to your support ticket.',
          linkTo:            null,
          relatedEntityType: 'Tickets',
          relatedEntityId:   ticketId,
        });
      }
    } else {
      // User replied → notify all Admins
      await dispatchToRole('Admin', {
        type:              'ticket.reply',
        title:             'New reply on a support ticket',
        message:           'A user has replied to a support ticket.',
        linkTo:            buildLinkTo('ticket.reply', ticketId, 'Admin'),
        relatedEntityType: 'Tickets',
        relatedEntityId:   ticketId,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'ticket.reply', ticketId, err });
  }
}

// Optionally attaches a final "resolution note" message, then flips the ticket
// to 'Resolved'. A blank/whitespace note is ignored so the thread stays clean.
export async function resolveTicketService(
  ticketId: number,
  senderUserId: number,
  note: string | null,
) {
  if (note?.trim()) {
    await addTicketMessage(ticketId, senderUserId, note.trim(), true);
  }
  await resolveTicket(ticketId);

  // Notify the ticket owner that their issue has been resolved.
  try {
    const ownerUserId = await getTicketOwnerUserId(ticketId);
    if (ownerUserId) {
      await dispatch({
        userId:            ownerUserId,
        type:              'ticket.resolved',
        title:             'Support ticket resolved',
        message:           'Your support ticket has been marked as resolved.',
        linkTo:            null,
        relatedEntityType: 'Tickets',
        relatedEntityId:   ticketId,
      });
    }
  } catch (err) {
    console.warn('notifications.dispatch.failed', { type: 'ticket.resolved', ticketId, err });
  }
}
