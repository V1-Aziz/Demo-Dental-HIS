import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TicketService } from '../../../services/ticket.service';
import { timeAgo } from '../../../utils/time.util';

type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

interface TicketMessage {
  message_id:         number;
  sender_user_id:     number;
  sender_name:        string;
  sender_role:        string;
  message_text:       string;
  is_resolution_note: boolean;
  created_at:         string;
}

interface Ticket {
  id:              number;
  subject:         string;
  details:         string;
  status:          TicketStatus;
  submittedBy:     string;
  submittedByRole: string;
  createdAt:       string;
  lastUpdated:     string;
  messages?:       TicketMessage[];
}

@Component({
  standalone: false,
  selector: 'app-admin-tickets',
  templateUrl: './admin-tickets.component.html',
})
export class AdminTicketsComponent implements OnInit, OnDestroy {
  tickets:         Ticket[]      = [];
  searchTerm       = '';
  selectedTicket:  Ticket | null = null;
  drawerLoading    = false;
  replyText        = '';
  sendingReply     = false;
  showResolveModal = false;
  resolveNote      = '';
  resolving        = false;

  filterPopupOpen = false;
  draft   = { status: 'All' };
  applied = { status: 'All' };

  get hasActiveFilters(): boolean { return this.applied.status !== 'All'; }
  openFilterPopup():  void { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }
  applyFilters(): void { this.applied = { ...this.draft }; this.filterPopupOpen = false; }
  clearAllFilters(): void { this.draft = { status: 'All' }; this.applied = { status: 'All' }; this.filterPopupOpen = false; }

  /** Tracks the active getTicketDetail subscription — cancelled before each new fetch to prevent stale responses overwriting fresh ones. */
  private drawerSub?: Subscription;

  constructor(private ticketService: TicketService) {}

  ngOnInit(): void {
    this.loadTickets();
  }

  ngOnDestroy(): void {
    this.drawerSub?.unsubscribe();
  }

  loadTickets(): void {
    this.ticketService.getAllTickets().subscribe({
      next: (res: any) => {
        this.tickets = (res.data?.rows ?? []).map((r: any) => ({
          id:              r.ticket_id,
          subject:         r.type_name         ?? '—',
          details:         r.details           ?? '',
          status:          (r.status           ?? 'Open') as TicketStatus,
          submittedBy:     r.submitted_by_name ?? '—',
          submittedByRole: r.role_name         ?? '',
          createdAt:       timeAgo(r.created_at),
          lastUpdated:     timeAgo(r.updated_at),
        }));
      },
      error: () => { this.tickets = []; },
    });
  }

  get filteredTickets(): Ticket[] {
    return this.tickets.filter(t => {
      const matchesStatus = this.applied.status === 'All' || t.status === this.applied.status;
      const term          = this.searchTerm.toLowerCase();
      const matchesSearch = !term
        || t.subject.toLowerCase().includes(term)
        || t.submittedBy.toLowerCase().includes(term)
        || t.details.toLowerCase().includes(term)
        || String(t.id).includes(term);
      return matchesStatus && matchesSearch;
    });
  }

  openDrawer(ticket: Ticket): void {
    if (this.selectedTicket?.id === ticket.id) {
      this.closeDrawer();
      return;
    }
    this.drawerSub?.unsubscribe();
    this.selectedTicket   = { ...ticket, messages: [] };
    this.replyText        = '';
    this.showResolveModal = false;
    this.drawerLoading    = true;

    this.drawerSub = this.ticketService.getTicketDetail(ticket.id).subscribe({
      next: (res: any) => {
        const d = res.data;
        this.selectedTicket = {
          ...ticket,
          status:   (d.status ?? ticket.status) as TicketStatus,
          messages: this.mapMessages(d.messages ?? []),
        };
        this.drawerLoading = false;
      },
      error: () => { this.drawerLoading = false; },
    });
  }

  closeDrawer(): void {
    this.drawerSub?.unsubscribe();
    this.selectedTicket   = null;
    this.replyText        = '';
    this.showResolveModal = false;
  }

  private reloadDrawer(): void {
    if (!this.selectedTicket) return;
    this.drawerSub?.unsubscribe();
    const snapshot = this.selectedTicket;

    this.drawerSub = this.ticketService.getTicketDetail(snapshot.id).subscribe({
      next: (res: any) => {
        const d       = res.data;
        const updated: Ticket = {
          ...snapshot,
          status:      (d.status ?? snapshot.status) as TicketStatus,
          lastUpdated: timeAgo(d.updated_at),
          messages:    this.mapMessages(d.messages ?? []),
        };
        this.selectedTicket = updated;
        const listItem = this.tickets.find(x => x.id === snapshot.id);
        if (listItem) {
          listItem.status      = updated.status;
          listItem.lastUpdated = updated.lastUpdated;
        }
      },
    });
  }

  private mapMessages(raw: any[]): TicketMessage[] {
    return raw.map((m: any) => ({
      message_id:         m.message_id,
      sender_user_id:     m.sender_user_id,
      sender_name:        m.sender_name  ?? '—',
      sender_role:        m.sender_role  ?? '',
      message_text:       m.message_text,
      is_resolution_note: !!m.is_resolution_note,
      created_at:         m.created_at,
    }));
  }

  sendReply(): void {
    if (this.sendingReply || !this.replyText.trim() || !this.selectedTicket) return;
    const text = this.replyText.trim();
    this.sendingReply = true;
    this.replyText    = '';
    this.ticketService.replyToTicket(this.selectedTicket.id, text).subscribe({
      next: () => {
        this.sendingReply = false;
        this.reloadDrawer();
      },
      error: () => {
        this.sendingReply = false;
        this.replyText    = text; // restore on failure
      },
    });
  }

  confirmResolve(): void {
    if (!this.selectedTicket || this.resolving) return;
    this.resolving = true;
    this.ticketService.resolveTicket(this.selectedTicket.id, this.resolveNote || undefined).subscribe({
      next: () => {
        this.resolving        = false;
        this.showResolveModal = false;
        this.resolveNote      = '';
        this.reloadDrawer();
      },
      error: () => { this.resolving = false; },
    });
  }

  trackById(_index: number, ticket: Ticket): number {
    return ticket.id;
  }

  trackByMsgId(_index: number, msg: TicketMessage): number {
    return msg.message_id;
  }

  statusClass(status: TicketStatus): string {
    const map: Record<TicketStatus, string> = {
      'Open':        'bg-yellow-100 text-yellow-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      'Resolved':    'bg-green-100 text-green-800',
      'Closed':      'bg-gray-100 text-gray-700',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  timeAgo = timeAgo;
}
