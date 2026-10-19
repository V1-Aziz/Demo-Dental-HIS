import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreeningService } from '../../../../services/screening.service';
import { Screening } from '../../../types/screening.types';

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-screening-lightbox',
  template: `
    <div class="lb-backdrop" (click)="close.emit()">
      <button class="lb-nav lb-prev" (click)="$event.stopPropagation(); navigate.emit('prev')">‹</button>

      <div class="lb-content" (click)="$event.stopPropagation()">
        <header class="lb-header">
          <div>
            <div class="lb-title">
              {{ screening.image_type }}
              <span *ngIf="screening.tooth_numbers"> · Tooth {{ screening.tooth_numbers }}</span>
            </div>
            <div class="lb-sub">
              Uploaded {{ screening.uploaded_at | date:'mediumDate' }} · {{ screening.uploaded_at | date:'shortTime' }}
              · {{ screening.uploaded_by_name }} ({{ screening.uploaded_by_role }})
            </div>
          </div>
          <button class="lb-close" (click)="close.emit()" aria-label="Close">×</button>
        </header>
        <div class="lb-img-wrapper">
          <img *ngIf="objectUrl" [src]="objectUrl" [alt]="screening.image_type" class="lb-img" />
          <div *ngIf="!objectUrl" class="lb-loading">Loading…</div>
        </div>
        <div *ngIf="screening.notes" class="lb-notes">{{ screening.notes }}</div>
      </div>

      <button class="lb-nav lb-next" (click)="$event.stopPropagation(); navigate.emit('next')">›</button>
    </div>
  `,
  styles: [`
    .lb-backdrop {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.9);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; z-index: 90;
    }
    .lb-content {
      max-width: 90vw; max-height: 90vh;
      display: flex; flex-direction: column; gap: 12px;
    }
    .lb-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      color: #fff; padding: 0 4px;
    }
    .lb-title { font-weight: 700; font-size: 1rem; }
    .lb-sub { font-size: 0.78rem; color: #cbd5e1; margin-top: 2px; }
    .lb-close {
      background: none; border: none; font-size: 1.8rem;
      color: #e2e8f0; cursor: pointer; line-height: 1;
    }
    .lb-img-wrapper {
      display: flex; align-items: center; justify-content: center;
      max-height: 85vh;
    }
    .lb-img { max-width: 100%; max-height: 85vh; object-fit: contain; }
    .lb-loading { color: #cbd5e1; font-size: 0.9rem; padding: 80px; }
    .lb-notes {
      background: rgba(255, 255, 255, 0.1); color: #f8fafc;
      padding: 10px 12px; border-radius: 6px; font-size: 0.85rem;
      max-width: 640px;
    }
    .lb-nav {
      background: rgba(255, 255, 255, 0.12); color: #fff;
      border: none; cursor: pointer; font-size: 2rem;
      width: 44px; height: 44px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 12px;
    }
    .lb-nav:hover { background: rgba(255, 255, 255, 0.25); }
  `],
})
export class ScreeningLightboxComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) screening!: Screening;
  @Output() close    = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<'prev' | 'next'>();

  objectUrl: string | null = null;
  private lastId: number | null = null;

  constructor(private screeningService: ScreeningService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['screening'] && this.screening.image_id !== this.lastId) {
      this.revokeCurrent();
      this.lastId = this.screening.image_id;
      this.screeningService.fetchAsObjectUrl(this.screening.image_id).subscribe({
        next: (url) => { this.objectUrl = url; },
        error: () => { this.objectUrl = null; },
      });
    }
  }

  ngOnDestroy(): void { this.revokeCurrent(); }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape')     this.close.emit();
    if (ev.key === 'ArrowLeft')  this.navigate.emit('prev');
    if (ev.key === 'ArrowRight') this.navigate.emit('next');
  }

  private revokeCurrent(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
