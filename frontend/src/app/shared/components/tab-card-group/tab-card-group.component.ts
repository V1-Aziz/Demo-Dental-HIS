import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TabCard {
  value:    string;
  title:    string;
  subtitle: string;
}

@Component({
  selector:    'app-tab-card-group',
  standalone:  true,
  imports:     [CommonModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <button *ngFor="let tab of tabs"
              (click)="tabChange.emit(tab.value)"
              [class]="'px-4 py-2.5 rounded-lg text-left border-2 transition-all duration-300 ' +
                       (activeTab === tab.value
                         ? 'border-gold shadow-[0_4px_14px_0_rgba(214,158,46,0.2)]'
                         : 'border-slate-200 hover:border-slate-300')">
        <h3 [class]="'font-bold text-sm ' + (activeTab === tab.value ? 'text-royal' : 'text-gray-600')">
          {{ tab.title }}
        </h3>
        <p class="text-xs text-gray-500">{{ tab.subtitle }}</p>
      </button>
    </div>
  `,
})
export class TabCardGroupComponent {
  @Input() tabs:      TabCard[] = [];
  @Input() activeTab = '';
  @Output() tabChange = new EventEmitter<string>();
}
