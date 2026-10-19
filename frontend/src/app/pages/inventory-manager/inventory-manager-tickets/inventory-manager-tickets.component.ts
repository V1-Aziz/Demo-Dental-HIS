import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { TicketService } from '../../../services/ticket.service';
import { timeAgo } from '../../../utils/time.util';

type TicketStatus = 'Open' | 'In Progress' | 'Resolved';

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
  id:          number;
  subject:     string;
  details:     string;
  status:      TicketStatus;
  createdAt:   string;
  lastUpdated: string;
  messages?:   TicketMessage[];
}

@Component({
  standalone: false,
  selector: 'app-inventory-manager-tickets',
  templateUrl: './inventory-manager-tickets.component.html',
})
export class InventoryManagerTicketsComponent implements OnInit, OnDestroy {
  isModalOpen        = false;
  ticketTypes: { id: number; name: string }[] = [];
  newTicketTypeId:   number | null = null;
  newTicketDetails   = '';
  submittingTicket   = false;
  tickets: Ticket[] = [];
  selectedTicket:  Ticket | null = null;
  drawerLoading    = false;
  replyText        = '';
  sendingReply     = false;

  // ── Pagination ────────────────────────────────────────────────────
  currentPage     = 1;
  pageSize        = 10;
  totalTickets    = 0;
  pageSizeOptions = [10, 25, 50];

  // ── Search ───────────────────────────────────────────────────────
  searchTerm = '';

  // ── Filter popup ─────────────────────────────────────────────────
  filterPopupOpen = false;
  draft   = { status: 'All', subject: 'All' };
  applied = { status: 'All', subject: 'All' };

  get hasActiveFilters(): boolean { return this.applied.status !== 'All' || this.applied.subject !== 'All'; }

  openFilterPopup():  void { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }

  applyFilters(): void {
    this.applied = { ...this.draft };
    this.currentPage = 1;
    this.filterPopupOpen = false;
    this.loadTickets();
  }

  clearAllFilters(): void {
    this.draft   = { status: 'All', subject: 'All' };
    this.applied = { status: 'All', subject: 'All' };
    this.currentPage = 1;
    this.filterPopupOpen = false;
    this.loadTickets();
  }

  get totalPages():     number { return Math.max(1, Math.ceil(this.totalTickets / this.pageSize)); }
  get pageRangeStart(): number { return this.totalTickets === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd():   number { return Math.min(this.currentPage * this.pageSize, this.totalTickets); }

  private drawerSub?: Subscription;
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(private ticketService: TicketService) {}

  ngOnInit(): void {
    this.loadTickets();
    this.ticketService.getTicketTypes().subscribe({
      next: (res: any) => {
        this.ticketTypes = (res.data ?? []).map((t: any) => ({ id: t.ticket_type_id, name: t.type_name }));
      },
    });
  }

  ngOnDestroy(): void {
    this.drawerSub?.unsubscribe();
    this.stopPolling();
  }

  private loadTickets(): void {
    this.ticketService.getAllTickets({
      page:          this.currentPage,
      limit:         this.pageSize,
      search:        this.searchTerm,
      statusFilter:  this.applied.status,
      subjectFilter: this.applied.subject,
    }).subscribe({
      next: (res: any) => {
        const rows = res.data?.rows ?? res.data ?? [];
        this.totalTickets = res.data?.total ?? rows.length;
        this.tickets = rows.map((r: any) => ({
          id:          r.ticket_id,
          subject:     r.type_name ?? '—',
          details:     r.details   ?? '',
          status:      (r.status   ?? 'Open') as TicketStatus,
          createdAt:   timeAgo(r.created_at),
          lastUpdated: timeAgo(r.updated_at),
        }));
      },
      error: () => { this.tickets = []; this.totalTickets = 0; },
    });
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages) { this.currentPage = p; this.loadTickets(); }
  }

  onPageSizeChange(s: number | string): void { this.pageSize = +s; this.currentPage = 1; this.loadTickets(); }
  onSearchChange(): void { this.currentPage = 1; this.loadTickets(); }

  openDrawer(ticket: Ticket): void {
    if (this.selectedTicket?.id === ticket.id) { this.closeDrawer(); return; }
    this.stopPolling();
    this.drawerSub?.unsubscribe();
    this.selectedTicket = { ...ticket, messages: [] };
    this.replyText      = '';
    this.drawerLoading  = true;

    this.drawerSub = this.ticketService.getTicketDetail(ticket.id).subscribe({
      next: (res: any) => {
        const d = res.data;
        this.selectedTicket = {
          ...ticket,
          status:   (d.status ?? ticket.status) as TicketStatus,
          messages: this.mapMessages(d.messages ?? []),
        };
        this.drawerLoading = false;
        if (this.selectedTicket.status !== 'Resolved') this.startPolling();
      },
      error: () => { this.drawerLoading = false; },
    });
  }

  closeDrawer(): void {
    this.stopPolling();
    this.drawerSub?.unsubscribe();
    this.selectedTicket = null;
    this.replyText      = '';
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.selectedTicket || this.selectedTicket.status === 'Resolved') {
        this.stopPolling(); return;
      }
      this.reloadDrawer();
    }, 20_000);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) { clearInterval(this.pollTimer); this.pollTimer = undefined; }
  }

  private reloadDrawer(): void {
    if (!this.selectedTicket) return;
    this.drawerSub?.unsubscribe();
    const snapshot = this.selectedTicket;

    this.drawerSub = this.ticketService.getTicketDetail(snapshot.id).subscribe({
      next: (res: any) => {
        const d = res.data;
        const updated: Ticket = {
          ...snapshot,
          status:      (d.status ?? snapshot.status) as TicketStatus,
          lastUpdated: timeAgo(d.updated_at),
          messages:    this.mapMessages(d.messages ?? []),
        };
        this.selectedTicket = updated;
        const listItem = this.tickets.find(x => x.id === snapshot.id);
        if (listItem) { listItem.status = updated.status; listItem.lastUpdated = updated.lastUpdated; }
        if (updated.status === 'Resolved') this.stopPolling();
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
      next: () => { this.sendingReply = false; this.reloadDrawer(); },
      error: () => { this.sendingReply = false; this.replyText = text; },
    });
  }

  submitTicket(): void {
    if (!this.newTicketTypeId || !this.newTicketDetails.trim() || this.submittingTicket) return;
    this.submittingTicket = true;
    this.ticketService.createTicket(this.newTicketTypeId, this.newTicketDetails.trim()).subscribe({
      next: () => {
        this.submittingTicket = false; this.isModalOpen = false;
        this.newTicketTypeId = null;   this.newTicketDetails = '';
        this.currentPage = 1; this.loadTickets();
      },
      error: () => { this.submittingTicket = false; },
    });
  }

  trackById(_i: number, t: Ticket): number          { return t.id; }
  trackByMsgId(_i: number, m: TicketMessage): number { return m.message_id; }

  statusClass(status: TicketStatus): string {
    const map: Record<TicketStatus, string> = {
      'Open':        'bg-yellow-100 text-yellow-700',
      'In Progress': 'bg-blue-100 text-blue-700',
      'Resolved':    'bg-green-100 text-green-700',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  timeAgo = timeAgo;
}
