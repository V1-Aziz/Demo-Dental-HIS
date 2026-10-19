import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AppointmentService } from '../../../services/appointment.service';

type ModalMode = 'edit';

interface Appointment {
  id: number;
  patientName: string;
  patientId: number;
  fileNo: string;
  procedure: string;
  typeId: number;
  assignedDr: string;
  doctorId: number;
  clinic: string;
  clinicId: number | null;
  time: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  academicId: number | null;
  studentName: string | null;
  studentLevel: number | null;
}

interface AppointmentType {
  id: number;
  name: string;
  duration: number;
}

interface Doctor {
  id: number;
  name: string;
}

@Component({
  standalone: false,
  selector: 'app-receptionist-scheduling',
  templateUrl: './receptionist-scheduling.component.html',
})
export class ReceptionistSchedulingComponent implements OnInit, OnDestroy {
  searchTerm = '';
  selectedAppointment: Appointment | null = null;

  // ── Filter popup ─────────────────────────────────────────────────
  filterPopupOpen = false;
  draft = {
    status:   '',
    dateMode: 'specific' as 'specific' | 'range',
    date:     '',
    dateFrom: '',
    dateTo:   '',
  };
  applied = { ...this.draft };

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  readonly statusOptions = [
    { label: 'All',         value: ''           },
    { label: 'Scheduled',   value: 'Scheduled'  },
    { label: 'Checked-In',  value: 'Checked-In' },
    { label: 'Completed',   value: 'Completed'  },
    { label: 'Canceled',    value: 'Canceled'   },
    { label: 'No Show',     value: 'No Show'    },
  ];

  // Book modal (new 3-step)
  isBookModalOpen = false;

  // Edit modal (existing single-form)
  isEditModalOpen = false;
  modalMode: ModalMode = 'edit';
  isSaving  = false;
  saveError = '';

  // Status update loading flag
  isUpdatingStatus = false;

  // Toast
  showToast    = false;
  toastMessage = '';

  // ── Pagination ────────────────────────────────────────────────
  currentPage   = 1;
  pageSize      = 10;
  totalRows     = 0;
  readonly pageSizeOptions = [10, 25, 50];

  appointments: Appointment[]         = [];
  appointmentTypes: AppointmentType[] = [];
  doctors: Doctor[]                   = [];

  form = {
    appointmentTypeId: 0,
    doctorId:          0,
    startDateTime:     '',
  };

