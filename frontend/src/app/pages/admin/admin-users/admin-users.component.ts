import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { UserService } from '../../../services/user.service';
import { TicketService } from '../../../services/ticket.service';
import { saudiPhoneValidator } from '../../../shared/validators/saudi-phone.validator';
import { timeAgo } from '../../../utils/time.util';

type Tab = 'users' | 'tickets';
type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';
type StatusFilter  = 'All' | 'Open' | 'In Progress' | 'Resolved';

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
  selector: 'app-admin-users',
  templateUrl: './admin-users.component.html',
})
export class AdminUsersComponent implements OnInit, OnDestroy {
  activeTab:   Tab    = 'users';
  readonly usersTabs = [
    { value: 'users',   title: 'User Operations',   subtitle: 'Manage active staff members' },
    { value: 'tickets', title: 'Ticket Operations', subtitle: 'View and manage support requests' },
  ];
  isModalOpen  = false;
  searchTerm   = '';
  users: any[] = [];

  // ── Edit User modal ───────────────────────────────────────────
  isEditModalOpen = false;
  editingUser:    any = null;
  savingUser      = false;
  editLoading     = false;
  editError:      string | null = null;
  editForm!:      FormGroup;
  availableRoles: { role_id: number; role_name: string }[] = [];

  readonly contactTypes = ['Primary', 'Work', 'Secondary', 'Emergency'];

  // ── Ticket state ──────────────────────────────────────────────
  tickets:         Ticket[]      = [];
  ticketFilter:    StatusFilter  = 'All';
  selectedTicket:  Ticket | null = null;
  drawerLoading    = false;
  replyText        = '';
  sendingReply     = false;
  showResolveModal = false;
  resolveNote      = '';
  resolving        = false;

  // ── User pagination ───────────────────────────────────────────
  userCurrentPage = 1;
  userPageSize    = 10;
  totalUsers      = 0;

  // ── Ticket pagination ─────────────────────────────────────────
  currentPage     = 1;
  pageSize        = 10;
  totalTickets    = 0;
  pageSizeOptions = [10, 25, 50];

