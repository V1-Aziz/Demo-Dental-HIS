import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LiveClockComponent } from './live-clock/live-clock.component';
import { ExportModalComponent } from './export-modal/export-modal.component';
import { StatusBadgeComponent } from './components/status-badge/status-badge.component';
import { TabCardGroupComponent } from './components/tab-card-group/tab-card-group.component';

@NgModule({
  declarations: [],
  imports: [CommonModule, LiveClockComponent, ExportModalComponent, StatusBadgeComponent, TabCardGroupComponent],
  exports: [LiveClockComponent, ExportModalComponent, StatusBadgeComponent, TabCardGroupComponent],
})
export class SharedModule {}