  constructor(
    private appointmentService: AppointmentService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const search = this.route.snapshot.queryParamMap.get('search');
    if (search) this.searchTerm = search;
    this.loadAppointments();
    this.loadLookups();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  onSearchChange(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.currentPage = 1;
      this.loadAppointments();
    }, 350);
  }

  // ── Filter popup ─────────────────────────────────────────────────
  openFilterPopup(): void { this.draft = { ...this.applied }; this.filterPopupOpen = true; }
  closeFilterPopup(): void { this.filterPopupOpen = false; }

  applyFilters(): void {
    this.applied = { ...this.draft };
    this.filterPopupOpen = false;
    this.currentPage = 1;
    this.loadAppointments();
  }

  clearAllFilters(): void {
    const def = { status: '', dateMode: 'specific' as const, date: '', dateFrom: '', dateTo: '' };
    this.draft = { ...def };
    this.applied = { ...def };
    this.filterPopupOpen = false;
    this.currentPage = 1;
    this.loadAppointments();
  }

  get hasActiveFilters(): boolean {
    const a = this.applied;
    return !!a.status || !!a.date || !!a.dateFrom || !!a.dateTo;
  }

  loadAppointments(): void {
    const a = this.applied;
    const params: { date?: string; dateFrom?: string; dateTo?: string; status?: string; search?: string; limit?: number; page?: number } = {};
    if (a.dateMode === 'specific' && a.date) params.date = a.date;
    if (a.dateMode === 'range' && a.dateFrom) params.dateFrom = a.dateFrom;
    if (a.dateMode === 'range' && a.dateTo)   params.dateTo   = a.dateTo;
    if (a.status) params.status = a.status;
    if (this.searchTerm.trim()) params.search = this.searchTerm.trim();
    params.limit = this.pageSize;
    params.page  = this.currentPage;

    this.appointmentService.getAppointments(params).subscribe({
      next: (res: any) => {
        this.totalRows = res.data?.total ?? 0;
        this.appointments = (res.data?.rows ?? []).map((r: any) => {
          const start = r.appointment_start_time ? new Date(r.appointment_start_time) : null;
          const end   = r.appointment_end_time   ? new Date(r.appointment_end_time)   : null;
          return {
            id:           r.appointment_id,
            patientName:  r.patient_name ?? '—',
            patientId:    r.patient_id ?? 0,
            fileNo:       String(r.file_number ?? ''),
            procedure:    r.type_name ?? '—',
            typeId:       r.appointment_type_id ?? 0,
            assignedDr:   r.doctor_name ?? '—',
            doctorId:     r.doctor_id ?? 0,
            clinic:       r.clinic_name ?? '—',
            clinicId:     r.clinic_id ?? null,
            time:         start ? start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
            date:         start ? start.toLocaleDateString() : '—',
            startTime:    start ? start.toISOString().slice(0, 16) : '',
            endTime:      end   ? end.toISOString().slice(0, 16)   : '',
            status:       r.status ?? 'Scheduled',
            academicId:   r.academic_id ?? null,
            studentName:  r.student_name ?? null,
            studentLevel: r.student_level ?? null,
          };
        });
        // Keep the detail panel in sync when the selected row was refreshed
        if (this.selectedAppointment) {
          const refreshed = this.appointments.find(a => a.id === this.selectedAppointment!.id);
          if (refreshed) this.selectedAppointment = refreshed;
        }
      },
      error: () => { this.appointments = []; this.totalRows = 0; },
    });
  }

  loadLookups(): void {
    this.appointmentService.getAppointmentTypes().subscribe({
      next: (res: any) => {
        this.appointmentTypes = (res.data ?? []).map((t: any) => ({
          id: t.type_id, name: t.type_name, duration: t.duration,
        }));
      },
    });
    this.appointmentService.getDoctors().subscribe({
      next: (res: any) => {
        this.doctors = (res.data ?? []).map((d: any) => ({
          id: d.employee_id, name: d.doctor_name,
        }));
      },
    });
  }

  // Server-side result is already filtered — expose directly
  get pagedAppointments(): Appointment[] { return this.appointments; }
  get totalFiltered(): number            { return this.totalRows; }
  get totalPages(): number               { return Math.max(1, Math.ceil(this.totalRows / this.pageSize)); }
  get pageRangeStart(): number           { return this.totalRows === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  get pageRangeEnd(): number             { return Math.min(this.currentPage * this.pageSize, this.totalRows); }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.loadAppointments();
  }

  onPageSizeChange(size: number | string): void {
    this.pageSize    = +size;
    this.currentPage = 1;
    this.loadAppointments();
  }

  // ── Status update (Check-In / No-Show) ───────────────────────────

  updateApptStatus(appt: Appointment, newStatus: 'Checked-In' | 'No Show', event?: Event): void {
    if (event) event.stopPropagation();
    if (this.isUpdatingStatus) return;

    // 'In Progress' is the DB-stored value for a checked-in patient.
    // We display it as "Checked-In" in the UI but send 'In Progress' to the API.
    const dbStatus = newStatus === 'Checked-In' ? 'In Progress' : newStatus;

    const previousStatus = appt.status;
    // Optimistic update — store the UI label, not the DB value
    appt.status = newStatus === 'Checked-In' ? 'In Progress' : newStatus;
    if (this.selectedAppointment?.id === appt.id) {
      this.selectedAppointment = { ...appt };
    }

    this.isUpdatingStatus = true;
    this.appointmentService.updateStatus(appt.id, dbStatus).subscribe({
      next: () => {
        this.isUpdatingStatus = false;
        const label = newStatus === 'Checked-In' ? 'Marked as Checked-In' : 'Marked as No-Show';
        this.triggerToast(label);
      },
      error: (err: any) => {
        // Revert optimistic update
        appt.status = previousStatus;
        if (this.selectedAppointment?.id === appt.id) {
          this.selectedAppointment = { ...appt };
        }
        this.isUpdatingStatus = false;
        const msg = err?.error?.error ?? 'Failed to update status.';
        this.triggerToast(msg, true);
      },
    });
  }

  // ── Book modal ────────────────────────────────────────────────

  onAppointmentBooked(): void {
    this.isBookModalOpen = false;
    this.loadAppointments();
    this.triggerToast('Appointment booked successfully.');
  }

  triggerToast(msg: string, isError = false): void {
    this.toastMessage = msg;
    this.showToast    = true;
    this._toastError  = isError;
    setTimeout(() => { this.showToast = false; }, 3500);
  }

  _toastError = false;

  // ── Edit modal ────────────────────────────────────────────────

  get calculatedEndTime(): string {
    if (!this.form.startDateTime || !this.form.appointmentTypeId) return '';
    const type = this.appointmentTypes.find(t => t.id === +this.form.appointmentTypeId);
    if (!type) return '';
    const end = new Date(this.form.startDateTime);
    end.setMinutes(end.getMinutes() + type.duration);
    return end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  openEditModal(): void {
    if (!this.selectedAppointment) return;
    const a = this.selectedAppointment;
    this.form = {
      appointmentTypeId: a.typeId,
      doctorId:          a.doctorId,
      startDateTime:     a.startTime,
    };
    this.saveError     = '';
    this.isEditModalOpen = true;
  }

  saveEdit(): void {
    this.saveError = '';
    if (!this.form.appointmentTypeId || !this.form.doctorId || !this.form.startDateTime) {
      this.saveError = 'Please fill in all required fields.';
      return;
    }

    const type = this.appointmentTypes.find(t => t.id === +this.form.appointmentTypeId);
    if (!type) { this.saveError = 'Invalid appointment type.'; return; }

    const start = new Date(this.form.startDateTime);
    const end   = new Date(this.form.startDateTime);
    end.setMinutes(end.getMinutes() + type.duration);

    this.isSaving = true;
    this.appointmentService.updateAppointment(this.selectedAppointment!.id, {
      doctorId:             +this.form.doctorId,
      appointmentTypeId:    +this.form.appointmentTypeId,
      appointmentStartTime: start.toISOString(),
      appointmentEndTime:   end.toISOString(),
    }).subscribe({
      next: () => {
        this.isEditModalOpen = false;
        this.isSaving        = false;
        this.loadAppointments();
        this.triggerToast('Appointment updated.');
      },
      error: (err: any) => {
        this.saveError = err?.error?.error ?? 'Failed to update appointment.';
        this.isSaving  = false;
      },
    });
  }

  cancelAppointment(): void {
    if (!this.selectedAppointment) return;
    this.appointmentService.updateStatus(this.selectedAppointment.id, 'Canceled').subscribe({
      next: () => {
        this.selectedAppointment = null;
        this.loadAppointments();
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      'Scheduled':  'text-xs font-semibold rounded-full px-2 py-1',
      'Checked-In': 'text-xs font-semibold rounded-full px-2 py-1',
      'No Show':    'text-xs font-semibold rounded-full px-2 py-1',
      'Completed':  'text-xs font-semibold rounded-full px-2 py-1',
      'Canceled':   'text-xs font-semibold rounded-full px-2 py-1',
    };
    return map[status] ?? 'text-xs font-semibold rounded-full px-2 py-1';
  }

  // 'In Progress' is the DB value for a checked-in patient — show identical badge
  statusLabel(status: string): string {
    return status === 'In Progress' ? 'Checked-In' : status;
  }

  statusStyle(status: string): Record<string, string> {
    const map: Record<string, Record<string, string>> = {
      'Scheduled':   { background: '#EAF3DE', color: '#27500A' },
      'In Progress': { background: '#E6F1FB', color: '#0C447C' },
      'No Show':     { background: '#FCEBEB', color: '#791F1F' },
      'Completed':   { background: '#EAF3DE', color: '#27500A' },
      'Canceled':    { background: '#FEF3C7', color: '#92400E' },
    };
    return map[status] ?? { background: '#F3F4F6', color: '#374151' };
  }
}