  private drawerSub?:          Subscription;
  private pollTimer?:          ReturnType<typeof setInterval>;
  private searchDebounce?:     ReturnType<typeof setTimeout>;
  private userSearchDebounce?: ReturnType<typeof setTimeout>;

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private ticketService: TicketService,
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadTickets();
    this.userService.getRoles().subscribe({
      next: (res: any) => { this.availableRoles = res.data?.roles ?? []; },
    });
  }

  ngOnDestroy(): void {
    this.drawerSub?.unsubscribe();
    this.stopPolling();
    clearTimeout(this.searchDebounce);
    clearTimeout(this.userSearchDebounce);
  }

  switchTab(tab: Tab): void {
    this.activeTab  = tab;
    this.searchTerm = '';
    if (tab === 'users') {
      this.closeDrawer();
      this.userCurrentPage = 1;
      this.loadUsers();
    } else {
      this.currentPage = 1;
      this.loadTickets();
    }
  }

  private loadUsers(): void {
    this.userService.getUsers({
      page:   this.userCurrentPage,
      limit:  this.userPageSize,
      search: this.searchTerm || undefined,
    }).subscribe({
      next: (res: any) => {
        this.totalUsers = res.data?.total ?? 0;
        this.users = (res.data?.rows ?? []).map((r: any) => ({
          id:         r.user_id,
          name:       r.full_name || r.email,
          email:      r.email,
          role:       r.role_name,
          status:     r.account_status ?? 'Active',
          lastActive: timeAgo(r.last_login),
          createdAt:  r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
        }));
      },
      error: () => { this.users = []; this.totalUsers = 0; },
    });
  }

  get userTotalPages(): number {
    return Math.max(1, Math.ceil(this.totalUsers / this.userPageSize));
  }

  get userPageRangeStart(): number {
    return this.totalUsers === 0 ? 0 : (this.userCurrentPage - 1) * this.userPageSize + 1;
  }

  get userPageRangeEnd(): number {
    return Math.min(this.userCurrentPage * this.userPageSize, this.totalUsers);
  }

  onUserSearchChange(): void {
    clearTimeout(this.userSearchDebounce);
    this.userSearchDebounce = setTimeout(() => {
      this.userCurrentPage = 1;
      this.loadUsers();
    }, 400);
  }

  goToUserPage(page: number): void {
    if (page < 1 || page > this.userTotalPages) return;
    this.userCurrentPage = page;
    this.loadUsers();
  }

  onUserPageSizeChange(size: number | string): void {
    this.userPageSize    = +size;
    this.userCurrentPage = 1;
    this.loadUsers();
  }

  private loadTickets(): void {
    this.ticketService.getAllTickets({
      page:         this.currentPage,
      limit:        this.pageSize,
      search:       this.searchTerm || undefined,
      statusFilter: this.ticketFilter,
    }).subscribe({
      next: (res: any) => {
        this.totalTickets = res.data?.total ?? 0;
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
      error: () => { this.tickets = []; this.totalTickets = 0; },
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalTickets / this.pageSize));
  }

  get pageRangeStart(): number {
    return this.totalTickets === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageRangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalTickets);
  }

  onSearchChange(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.currentPage = 1;
      this.loadTickets();
    }, 400);
  }

  onFilterChange(val: StatusFilter): void {
    this.ticketFilter = val;
    this.currentPage  = 1;
    this.loadTickets();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadTickets();
  }

  onPageSizeChange(size: number | string): void {
    this.pageSize    = +size;
    this.currentPage = 1;
    this.loadTickets();
  }

  openDrawer(ticket: Ticket): void {
    if (this.selectedTicket?.id === ticket.id) {
      this.closeDrawer();
      return;
    }
    this.stopPolling();
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
        if (this.selectedTicket.status !== 'Resolved') this.startPolling();
      },
      error: () => { this.drawerLoading = false; },
    });
  }

  closeDrawer(): void {
    this.stopPolling();
    this.drawerSub?.unsubscribe();
    this.selectedTicket   = null;
    this.replyText        = '';
    this.showResolveModal = false;
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.selectedTicket || this.selectedTicket.status === 'Resolved') {
        this.stopPolling();
        return;
      }
      this.reloadDrawer();
    }, 20_000);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
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

  // ── Edit User modal ───────────────────────────────────────────

  get contacts(): FormArray {
    return this.editForm.get('contacts') as FormArray;
  }

  openEditModal(user: any): void {
    this.editingUser    = user;
    this.editError      = null;
    this.editLoading    = true;
    this.isEditModalOpen = true;

    this.editForm = this.fb.group({
      email:          [user.email, [Validators.required, Validators.email, Validators.maxLength(255)]],
      role_id:        [null, Validators.required],
      account_status: [user.status ?? 'Active', Validators.required],
      contacts:       this.fb.array([]),
    });

    const matched = this.availableRoles.find(r => r.role_name === user.role);
    if (matched) this.editForm.patchValue({ role_id: matched.role_id });

    this.userService.getUserContacts(user.id).subscribe({
      next: (res: any) => {
        const list: any[] = res.data?.contacts ?? [];
        list.forEach(c => this.contacts.push(this.buildContactGroup(c)));
        this.editLoading = false;
      },
      error: () => { this.editLoading = false; },
    });
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.editingUser     = null;
    this.savingUser      = false;
    this.editError       = null;
  }

  private buildContactGroup(c?: any): FormGroup {
    return this.fb.group({
      contact_id:     [c?.contact_id   ?? null],
      contact_type:   [c?.contact_type ?? '', Validators.required],
      email:          [c?.email        ?? '', [Validators.required, Validators.email, Validators.maxLength(255)]],
      phone_number:   [c?.phone_number ?? '', [Validators.required, saudiPhoneValidator]],
      _pendingDelete: [false],
      _isEditing:     [!c],
      _snapshot:      [c ? { contact_type: c.contact_type, email: c.email, phone_number: c.phone_number } : null],
    });
  }

  addContact(): void {
    this.contacts.push(this.buildContactGroup());
  }

  editContact(i: number): void {
    const grp = this.contacts.at(i) as FormGroup;
    grp.patchValue({
      _isEditing: true,
      _snapshot: {
        contact_type: grp.value.contact_type,
        email:        grp.value.email,
        phone_number: grp.value.phone_number,
      },
    });
  }

  saveContact(i: number): void {
    const grp = this.contacts.at(i) as FormGroup;
    ['contact_type', 'email', 'phone_number'].forEach(f => grp.get(f)?.markAsTouched());
    const invalid = ['contact_type', 'email', 'phone_number'].some(f => grp.get(f)?.invalid);
    if (invalid) return;
    grp.patchValue({ _isEditing: false });
  }

  cancelContact(i: number): void {
    const grp = this.contacts.at(i) as FormGroup;
    if (!grp.value.contact_id) {
      this.contacts.removeAt(i);
    } else {
      const snap = grp.value._snapshot;
      grp.patchValue({ ...snap, _isEditing: false });
    }
  }

  markContactForDelete(i: number): void {
    this.contacts.at(i).patchValue({ _pendingDelete: true });
  }

  undoContactDelete(i: number): void {
    this.contacts.at(i).patchValue({ _pendingDelete: false });
  }

  saveEditUser(): void {
    if (this.savingUser || !this.editingUser || !this.editForm) return;

    // Block if any contact is in edit mode
    for (let i = 0; i < this.contacts.length; i++) {
      if (this.contacts.at(i).value._isEditing) {
        this.editError = 'Save or cancel your in-progress contact first.';
        return;
      }
    }

    this.editError  = null;
    const fv        = this.editForm.value;
    const allRows   = fv.contacts as any[];

    const upsert = allRows
      .filter(c => !c._pendingDelete)
      .map(c => ({
        ...(c.contact_id ? { contact_id: c.contact_id } : {}),
        contact_type: c.contact_type,
        email:        c.email,
        phone_number: c.phone_number,
      }));

    const del = allRows
      .filter(c => c._pendingDelete && c.contact_id)
      .map(c => c.contact_id);

    const payload = {
      account: {
        email:          fv.email,
        role_id:        +fv.role_id,
        account_status: fv.account_status,
      },
      contacts: { upsert, delete: del },
    };

    this.savingUser = true;
    this.userService.updateUserFull(this.editingUser.id, payload).subscribe({
      next: () => {
        this.savingUser = false;
        this.closeEditModal();
        this.loadUsers();
      },
      error: (err: any) => {
        this.savingUser = false;
        this.editError  = err.error?.error ?? 'Failed to save changes. Please try again.';
      },
    });
  }

  get saveDisabled(): boolean {
    if (this.savingUser || this.editLoading) return true;
    const f = this.editForm;
    if (!f) return true;
    return f.get('email')?.invalid === true || f.get('role_id')?.invalid === true;
  }

  typeBadge(type: string): string {
    const map: Record<string, string> = {
      Primary:   'bg-blue-50 text-blue-900',
      Work:      'bg-gray-100 text-gray-800',
      Secondary: 'bg-gray-100 text-gray-800',
      Emergency: 'bg-amber-50 text-amber-900',
    };
    return map[type] ?? 'bg-gray-100 text-gray-800';
  }

  hasContactFieldError(i: number, field: string): boolean {
    const ctrl = this.contacts.at(i)?.get(field);
    return !!(ctrl?.invalid && ctrl.touched);
  }

  trackById(_i: number, ticket: Ticket): number       { return ticket.id; }
  trackByMsgId(_i: number, msg: TicketMessage): number { return msg.message_id; }

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
