// Arrival check-in cell for the receptionist's Today's Appointments table.
// Standalone, OnPush. Handles all three arrival states plus the undo flow.
// Live "Late · 4m 32s" counter runs via interval(1000) and is cleaned up on destroy.
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, interval } from 'rxjs';
import { AppointmentService } from '../../../services/appointment.service';
import { AuthService } from '../../../services/auth.service';

export type ArrivalStatus = 'On Time' | 'Late' | 'No Show';

export interface ArrivalState {
  arrival_status: ArrivalStatus | null;
  arrived_at:     string | null;
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-arrival-cell',
  imports: [CommonModule],
  template: `
    <!-- POST-ARRIVAL: coloured pill + Undo -->
    @if (localStatus()) {
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Status pill -->
        <span [class]="pillClass()">
          <span class="material-symbols-outlined" style="font-size:13px">{{ pillIcon() }}</span>
          {{ pillLabel() }}
        </span>

        <!-- Undo button -->
        @if (canUndo()) {
          <button
            (click)="undo()"
            [disabled]="loading()"
            class="text-[11px] text-slate-400 underline hover:text-slate-700 transition-colors disabled:opacity-40"
            title="Undo arrival mark"
          >
            Undo
          </button>
        } @else {
          <span
            class="text-[11px] text-slate-300 cursor-default"
            title="Contact an admin to correct this"
          >Undo</span>
        }
      </div>
    }

    <!-- PRE-ARRIVAL: three action buttons -->
    @if (!localStatus()) {
      <div class="flex items-center gap-1.5 flex-wrap">
        <button
          (click)="mark('On Time')"
          [disabled]="loading()"
          class="px-2.5 py-1 rounded-md border border-green-300 text-green-700 text-[11px] font-semibold
                 hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-wait"
        >On Time</button>

        <button
          (click)="mark('Late')"
          [disabled]="loading()"
          class="px-2.5 py-1 rounded-md border border-amber-300 text-amber-700 text-[11px] font-semibold
                 hover:bg-amber-50 transition-colors disabled:opacity-40 disabled:cursor-wait"
        >
          @if (isPastStart() && elapsedSeconds() > 0) {
            Late · {{ formatElapsed(elapsedSeconds()) }}
          } @else {
            Late
          }
        </button>

        <button
          (click)="mark('No Show')"
          [disabled]="loading()"
          class="px-2.5 py-1 rounded-md border border-red-300 text-red-700 text-[11px] font-semibold
                 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-wait"
        >No Show</button>
      </div>
    }

    <!-- Inline error -->
    @if (errorMsg()) {
      <p class="text-[10px] text-red-600 mt-1">{{ errorMsg() }}</p>
    }
  `,
})
export class ArrivalCellComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) appointmentId!: number;
  @Input({ required: true }) startTime!: string;
  @Input() arrivalStatus: ArrivalStatus | null = null;
  @Input() arrivedAt: string | null = null;

  @Output() arrivalChanged = new EventEmitter<ArrivalState>();

  private apptService = inject(AppointmentService);
  private authService  = inject(AuthService);
  private cdr          = inject(ChangeDetectorRef);

  localStatus  = signal<ArrivalStatus | null>(null);
  localArrivedAt = signal<string | null>(null);
  loading      = signal(false);
  errorMsg     = signal<string | null>(null);
  elapsedSeconds = signal(0);

  private timerSub?: Subscription;
  private readonly isAdminUser = this.authService.getRole() === 'Admin';

  ngOnInit(): void {
    this.syncFromInputs();
    this.startTimer();
  }

  ngOnChanges(): void {
    this.syncFromInputs();
  }

  ngOnDestroy(): void {
    this.timerSub?.unsubscribe();
  }

  private syncFromInputs(): void {
    this.localStatus.set(this.arrivalStatus);
    this.localArrivedAt.set(this.arrivedAt);
  }

  private startTimer(): void {
    this.timerSub = interval(1000).subscribe(() => {
      if (!this.localStatus() && this.isPastStart()) {
        const elapsed = Math.floor((Date.now() - new Date(this.startTime).getTime()) / 1000);
        this.elapsedSeconds.set(Math.max(0, elapsed));
        this.cdr.markForCheck();
      }
    });
  }

  isPastStart(): boolean {
    return Date.now() > new Date(this.startTime).getTime();
  }

  mark(status: ArrivalStatus): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.apptService.markArrival(this.appointmentId, status).subscribe({
      next: (res: any) => {
        const data = res.data as { arrival_status: ArrivalStatus; arrived_at: string | null };
        this.localStatus.set(data?.arrival_status ?? status);
        this.localArrivedAt.set(data?.arrived_at ?? null);
        this.loading.set(false);
        this.arrivalChanged.emit({
          arrival_status: this.localStatus(),
          arrived_at:     this.localArrivedAt(),
        });
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = err?.error?.error ?? 'Failed to record arrival. Please try again.';
        this.errorMsg.set(msg);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  undo(): void {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.apptService.clearArrival(this.appointmentId).subscribe({
      next: () => {
        this.localStatus.set(null);
        this.localArrivedAt.set(null);
        this.loading.set(false);
        this.arrivalChanged.emit({ arrival_status: null, arrived_at: null });
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = err?.error?.error ?? 'Unable to undo. The window may have expired.';
        this.errorMsg.set(msg);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // Undo is available to Admin always, and to Receptionist within 5 min of
  // marking On Time / Late (arrived_at set).  No Show (arrived_at IS NULL)
  // is always undoable because there's no timestamp to compare against.
  canUndo(): boolean {
    if (this.isAdminUser) return true;
    const arrivedAt = this.localArrivedAt();
    if (!arrivedAt) return true; // No Show — no timestamp constraint
    const elapsedMs = Date.now() - new Date(arrivedAt).getTime();
    return elapsedMs <= 5 * 60 * 1000;
  }

  // ── Pill display helpers ──────────────────────────────────────────────────

  pillLabel(): string {
    const status  = this.localStatus();
    const arrived = this.localArrivedAt();
    if (!status) return '';
    const timeStr = arrived
      ? new Date(arrived).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

    if (status === 'On Time') return timeStr ? `On Time · ${timeStr}` : 'On Time';
    if (status === 'No Show') return 'No Show';
    // Late — compute late_by_minutes
    const start = new Date(this.startTime).getTime();
    const arr   = arrived ? new Date(arrived).getTime() : Date.now();
    const mins  = Math.floor((arr - start) / 60_000);
    return timeStr ? `Late · ${mins} min · ${timeStr}` : `Late · ${mins} min`;
  }

  pillClass(): string {
    const base = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ';
    switch (this.localStatus()) {
      case 'On Time': return base + 'bg-green-100 text-green-800 border-green-200';
      case 'Late':    return base + 'bg-amber-100 text-amber-800 border-amber-200';
      case 'No Show': return base + 'bg-red-100 text-red-800 border-red-200';
      default:        return base + 'bg-slate-100 text-slate-600 border-slate-200';
    }
  }

  pillIcon(): string {
    switch (this.localStatus()) {
      case 'On Time': return 'check_circle';
      case 'Late':    return 'schedule';
      case 'No Show': return 'cancel';
      default:        return '';
    }
  }

  formatElapsed(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
}
