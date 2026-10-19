import {
  Component,
  DestroyRef,
  EventEmitter,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AppointmentService } from '../../../../services/appointment.service';
import { PatientService } from '../../../../services/patient.service';

interface PatientResult {
  patient_id: number;
  file_number: number;
  full_name: string;
  gender: string;
  date_of_birth: string;
  academic_id: number | null;
}

interface AppointmentTypeOption {
  type_id: number;
  type_name: string;
  duration: number;
}

interface DoctorOption {
  employee_id: number;
  doctor_name: string;
  specialization: string;
}

interface StudentOption {
  academic_id: number;
  first_name: string;
  middle_name: string;
  last_name: string;
  academic_level: number;
  employee_id: number;
}

type DayType = 'empty' | 'past' | 'weekend' | 'available' | 'busy' | 'selected' | 'unavailable';

interface CalendarDayCell {
  day: number;
  type: DayType;
}

@Component({
  standalone: false,
  selector: 'app-book-appointment-modal',
  templateUrl: './book-appointment-modal.component.html',
})
export class BookAppointmentModalComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();
  @Output() booked = new EventEmitter<void>();

  private apptService    = inject(AppointmentService);
  private patientService = inject(PatientService);
  private sanitizer      = inject(DomSanitizer);
  private destroyRef     = inject(DestroyRef);

  step: 1 | 2 | 3 = 1;
  isSaving  = false;
  saveError = '';

  // ── Step 1 ────────────────────────────────────────────────────
  patientSearchTerm  = '';
  searchResults: PatientResult[] = [];
  isDropdownVisible  = false;
  selectedPatient: PatientResult | null = null;
  selectedTypeId   = 0;
  selectedDoctorId = 0;

  // Student assignment
  studentSearchTerm      = '';
  studentSearchResults: StudentOption[] = [];
  isStudentDropdownVisible = false;
  selectedStudent: StudentOption | null = null;
  allStudents: StudentOption[] = [];
  supervisorAutoFilled  = false;
  showAutoFillBanner    = false;

  appointmentTypes: AppointmentTypeOption[] = [];
  doctors: DoctorOption[] = [];

  private searchSubject        = new Subject<string>();
  private studentSearchSubject = new Subject<string>();

  // ── Step 2 ────────────────────────────────────────────────────
  currentYear  = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1; // 1–12
  calendarDays: CalendarDayCell[] = [];
  availableDays: number[]  = [];
  busyDays: number[]       = [];
  noScheduleData           = false;
  selectedDay: number | null = null;
  timeSlots: string[] = [];
  selectedSlot  = '';
  isLoadingCalendar = false;
  isLoadingSlots    = false;

  readonly weekDayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.patientService.searchPatients(q)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (res: any) => { this.searchResults = res.data ?? []; },
      error: () => { this.searchResults = []; },
    });

    this.studentSearchSubject.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(q => {
      const lower = q.toLowerCase().trim();
      this.studentSearchResults = lower
        ? this.allStudents.filter(s =>
            `${s.first_name} ${s.last_name}`.toLowerCase().includes(lower) ||
            String(s.academic_id).includes(lower),
          )
        : this.allStudents.slice(0, 20);
    });

    this.loadLookups();
  }

  // ── Step 1 helpers ────────────────────────────────────────────

  loadLookups(): void {
    this.apptService.getAppointmentTypes().subscribe({
      next: (res: any) => {
        this.appointmentTypes = (res.data ?? []).map((t: any) => ({
          type_id: t.type_id, type_name: t.type_name, duration: t.duration,
        }));
      },
    });
    this.apptService.getDoctors().subscribe({
      next: (res: any) => {
        this.doctors = (res.data ?? []).map((d: any) => ({
          employee_id: d.employee_id,
          doctor_name: d.doctor_name,
          specialization: d.specialization ?? '',
        }));
      },
    });
    this.apptService.getStudents().subscribe({
      next: (res: any) => {
        this.allStudents = (res.data ?? []).map((s: any) => ({
          academic_id:   s.academic_id,
          first_name:    s.first_name,
          middle_name:   s.middle_name ?? '',
          last_name:     s.last_name,
          academic_level: s.academic_level,
          employee_id:   s.employee_id,
        }));
        this.studentSearchResults = this.allStudents.slice(0, 20);
      },
    });
  }

  // ── Patient search ────────────────────────────────────────────

  onSearchInput(value: string): void {
    this.patientSearchTerm = value;
    this.isDropdownVisible = true;
    this.searchSubject.next(value.trim());
  }

  onSearchFocus(): void {
    this.isDropdownVisible = true;
    this.searchSubject.next(this.patientSearchTerm.trim());
  }

  onSearchBlur(): void {
    setTimeout(() => { this.isDropdownVisible = false; }, 150);
  }

  selectPatient(p: PatientResult): void {
    this.selectedPatient   = p;
    this.patientSearchTerm = '';
    this.isDropdownVisible = false;
    this.searchResults     = [];

    // Pre-select the student assigned to this patient, if any.
    if (p.academic_id) {
      const assigned = this.allStudents.find(s => s.academic_id === p.academic_id);
      if (assigned) {
        this.selectStudent(assigned);
      }
    }
  }

  clearPatient(): void {
    this.selectedPatient   = null;
    this.patientSearchTerm = '';
    this.searchResults     = [];
  }

  highlightMatch(text: string, term: string): SafeHtml {
    const safe = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escaped = safe(text);
    if (!term.trim()) return this.sanitizer.bypassSecurityTrustHtml(escaped);
    const escapedTerm = safe(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const highlighted = escaped.replace(
      new RegExp(`(${escapedTerm})`, 'gi'),
      '<mark style="background:#FAEEDA;color:#633806;border-radius:2px;padding:0 1px">$1</mark>',
    );
    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }

  // ── Student search / selection ────────────────────────────────

  onStudentSearchInput(value: string): void {
    this.studentSearchTerm       = value;
    this.isStudentDropdownVisible = true;
    this.studentSearchSubject.next(value);
  }

  onStudentSearchFocus(): void {
    this.isStudentDropdownVisible = true;
    this.studentSearchSubject.next(this.studentSearchTerm);
  }

  onStudentSearchBlur(): void {
    setTimeout(() => { this.isStudentDropdownVisible = false; }, 150);
  }

  selectStudent(s: StudentOption): void {
    this.selectedStudent          = s;
    this.studentSearchTerm        = '';
    this.isStudentDropdownVisible = false;

    // Auto-fill supervisor from student's employee_id.
    this.selectedDoctorId    = s.employee_id;
    this.supervisorAutoFilled = true;
    this.showAutoFillBanner   = true;
  }

  clearStudent(): void {
    this.selectedStudent          = null;
    this.studentSearchTerm        = '';
    this.supervisorAutoFilled      = false;
    this.showAutoFillBanner        = false;
    this.studentSearchResults      = this.allStudents.slice(0, 20);
  }

  onDoctorChange(): void {
    // Receptionist manually changed the doctor — dismiss auto-fill state.
    if (this.supervisorAutoFilled) {
      this.supervisorAutoFilled = false;
      this.showAutoFillBanner   = false;
    }
  }

  studentLabel(s: StudentOption): string {
    return `${s.first_name} ${s.last_name} — Level ${s.academic_level} · #${s.academic_id}`;
  }

  get supervisorLabelText(): string {
    return this.selectedStudent ? 'Supervisor — Doctor' : 'Doctor';
  }

  get step1Valid(): boolean {
    return !!this.selectedPatient && this.selectedTypeId > 0 && this.selectedDoctorId > 0;
  }

  // ── Step 2 helpers ────────────────────────────────────────────

  goToStep2(): void {
    if (!this.step1Valid) return;
    this.step        = 2;
    this.selectedDay  = null;
    this.selectedSlot = '';
    this.loadAvailableDays();
  }

  loadAvailableDays(): void {
    this.isLoadingCalendar = true;
    this.availableDays     = [];
    this.busyDays          = [];
    this.noScheduleData    = false;
    this.apptService.getAvailableDays(this.selectedDoctorId, this.currentYear, this.currentMonth).subscribe({
      next: (res: any) => {
        this.availableDays  = res.data?.available ?? [];
        this.busyDays       = res.data?.busy       ?? [];
        this.noScheduleData = this.availableDays.length === 0 && this.busyDays.length === 0;
        this.isLoadingCalendar = false;
        this.buildCalendar();
      },
      error: () => {
        this.noScheduleData    = true;
        this.isLoadingCalendar = false;
        this.buildCalendar();
      },
    });
  }

  buildCalendar(): void {
    const firstDow    = new Date(this.currentYear, this.currentMonth - 1, 1).getDay();
    const daysInMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const today       = new Date();
    today.setHours(0, 0, 0, 0);

    const cells: CalendarDayCell[] = [];

    for (let i = 0; i < firstDow; i++) {
      cells.push({ day: 0, type: 'empty' });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(this.currentYear, this.currentMonth - 1, d);
      const dow  = date.getDay();

      if (date < today) {
        cells.push({ day: d, type: 'past' });
      } else if (dow === 0 || dow === 6) {
        cells.push({ day: d, type: 'weekend' });
      } else if (this.selectedDay === d) {
        cells.push({ day: d, type: 'selected' });
      } else if (this.noScheduleData) {
        cells.push({ day: d, type: 'available' });
      } else if (this.availableDays.includes(d)) {
        cells.push({ day: d, type: 'available' });
      } else if (this.busyDays.includes(d)) {
        cells.push({ day: d, type: 'busy' });
      } else {
        cells.push({ day: d, type: 'unavailable' });
      }
    }

    this.calendarDays = cells;
  }

  calendarDayClass(cell: CalendarDayCell): string {
    const base = 'flex items-center justify-center h-9 w-9 rounded-full text-sm font-medium mx-auto transition-colors ';
    switch (cell.type) {
      case 'empty':       return base + 'invisible pointer-events-none';
      case 'past':        return base + 'text-gray-300 cursor-not-allowed';
      case 'weekend':     return base + 'text-gray-300 cursor-not-allowed';
      case 'unavailable': return base + 'text-gray-300 cursor-not-allowed';
      case 'available':   return base + 'bg-[#E1F5EE] text-[#085041] cursor-pointer hover:opacity-75';
      case 'busy':        return base + 'text-gray-400 cursor-not-allowed line-through';
      case 'selected':    return base + 'bg-royal text-white cursor-default shadow-md';
      default:            return base;
    }
  }

  selectDay(cell: CalendarDayCell): void {
    if (cell.type !== 'available') return;
    this.selectedDay  = cell.day;
    this.selectedSlot = '';
    this.buildCalendar();
    this.loadAvailableSlots();
  }

  loadAvailableSlots(): void {
    if (!this.selectedDay) return;
    const dateStr   = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(this.selectedDay).padStart(2, '0')}`;
    const studentId = this.selectedStudent?.academic_id;
    this.isLoadingSlots = true;
    this.apptService.getAvailableSlots(this.selectedDoctorId, dateStr, this.selectedTypeId, studentId).subscribe({
      next: (res: any) => {
        this.timeSlots      = res.data?.slots ?? [];
        this.isLoadingSlots = false;
      },
      error: () => {
        this.timeSlots      = [];
        this.isLoadingSlots = false;
      },
    });
  }

  prevMonth(): void {
    if (this.currentMonth === 1) { this.currentMonth = 12; this.currentYear--; }
    else { this.currentMonth--; }
    this.selectedDay    = null;
    this.selectedSlot   = '';
    this.noScheduleData = false;
    this.loadAvailableDays();
  }

  nextMonth(): void {
    if (this.currentMonth === 12) { this.currentMonth = 1; this.currentYear++; }
    else { this.currentMonth++; }
    this.selectedDay    = null;
    this.selectedSlot   = '';
    this.noScheduleData = false;
    this.loadAvailableDays();
  }

  get step2Valid(): boolean {
    return !!this.selectedDay && !!this.selectedSlot;
  }

  // ── Step 3 helpers ────────────────────────────────────────────

  get selectedTypeName(): string {
    return this.appointmentTypes.find(t => t.type_id === +this.selectedTypeId)?.type_name ?? '';
  }

  get selectedDoctorName(): string {
    return this.doctors.find(d => d.employee_id === +this.selectedDoctorId)?.doctor_name ?? '';
  }

  get selectedDateLabel(): string {
    if (!this.selectedDay) return '';
    return new Date(this.currentYear, this.currentMonth - 1, this.selectedDay)
      .toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  get selectedMonthLabel(): string {
    return new Date(this.currentYear, this.currentMonth - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  confirmBooking(): void {
    if (!this.selectedPatient || !this.selectedDay || !this.selectedSlot) return;
    this.isSaving  = true;
    this.saveError = '';

    const dateStr              = `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}-${String(this.selectedDay).padStart(2, '0')}`;
    const appointmentStartTime = `${dateStr}T${this.selectedSlot}:00`;

    this.apptService.bookAppointment({
      patientId:            this.selectedPatient.patient_id,
      doctorId:             this.selectedDoctorId,
      appointmentTypeId:    this.selectedTypeId,
      appointmentStartTime,
      academicId:           this.selectedStudent?.academic_id ?? null,
    }).subscribe({
      next: () => {
        this.isSaving = false;
        this.booked.emit();
      },
      error: (err: any) => {
        this.isSaving  = false;
        this.saveError = err?.error?.error ?? 'Failed to book appointment.';
      },
    });
  }

  // ── Step indicator ────────────────────────────────────────────

  stepState(n: number): 'done' | 'active' | 'idle' {
    if (n < this.step) return 'done';
    if (n === this.step) return 'active';
    return 'idle';
  }

  stepCircleClass(n: number): string {
    const state = this.stepState(n);
    const base  = 'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ';
    if (state === 'done')   return base + 'bg-green-500 border-green-500 text-white';
    if (state === 'active') return base + 'bg-royal border-royal text-white';
    return base + 'bg-white border-gray-300 text-gray-400';
  }

  lineClass(afterStep: number): string {
    return 'flex-1 h-0.5 mx-1 transition-all ' + (this.step > afterStep ? 'bg-green-500' : 'bg-gray-200');
  }

  close(): void { this.closed.emit(); }
}
